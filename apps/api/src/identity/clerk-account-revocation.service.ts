import { Injectable, Optional } from '@nestjs/common';
import { createClerkClient } from '@clerk/backend';
import { validateEnv, type AppConfig } from '../common/config/env.validation';
import { AccountLifecycleRepository } from './account-lifecycle.repository';
import type {
  ProviderRevocation,
  ProviderRevocationResult,
} from './account-lifecycle.types';
import type { TombstoneRevocationOutcome } from '@prisma/client';

/** Bounded retry budget; provider errors are always retryable, never authorizing. */
export const MAX_REVOCATION_ATTEMPTS = 3;

type DeleteUser = (userId: string) => Promise<unknown>;

/** Injectable Clerk seam so tests need no credentials or network. */
export interface ClerkClientFactory {
  (options: { secretKey: string }): { users: { deleteUser: DeleteUser } };
}

const defaultFactory: ClerkClientFactory = (options) => createClerkClient(options);

/**
 * Map any provider error to a small stable class. No raw message, token,
 * secret, subject or email may be recorded or logged (T-08-04/T-08-06).
 */
export function classifyProviderError(error: unknown): string {
  if (error !== null && typeof error === 'object') {
    const status = (error as { status?: unknown }).status;
    if (status === 401 || status === 403) return 'PROVIDER_AUTH_CONFIG';
    if (status === 404) return 'PROVIDER_USER_NOT_FOUND';
    if (status === 429) return 'PROVIDER_RATE_LIMITED';
    if (typeof status === 'number' && status >= 500) return 'PROVIDER_SERVER_ERROR';
  }
  return 'PROVIDER_NETWORK_OR_UNKNOWN';
}

/**
 * Attempts the owner-selected provider-side account/session revocation AFTER
 * the local anonymization commit. On failure the person stays locked out
 * locally: the committed tombstone is authoritative and a provider error is
 * only recorded (never treated as permission to restore access).
 */
@Injectable()
export class ClerkAccountRevocationService implements ProviderRevocation {
  private readonly secretKey: string;
  private readonly client: { users: { deleteUser: DeleteUser } };

  constructor(
    private readonly repository: AccountLifecycleRepository,
    @Optional() config?: Pick<AppConfig, 'clerkSecretKey'>,
    @Optional() factory?: ClerkClientFactory,
  ) {
    const resolved = config ?? validateEnv();
    this.secretKey = resolved.clerkSecretKey;
    this.client = (factory ?? defaultFactory)({ secretKey: this.secretKey });
  }

  async revoke(
    userId: string,
    clerkSubject: string,
    subjectDigest: string,
  ): Promise<ProviderRevocationResult> {
    let lastErrorCode: string | null = null;

    for (let attempt = 1; attempt <= MAX_REVOCATION_ATTEMPTS; attempt += 1) {
      let revoked = false;
      try {
        await this.client.users.deleteUser(clerkSubject);
        revoked = true;
      } catch (error: unknown) {
        lastErrorCode = classifyProviderError(error);
      }
      if (revoked) {
        await this.record(userId, subjectDigest, 'REVOKED', attempt, null);
        return { outcome: 'REVOKED', attempts: attempt, errorCode: null };
      }
    }

    // Exhausted: fail closed. Local denial remains; only bookkeeping changes.
    await this.record(userId, subjectDigest, 'FAILED', MAX_REVOCATION_ATTEMPTS, lastErrorCode);
    return {
      outcome: 'FAILED',
      attempts: MAX_REVOCATION_ATTEMPTS,
      errorCode: lastErrorCode,
    };
  }

  private async record(
    userId: string,
    subjectDigest: string,
    outcome: TombstoneRevocationOutcome,
    attempts: number,
    errorCode: string | null,
  ): Promise<void> {
    await this.repository.recordProviderOutcome(userId, subjectDigest, outcome, attempts, errorCode);
  }
}
