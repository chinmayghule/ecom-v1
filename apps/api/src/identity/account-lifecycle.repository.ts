import { Injectable } from '@nestjs/common';
import type { Prisma, TombstoneRevocationOutcome } from '@prisma/client';
import { PrismaService } from '../common/database/prisma.service';
import { IN_FLIGHT_ORDER_STATUSES } from './account-lifecycle.types';

/**
 * Focused persistence for the owner-selected identity lifecycle.
 *
 * Every retained record stays: the user row is never deleted, and store/order
 * rows keep their stable `owner_user_id` / `buyer_user_id` references (D-07).
 * The keyed tombstone is written in the SAME transaction as anonymization so
 * the local deny is authoritative before any provider call (owner resolution
 * 2026-11-17).
 */

export interface FinalizeAnonymizationInput {
  readonly userId: string;
  readonly subjectDigest: string;
}

@Injectable()
export class AccountLifecycleRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Outstanding obligation = an in-flight order where this user is the buyer
   * OR owns the store. Only these need restricted completion/refund work;
   * terminal orders are retained references, not obligations (D-08).
   */
  async hasOutstandingObligations(userId: string): Promise<boolean> {
    const count = await this.prisma.order.count({
      where: {
        status: { in: [...IN_FLIGHT_ORDER_STATUSES] },
        OR: [{ buyerUserId: userId }, { store: { ownerUserId: userId } }],
      },
    });
    return count > 0;
  }

  async currentStatus(userId: string) {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { lifecycleStatus: true },
    });
    return row?.lifecycleStatus;
  }

  /**
   * The authoritative local deny marker for a subject digest. Used after a
   * uniqueness conflict to see whether the winning request already finalized
   * the provider outcome (WR-02).
   */
  async tombstoneFor(subjectDigest: string) {
    return this.prisma.identityTombstone.findUnique({
      where: { subjectDigest },
      select: { providerRevocationOutcome: true },
    });
  }

  /**
   * Closure accepted: stop new sales, retain records, keep the completion path.
   *
   * Idempotent: the obligation check and the mutations share one transaction,
   * and audit events are appended only for transitions that actually changed
   * rows, so repeated requests never inflate the append-only log (WR-04).
   * Returns false when no obligations remain (caller should finalize instead).
   */
  async acceptClosure(userId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const obligations = await tx.order.count({
        where: {
          status: { in: [...IN_FLIGHT_ORDER_STATUSES] },
          OR: [{ buyerUserId: userId }, { store: { ownerUserId: userId } }],
        },
      });
      if (obligations === 0) return false;

      const userUpdate = await tx.user.updateMany({
        where: { id: userId, lifecycleStatus: { in: ['ACTIVE', 'CLOSURE_REQUESTED'] } },
        data: { lifecycleStatus: 'CLOSURE_ACCEPTED' },
      });
      // CLOSED stops new sales while the owner keeps restricted completion
      // actions. MERCHANT capability is deliberately retained (D-08/D-09).
      await tx.store.updateMany({
        where: { ownerUserId: userId, status: { in: ['ACTIVE', 'CLOSURE_REQUESTED'] } },
        data: { status: 'CLOSED' },
      });
      // Admin is an explicit, separately granted capability: closure removes
      // it, scoped to this user only.
      const revokedCapabilities = await tx.userCapability.deleteMany({
        where: { userId, capability: 'ADMIN' },
      });

      const events: Prisma.LifecycleEventCreateManyInput[] = [];
      if (userUpdate.count > 0) {
        events.push({ userId, eventType: 'CLOSURE_REQUESTED' });
        events.push({ userId, eventType: 'CLOSURE_ACCEPTED' });
      }
      if (revokedCapabilities.count > 0) {
        events.push({ userId, eventType: 'CAPABILITY_REVOKED', detail: 'ADMIN' });
      }
      if (events.length > 0) {
        await tx.lifecycleEvent.createMany({ data: events });
      }
      return true;
    });
  }

  /**
   * Final anonymization: profile PII cleared, stable local id and every
   * store/order reference retained, ADMIN removed, and the permanent keyed
   * tombstone inserted — all in one transaction. No raw Clerk subject is
   * stored; only the HMAC digest. No legal retention period is set.
   */
  async finalizeAnonymization(input: FinalizeAnonymizationInput): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: input.userId },
        data: {
          lifecycleStatus: 'ANONYMIZED',
          email: null,
          displayName: null,
          clerkSubject: null,
        },
      });
      await tx.userCapability.deleteMany({ where: { userId: input.userId, capability: 'ADMIN' } });
      await tx.identityTombstone.create({
        data: {
          subjectDigest: input.subjectDigest,
          // Permanent/indefinite deny marker. No expiry is invented.
          expiresAt: null,
          providerRevocationOutcome: 'PENDING',
          providerRevocationAttempts: 0,
        },
      });
      await tx.lifecycleEvent.createMany({
        data: [
          { userId: input.userId, eventType: 'PROFILE_ANONYMIZED' },
          { userId: input.userId, eventType: 'CAPABILITY_REVOKED', detail: 'ADMIN' },
          { userId: input.userId, eventType: 'TOMBSTONE_WRITTEN' },
        ],
      });
    });
  }

  /**
   * Records the provider outcome after the local commit. A provider failure
   * only updates the tombstone's bookkeeping and appends an audit event — it
   * never restores local access or reverses anonymization (fail closed).
   *
   * The appended event is attributed with the stable, non-PII `userId` so it
   * can be joined to the account/tombstone without storing the raw Clerk
   * subject or the subject digest in the append-only event log. The event is a
   * new INSERT (the table's append-only trigger rejects UPDATE/DELETE), so no
   * schema change or migration is needed: `user_id` already exists and is
   * nullable.
   */
  async recordProviderOutcome(
    userId: string,
    subjectDigest: string,
    outcome: TombstoneRevocationOutcome,
    attempts: number,
    errorCode: string | null,
  ): Promise<void> {
    // Conditional write: only the request that moves PENDING -> terminal may
    // record the outcome. A losing concurrent deletion must not overwrite the
    // winner's REVOKED with its own FAILED, nor append a second, contradictory
    // audit event (WR-02).
    const updated = await this.prisma.identityTombstone.updateMany({
      where: { subjectDigest, providerRevocationOutcome: 'PENDING' },
      data: {
        providerRevocationOutcome: outcome,
        providerRevocationAttempts: attempts,
        providerRevocationLastErrorCode: errorCode,
        ...(outcome === 'REVOKED' ? { providerRevokedAt: new Date() } : {}),
      },
    });
    if (updated.count === 0) {
      // A terminal outcome is already recorded; leave it and the audit trail
      // untouched. Local denial is unaffected either way.
      return;
    }
    await this.prisma.lifecycleEvent.create({
      data: {
        // Stable local id attributes the event to the account without any PII.
        userId,
        eventType:
          outcome === 'REVOKED' ? 'PROVIDER_REVOCATION_SUCCEEDED' : 'PROVIDER_REVOCATION_FAILED',
        outcome,
        // errorCode is a sanitized stable class; no provider message is logged.
        detail: errorCode,
      },
    });
  }
}
