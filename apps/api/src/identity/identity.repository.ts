import { createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { ApplicationCapability } from '../common/auth/auth.types';
import { PrismaService } from '../common/database/prisma.service';

/**
 * Keyed permanent tombstone digest (owner resolution 2026-11-17): an HMAC of
 * the Clerk external subject with a server-side secret. No raw Clerk subject,
 * email or other PII is ever stored in the tombstone table. Plan 08 writes the
 * same digest in the same transaction as anonymization.
 */
export function subjectDigestFor(clerkSubject: string, tombstoneSecret: string): string {
  return createHmac('sha256', tombstoneSecret).update(clerkSubject, 'utf8').digest('hex');
}

export interface LocalUserRecord {
  readonly id: string;
  readonly clerkSubject: string | null;
  readonly email: string | null;
  readonly displayName: string | null;
  readonly lifecycleStatus: 'ACTIVE' | 'CLOSURE_REQUESTED' | 'CLOSURE_ACCEPTED' | 'ANONYMIZED';
  readonly capabilities: ReadonlyArray<{ readonly capability: ApplicationCapability }>;
}

export interface CreateLocalUserInput {
  readonly clerkSubject: string;
  readonly email: string;
  readonly displayName: string;
  readonly grantAdmin: boolean;
}

const USER_SELECT = {
  id: true,
  clerkSubject: true,
  email: true,
  displayName: true,
  lifecycleStatus: true,
  capabilities: { select: { capability: true } },
} as const;

/**
 * Focused data access for local identity. Deliberately not a generic base
 * repository: the unique-subject conflict handling and capability writes are
 * the behaviour that matters here (CODING_CONVENTIONS.md).
 */
@Injectable()
export class IdentityRepository {
  constructor(private readonly prisma: PrismaService) {}

  async isTombstoned(subjectDigest: string): Promise<boolean> {
    const row = await this.prisma.identityTombstone.findUnique({
      where: { subjectDigest },
      select: { id: true },
    });
    return row !== null;
  }

  async findByClerkSubject(clerkSubject: string): Promise<LocalUserRecord | undefined> {
    const row = await this.prisma.user.findUnique({
      where: { clerkSubject },
      select: USER_SELECT,
    });
    return row ?? undefined;
  }

  /** Atomic create: the baseline and optional admin capability are written together. */
  async createUser(input: CreateLocalUserInput): Promise<LocalUserRecord> {
    return this.prisma.user.create({
      data: {
        clerkSubject: input.clerkSubject,
        email: input.email,
        displayName: input.displayName,
        capabilities: {
          create: [
            { capability: 'CUSTOMER' as const },
            ...(input.grantAdmin ? [{ capability: 'ADMIN' as const }] : []),
          ],
        },
      },
      include: { capabilities: { select: { capability: true } } },
    });
  }

  /** Conditional write: only issue an UPDATE when the verified copy actually changed. */
  async refreshProfile(userId: string, email: string, displayName: string): Promise<void> {
    await this.prisma.user.updateMany({
      where: {
        id: userId,
        OR: [{ email: { not: email } }, { displayName: { not: displayName } }],
      },
      data: { email, displayName },
    });
  }

  async grantCapability(userId: string, capability: ApplicationCapability): Promise<void> {
    await this.prisma.userCapability.upsert({
      where: { userId_capability: { userId, capability } },
      create: { userId, capability },
      update: {},
    });
  }

  async revokeCapability(userId: string, capability: ApplicationCapability): Promise<void> {
    await this.prisma.userCapability.deleteMany({ where: { userId, capability } });
  }
}
