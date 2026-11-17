import type { AuthenticatedUser, VerifiedClerkIdentity } from '../common/auth/auth.types';

export interface ResolveVerifiedIdentityInput {
  readonly identity: VerifiedClerkIdentity;
}

export interface ResolvedIdentity {
  readonly user: AuthenticatedUser;
  readonly created: boolean;
}
