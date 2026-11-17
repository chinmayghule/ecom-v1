import type {
  ApplicationCapability,
  AuthenticatedUser,
  VerifiedClerkIdentity,
} from '../common/auth/auth.types';

export interface ResolveVerifiedIdentityInput {
  readonly identity: VerifiedClerkIdentity;
}

export interface ResolvedIdentity {
  readonly user: AuthenticatedUser;
  readonly created: boolean;
}

/**
 * The minimal projection a signed-in caller may read about themselves.
 *
 * Deliberately excludes the Clerk subject and every lifecycle/tombstone/provider
 * field. `email`/`displayName` are nullable only for an anonymized account;
 * a live account always carries both values.
 */
export interface UserProfile {
  readonly id: string;
  readonly email: string | null;
  readonly displayName: string | null;
  readonly capabilities: readonly ApplicationCapability[];
}
