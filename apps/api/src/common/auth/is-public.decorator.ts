import { SetMetadata } from '@nestjs/common';

/**
 * Stable metadata key for the global authentication guard introduced in Plan 06.
 *
 * Any route not explicitly marked public remains protected by default. Marking
 * is explicit so adding a route can never accidentally widen access.
 */
export const IS_PUBLIC_KEY = 'isPublic';

/** Mark a route (or controller) as reachable without a verified session. */
export const IsPublic = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
