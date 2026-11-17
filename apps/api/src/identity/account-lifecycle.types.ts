import type {
  StoreLifecycleStatus,
  TombstoneRevocationOutcome,
  UserLifecycleStatus,
} from '@prisma/client';

/**
 * Contracts for the owner-approved identity lifecycle (01-CONTEXT owner
 * resolution 2026-11-17). Lifecycle statuses are derived from the single
 * definition in the Plan 04 Prisma schema; no new state is invented here.
 */

export type { StoreLifecycleStatus, TombstoneRevocationOutcome, UserLifecycleStatus };

/**
 * In-flight order statuses are "outstanding obligations" (D-08): they still
 * require restricted completion/refund work. Terminal statuses are not
 * obligations and are retained as anonymized buyer references (D-07).
 */
export const IN_FLIGHT_ORDER_STATUSES = [
  'PENDING_PAYMENT',
  'PAID',
  'SHIPPED',
] as const;

/** Stable, non-sensitive codes returned by the deletion endpoint. */
export type AccountDeletionCode =
  | 'ACCOUNT_ANONYMIZED'
  | 'CLOSURE_ACCEPTED'
  | 'PROVIDER_REVOCATION_FAILED';

/**
 * The only data the HTTP boundary may expose about a deletion. It never
 * carries the Clerk subject, the tombstone digest, a token or any PII.
 */
export interface AccountDeletionResult {
  readonly code: AccountDeletionCode;
  readonly lifecycleStatus: UserLifecycleStatus;
}

/** Provider revocation result recorded against the tombstone. */
export interface ProviderRevocationResult {
  readonly outcome: TombstoneRevocationOutcome;
  readonly attempts: number;
  /** Sanitized, stable provider error class — never a raw provider message. */
  readonly errorCode: string | null;
}

/**
 * Port consumed by the lifecycle service and bound to
 * ClerkAccountRevocationService in the identity module. Keeping a port lets
 * the local transaction be tested without provider credentials and keeps the
 * fail-closed sequence explicit: local commit first, provider action after.
 */
export const PROVIDER_REVOCATION = Symbol('ProviderRevocation');
export interface ProviderRevocation {
  /**
   * `userId` is the stable, non-PII local id used to attribute the post-commit
   * provider-outcome audit event; `subjectDigest` keys the tombstone. The raw
   * Clerk subject is used only for the provider call and is never persisted.
   */
  revoke(
    userId: string,
    clerkSubject: string,
    subjectDigest: string,
  ): Promise<ProviderRevocationResult>;
}

/** Config slice this module owns. */
export interface AccountLifecycleConfig {
  readonly tombstoneSecret: string;
}
