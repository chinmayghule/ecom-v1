import {
  ConflictException,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../common/auth/auth.types';
import { validateEnv } from '../common/config/env.validation';
import { subjectDigestFor } from './identity.repository';
import { AccountLifecycleRepository } from './account-lifecycle.repository';
import {
  PROVIDER_REVOCATION,
  type AccountDeletionResult,
  type AccountLifecycleConfig,
  type ProviderRevocation,
} from './account-lifecycle.types';

/** Anonymization temporarily denies a subject that has no resolvable local identity. */
const AUTHENTICATION_FAILED = 'Authentication is required.';
/** A conflicting tombstone does not prove the local PII was actually cleared. */
const LOCAL_ANONYMIZATION_INCOMPLETE = 'Local anonymization could not be confirmed.';

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Implements the owner-approved identity lifecycle:
 *
 *  - no outstanding obligations -> one local transaction anonymizes the
 *    profile and writes the keyed permanent tombstone (stable local id and
 *    all store/order references preserved);
 *  - outstanding obligations -> staged closure: stop new sales, retain the
 *    restricted completion capability, and do NOT anonymize early;
 *  - provider revocation is attempted only AFTER the local commit. A failure
 *    is recorded and returned as a conflict but never restores local access,
 *    because the committed tombstone is the authoritative deny marker.
 *
 * No legal retention period or new lifecycle state is introduced.
 */
@Injectable()
export class AccountLifecycleService {
  private readonly tombstoneSecret: string;

  constructor(
    private readonly repository: AccountLifecycleRepository,
    @Inject(PROVIDER_REVOCATION) private readonly revoker: ProviderRevocation,
    @Optional() config?: AccountLifecycleConfig,
  ) {
    this.tombstoneSecret = (config ?? validateEnv()).tombstoneSecret;
  }

  async deleteAccount(user: AuthenticatedUser): Promise<AccountDeletionResult> {
    const status = await this.repository.currentStatus(user.id);
    if (status === 'ANONYMIZED') {
      // Idempotent: an already-finalized subject cannot have a new local user.
      return { code: 'ACCOUNT_ANONYMIZED', lifecycleStatus: 'ANONYMIZED' };
    }
    if (user.clerkUserId.length === 0) {
      // No verified external subject to key a tombstone from: fail closed.
      throw new UnauthorizedException(AUTHENTICATION_FAILED);
    }

    if (await this.repository.hasOutstandingObligations(user.id)) {
      // Staged closure: acceptable now, anonymization waits for obligations.
      await this.repository.acceptClosure(user.id);
      return { code: 'CLOSURE_ACCEPTED', lifecycleStatus: 'CLOSURE_ACCEPTED' };
    }

    const subjectDigest = subjectDigestFor(user.clerkUserId, this.tombstoneSecret);
    await this.finalize(user.id, subjectDigest);

    // Local commit is done and authoritative. Provider revocation follows and
    // is fail-closed: its failure cannot roll back or re-enable the account.
    const provider = await this.revoker.revoke(user.clerkUserId, subjectDigest);
    return provider.outcome === 'REVOKED'
      ? { code: 'ACCOUNT_ANONYMIZED', lifecycleStatus: 'ANONYMIZED' }
      : { code: 'PROVIDER_REVOCATION_FAILED', lifecycleStatus: 'ANONYMIZED' };
  }

  private async finalize(userId: string, subjectDigest: string): Promise<void> {
    try {
      await this.repository.finalizeAnonymization({ userId, subjectDigest });
    } catch (error: unknown) {
      if (!isUniqueViolation(error)) throw error;
      // A concurrent request may have written the keyed tombstone. Confirm the
      // local row is actually anonymized before claiming success or calling the
      // provider: a tombstone from another path must not yield a 204 while PII
      // and a live clerk_subject are still present (WR-03).
      if ((await this.repository.currentStatus(userId)) !== 'ANONYMIZED') {
        throw new ConflictException(LOCAL_ANONYMIZATION_INCOMPLETE);
      }
    }
  }
}
