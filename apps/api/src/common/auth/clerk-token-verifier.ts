import { verifyToken } from '@clerk/backend';
import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { validateEnv } from '../config/env.validation';
import {
  parseWebOrigins,
  type ClerkTokenVerifier,
  type VerifiedClerkIdentity,
} from './auth.types';

/**
 * The custom signed session claims required for provisioning. These are NOT
 * part of Clerk's default session token and must be configured in the Clerk
 * JWT template; every value is parsed from `unknown` and checked here.
 */
const CLAIM_PRIMARY_EMAIL = 'primaryEmail';
const CLAIM_DISPLAY_NAME = 'displayName';
const CLAIM_EMAIL_VERIFIED = 'emailVerified';

const AUTHENTICATION_FAILED = 'Authentication is required.';
const PROFILE_INCOMPLETE = 'The signed-in profile is incomplete.';

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Verifies Clerk-issued bearer tokens with the OFFICIAL `@clerk/backend`
 * `verifyToken()` using the configured networkless JWT public key and an
 * explicit authorized-parties allowlist. No decode-only path, no Backend API
 * call per request, and no logging of tokens, secrets or profile values.
 */
@Injectable()
export class ClerkTokenVerifierService implements ClerkTokenVerifier {
  private readonly jwtKey: string;
  private readonly authorizedParties: readonly string[];

  constructor() {
    const config = validateEnv();
    this.jwtKey = config.clerkJwtKey;
    this.authorizedParties = parseWebOrigins(config.clerkWebOrigin);
  }

  async verify(token: string): Promise<VerifiedClerkIdentity> {
    if (typeof token !== 'string' || token.trim().length === 0) {
      throw new UnauthorizedException(AUTHENTICATION_FAILED);
    }

    let claims: Record<string, unknown>;
    try {
      const payload = await verifyToken(token, {
        jwtKey: this.jwtKey,
        authorizedParties: [...this.authorizedParties],
      });
      if (payload === undefined || payload === null) {
        throw new Error('empty verified payload');
      }
      claims = payload as unknown as Record<string, unknown>;
    } catch {
      // Verification failures never reveal why or echo the token/profile.
      throw new UnauthorizedException(AUTHENTICATION_FAILED);
    }

    const clerkUserId = nonEmptyString(claims['sub']);
    if (clerkUserId === undefined) {
      throw new UnauthorizedException(AUTHENTICATION_FAILED);
    }

    // Distinguish an authenticated-but-incomplete profile (403) from failed
    // authentication (401) without revealing which local account exists.
    const displayName = nonEmptyString(claims[CLAIM_DISPLAY_NAME]);
    if (displayName === undefined) {
      throw new ForbiddenException(PROFILE_INCOMPLETE);
    }

    const email = nonEmptyString(claims[CLAIM_PRIMARY_EMAIL]) ?? '';
    const emailVerified = claims[CLAIM_EMAIL_VERIFIED] === true;

    return Object.freeze<VerifiedClerkIdentity>({
      clerkUserId,
      email,
      displayName,
      emailVerified,
    });
  }
}
