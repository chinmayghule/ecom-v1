import { Module } from '@nestjs/common';
import { IdentityModule } from '../../identity/identity.module';
import { CLERK_TOKEN_VERIFIER } from './auth.types';
import { ClerkAuthGuard } from './clerk-auth.guard';
import { ClerkTokenVerifierService } from './clerk-token-verifier';

export interface ApiCorsOptions {
  readonly origin: readonly string[];
  readonly credentials: boolean;
  readonly methods: readonly string[];
  readonly allowedHeaders: readonly string[];
}

/**
 * Explicit CORS allowlist from the authorized web origins. Never a wildcard
 * origin with credentials (the browser sends the Clerk bearer token).
 */
export function buildCorsOptions(webOrigins: readonly string[]): ApiCorsOptions {
  return Object.freeze<ApiCorsOptions>({
    origin: Object.freeze([...webOrigins]),
    credentials: true,
    methods: Object.freeze(['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS']),
    allowedHeaders: Object.freeze(['Authorization', 'Content-Type', 'X-Request-Id']),
  });
}

/**
 * Authentication boundary. The guard is exported so bootstrap can register it
 * globally; the resolver dependency comes from IdentityModule, so application
 * authorization stays rooted in local database state.
 */
@Module({
  imports: [IdentityModule],
  providers: [
    { provide: CLERK_TOKEN_VERIFIER, useClass: ClerkTokenVerifierService },
    ClerkAuthGuard,
  ],
  exports: [CLERK_TOKEN_VERIFIER, ClerkAuthGuard],
})
export class AuthModule {}
