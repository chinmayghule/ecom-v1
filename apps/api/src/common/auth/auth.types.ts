/**
 * Contracts shared by the Clerk auth boundary and the local identity module.
 *
 * Clerk is the credential/session authority; every application capability and
 * authorization decision comes from local database state, never from Clerk
 * metadata or client input.
 */

export type ApplicationCapability = 'CUSTOMER' | 'MERCHANT' | 'ADMIN';

/** The small set of typed claims required from a verified Clerk session. */
export interface VerifiedClerkIdentity {
  readonly clerkUserId: string;
  readonly email: string;
  readonly displayName: string;
  readonly emailVerified: boolean;
}

/**
 * The local profile copy is nullable for exactly one reason: account deletion
 * anonymizes personal fields (email/display name are cleared to NULL) while the
 * stable local user ID and capability rows survive. A live, non-anonymized
 * account always has both values populated; `null` therefore means
 * "anonymized", never "not yet loaded" or "unknown".
 */
export interface AuthenticatedUser {
  readonly id: string;
  readonly clerkUserId: string;
  readonly email: string | null;
  readonly displayName: string | null;
  readonly capabilities: readonly ApplicationCapability[];
}

export interface ClerkTokenVerifier {
  verify(token: string): Promise<VerifiedClerkIdentity>;
}

/** Runtime injection token for the verifier interface (interfaces have no identity at runtime). */
export const CLERK_TOKEN_VERIFIER = Symbol('ClerkTokenVerifier');

/** Runtime injection token for the cross-module identity resolver contract. */
export const IDENTITY_RESOLVER = Symbol('IdentityResolver');

export interface IdentityResolutionResult {
  readonly user: AuthenticatedUser;
  readonly created: boolean;
}

/** Cross-module contract consumed by the global guard (see CODING_CONVENTIONS). */
export interface IdentityResolver {
  resolveVerifiedIdentity(input: {
    readonly identity: VerifiedClerkIdentity;
  }): Promise<IdentityResolutionResult>;
}

/** Parse the comma-separated authorized web origins into an explicit allowlist. */
export function parseWebOrigins(value: string): readonly string[] {
  return Object.freeze(
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  );
}
