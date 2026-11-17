import { SetMetadata } from '@nestjs/common';
import type { ApplicationCapability } from '../auth/auth.types';

/** Stable metadata key read by the capability guard (never from client input). */
export const REQUIRE_CAPABILITY_KEY = 'requireCapability';

/**
 * Privileged capabilities that an action must explicitly require.
 *
 * CUSTOMER is the implicit baseline for every authenticated local user, so it
 * is deliberately not a value here: an unannotated route remains available to
 * any resolved user. Merchant and admin are application-owned capabilities in
 * local state, additive and independent rather than mutually exclusive types.
 */
export type RequiredCapability = Exclude<ApplicationCapability, 'CUSTOMER'>;

/** Attach the required capability to a route or controller as server metadata. */
export const RequireCapability = (
  capability: RequiredCapability,
): MethodDecorator & ClassDecorator => SetMetadata(REQUIRE_CAPABILITY_KEY, capability);
