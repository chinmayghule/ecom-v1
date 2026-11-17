import {
  CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  CLERK_TOKEN_VERIFIER,
  IDENTITY_RESOLVER,
  type AuthenticatedUser,
  type ClerkTokenVerifier,
  type IdentityResolver,
} from './auth.types';
import { IS_PUBLIC_KEY } from './is-public.decorator';

interface AuthRequest {
  readonly headers: Readonly<Record<string, unknown>>;
  user?: AuthenticatedUser;
}

const AUTHENTICATION_FAILED = 'Authentication is required.';
const RESOLUTION_FAILED = 'The request identity could not be resolved.';

/** Accept only an unambiguous single `Authorization: Bearer <token>` header. */
function extractBearerToken(header: unknown): string {
  if (Array.isArray(header) || typeof header !== 'string') {
    throw new UnauthorizedException(AUTHENTICATION_FAILED);
  }
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  const token = match?.[1];
  if (token === undefined) {
    throw new UnauthorizedException(AUTHENTICATION_FAILED);
  }
  return token;
}

/**
 * Global, deny-by-default authentication guard.
 *
 * A request reaches a handler only if it is explicitly public, or it carries a
 * Clerk bearer token that the official verifier accepts and that resolves to a
 * local application user. Verification failures (401/403) propagate unchanged;
 * identity-resolution failures fail closed as 401. Nothing is read from client
 * identity fields and no header or profile value is logged.
 */
@Injectable()
export class ClerkAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(CLERK_TOKEN_VERIFIER) private readonly verifier: ClerkTokenVerifier,
    @Inject(IDENTITY_RESOLVER) private readonly resolver: IdentityResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) return true;

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const token = extractBearerToken(request.headers['authorization']);

    // The verifier's sanitized 401/403 outcomes are intentional and preserved.
    const identity = await this.verifier.verify(token);

    let user: AuthenticatedUser;
    try {
      user = (await this.resolver.resolveVerifiedIdentity({ identity })).user;
    } catch {
      throw new UnauthorizedException(RESOLUTION_FAILED);
    }
    request.user = user;
    return true;
  }
}
