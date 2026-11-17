import { Injectable } from '@nestjs/common';
import type { TombstoneRevocationOutcome } from '@prisma/client';
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

  /** Closure accepted: stop new sales, retain records, keep the completion path. */
  async acceptClosure(userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.updateMany({
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
      await tx.userCapability.deleteMany({ where: { userId, capability: 'ADMIN' } });
      await tx.lifecycleEvent.createMany({
        data: [
          { userId, eventType: 'CLOSURE_REQUESTED' },
          { userId, eventType: 'CLOSURE_ACCEPTED' },
          { userId, eventType: 'CAPABILITY_REVOKED', detail: 'ADMIN' },
        ],
      });
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
   */
  async recordProviderOutcome(
    subjectDigest: string,
    outcome: TombstoneRevocationOutcome,
    attempts: number,
    errorCode: string | null,
  ): Promise<void> {
    await this.prisma.identityTombstone.update({
      where: { subjectDigest },
      data: {
        providerRevocationOutcome: outcome,
        providerRevocationAttempts: attempts,
        providerRevocationLastErrorCode: errorCode,
        ...(outcome === 'REVOKED' ? { providerRevokedAt: new Date() } : {}),
      },
    });
    await this.prisma.lifecycleEvent.create({
      data: {
        eventType:
          outcome === 'REVOKED' ? 'PROVIDER_REVOCATION_SUCCEEDED' : 'PROVIDER_REVOCATION_FAILED',
        outcome,
        // errorCode is a sanitized stable class; no provider message is logged.
        detail: errorCode,
      },
    });
  }
}
