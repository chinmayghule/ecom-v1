import {
  CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ApplicationCapability, AuthenticatedUser } from '../auth/auth.types';
import { REQUIRE_CAPABILITY_KEY, type RequiredCapability } from './require-capability.decorator';

interface RequestWithUser {
  readonly user?: AuthenticatedUser;
}

const AUTHENTICATION_FAILED = 'Authentication is required.';
const INSUFFICIENT_CAPABILITY = 'You are not permitted to perform this action.';

/**
 * Pure capability decision over LOCAL application state only.
 *
 * Customer is the implicit baseline (handled by the absence of metadata); a
 * privileged action is satisfied only when the guard-resolved local user
 * actually holds that capability. Merchant capability will be derived from an
 * owned active store when that module exists in a later phase; keeping the
 * decision here as a pure function avoids a generic policy framework while
 * making the role matrix directly testable.
 */
export function hasRequiredCapability(
  granted: readonly ApplicationCapability[],
  required: RequiredCapability,
): boolean {
  return granted.includes(required);
}

/**
 * Action-level authorization guard.
 *
 * Reads the required capability only from Reflector metadata and the caller
 * only from the request's `user`, which the global Clerk guard attaches after
 * verification. It never inspects body, query, params, headers or Clerk claims
 * for a role/owner field, so a client cannot supply its own authorization.
 */
@Injectable()
export class CapabilityGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RequiredCapability | undefined>(
      REQUIRE_CAPABILITY_KEY,
      [context.getHandler(), context.getClass()],
    );
    // No privileged capability required: the authenticated baseline suffices.
    if (required === undefined) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    if (user === undefined) {
      throw new UnauthorizedException(AUTHENTICATION_FAILED);
    }

    if (!hasRequiredCapability(user.capabilities, required)) {
      throw new ForbiddenException(INSUFFICIENT_CAPABILITY);
    }
    return true;
  }
}
