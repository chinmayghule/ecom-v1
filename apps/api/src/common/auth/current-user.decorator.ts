import { createParamDecorator, type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedUser } from './auth.types';

interface RequestWithUser {
  readonly user?: AuthenticatedUser;
}

/**
 * The only source of caller identity in a handler: the local user attached by
 * the verified global guard. No user id, email or capability is ever read from
 * body, query, params or client-controlled headers.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    if (request.user === undefined) {
      throw new UnauthorizedException('Authentication is required.');
    }
    return request.user;
  },
);
