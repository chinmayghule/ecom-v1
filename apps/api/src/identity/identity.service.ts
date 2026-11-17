import { Injectable, UnauthorizedException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  type ApplicationCapability,
  type AuthenticatedUser,
  type IdentityResolver,
} from '../common/auth/auth.types';
import {
  validateEnv,
  type AppConfig,
} from '../common/config/env.validation';
import { isAdminOnFirstCreate } from './admin-bootstrap.policy';
import { IdentityRepository, subjectDigestFor, type LocalUserRecord } from './identity.repository';
import type {
  ResolvedIdentity,
  ResolveVerifiedIdentityInput,
  UserProfile,
} from './identity.types';

/** The config slice this module owns. */
export type IdentityConfig = Pick<AppConfig, 'adminEmails' | 'tombstoneSecret'>;

const AUTHENTICATION_FAILED = 'Authentication is required.';

const CAPABILITY_ORDER: readonly ApplicationCapability[] = ['CUSTOMER', 'MERCHANT', 'ADMIN'];

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function toAuthenticatedUser(record: LocalUserRecord): AuthenticatedUser {
  const capabilities = record.capabilities
    .map((row) => row.capability)
    .sort((a, b) => CAPABILITY_ORDER.indexOf(a) - CAPABILITY_ORDER.indexOf(b));
  return Object.freeze<AuthenticatedUser>({
    id: record.id,
    clerkUserId: record.clerkSubject ?? '',
    email: record.email,
    displayName: record.displayName,
    capabilities: Object.freeze(capabilities),
  });
}

/**
 * Resolves a verified Clerk identity into exactly one local application user.
 *
 * First create is conflict-safe through the unique Clerk-subject constraint:
 * concurrent requests that lose the insert race fall back to a read of the
 * winner. Admin is granted only in the create branch from the verified-email
 * allowlist; later requests refresh only the local profile copies.
 */
@Injectable()
export class IdentityService implements IdentityResolver {
  private readonly adminEmails: readonly string[];
  private readonly tombstoneSecret: string;

  constructor(
    private readonly repository: IdentityRepository,
    @Optional() config?: IdentityConfig,
  ) {
    const resolved = config ?? validateEnv();
    this.adminEmails = resolved.adminEmails;
    this.tombstoneSecret = resolved.tombstoneSecret;
  }

  async resolveVerifiedIdentity(input: ResolveVerifiedIdentityInput): Promise<ResolvedIdentity> {
    const { identity } = input;

    // A permanent keyed tombstone denies a deleted subject before any local
    // profile is read or provisioned (owner resolution 2026-11-17).
    const digest = subjectDigestFor(identity.clerkUserId, this.tombstoneSecret);
    if (await this.repository.isTombstoned(digest)) {
      throw new UnauthorizedException(AUTHENTICATION_FAILED);
    }

    const existing = await this.repository.findByClerkSubject(identity.clerkUserId);
    if (existing !== undefined) {
      // Staged closure (owner resolution) keeps CLOSURE_REQUESTED /
      // CLOSURE_ACCEPTED merchants able to sign in for restricted completion
      // and refund work. Only a finalized (ANONYMIZED) identity is denied
      // locally; the keyed tombstone above denies deleted subjects first.
      if (existing.lifecycleStatus === 'ANONYMIZED') {
        throw new UnauthorizedException(AUTHENTICATION_FAILED);
      }
      await this.repository.refreshProfile(existing.id, identity.email, identity.displayName);
      const refreshed = await this.repository.findByClerkSubject(identity.clerkUserId);
      if (refreshed === undefined || refreshed.lifecycleStatus === 'ANONYMIZED') {
        throw new UnauthorizedException(AUTHENTICATION_FAILED);
      }
      return { user: toAuthenticatedUser(refreshed), created: false };
    }

    const grantAdmin = isAdminOnFirstCreate(
      identity.email,
      identity.emailVerified,
      this.adminEmails,
    );

    let created: LocalUserRecord;
    try {
      created = await this.repository.createUser({
        clerkSubject: identity.clerkUserId,
        email: identity.email,
        displayName: identity.displayName,
        grantAdmin,
      });
    } catch (error: unknown) {
      if (!isUniqueViolation(error)) throw error;
      // Another concurrent first request won the insert race; read the one
      // durable local user instead of failing closed on a benign conflict.
      const raced = await this.repository.findByClerkSubject(identity.clerkUserId);
      if (raced === undefined || raced.lifecycleStatus === 'ANONYMIZED') {
        throw new UnauthorizedException(AUTHENTICATION_FAILED);
      }
      return { user: toAuthenticatedUser(raced), created: false };
    }
    return { user: toAuthenticatedUser(created), created: true };
  }

  /**
   * Thin, server-derived projection for the current-profile endpoint.
   *
   * Copies only the allowed fields; the Clerk subject and all lifecycle,
   * tombstone and provider internals never leave this boundary.
   */
  currentProfile(user: AuthenticatedUser): UserProfile {
    return Object.freeze<UserProfile>({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      capabilities: Object.freeze([...user.capabilities]),
    });
  }

  /** Explicit local admin/capability operations for later administrative use. */
  async grantCapability(userId: string, capability: ApplicationCapability): Promise<void> {
    await this.repository.grantCapability(userId, capability);
  }

  async revokeCapability(userId: string, capability: ApplicationCapability): Promise<void> {
    await this.repository.revokeCapability(userId, capability);
  }
}
