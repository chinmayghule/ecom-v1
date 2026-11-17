import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VerifiedClerkIdentity } from './auth.types';
import { ClerkTokenVerifierService } from './clerk-token-verifier';

/**
 * These tests exercise the REAL `@clerk/backend` networkless verifier. No
 * online/session-calling shortcut is used: a throwaway RSA key pair signs JWTs
 * locally and the PEM public key is supplied as `CLERK_JWT_KEY`.
 */
const WEB_ORIGIN = 'http://localhost:3000';
const OTHER_ORIGIN = 'http://localhost:3001';
const ISSUER = 'https://clerk.example.test';
const AUDIENCE = 'clerk.example.test';
const SESSION_CATEGORY = 'cl_B7d4PD111AAA';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const { privateKey: otherPrivateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwtKey = publicKey.export({ type: 'spki', format: 'pem' }).toString();

interface TokenOverrides {
  readonly signingKey?: KeyObject;
}

function encodeJson(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signedToken(
  claims: Record<string, unknown> = {},
  overrides: TokenOverrides = {},
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = encodeJson({
    alg: 'RS256',
    typ: 'JWT',
    kid: 'test-key',
    cat: SESSION_CATEGORY,
  });
  const body = encodeJson({
    sub: 'user_test_subject',
    azp: WEB_ORIGIN,
    iss: ISSUER,
    aud: AUDIENCE,
    iat: now - 10,
    nbf: now - 10,
    exp: now + 600,
    primaryEmail: 'owner@example.test',
    displayName: 'Owner',
    emailVerified: true,
    ...claims,
  });
  const input = `${header}.${body}`;
  const signature = sign('RSA-SHA256', Buffer.from(input), overrides.signingKey ?? privateKey)
    .toString('base64url');
  return `${input}.${signature}`;
}

describe('ClerkTokenVerifierService (networkless signed claims)', () => {
  let verifier: ClerkTokenVerifierService;

  beforeEach(() => {
    process.env['CLERK_JWT_KEY'] = jwtKey;
    process.env['CLERK_WEB_ORIGIN'] = WEB_ORIGIN;
    process.env['CLERK_ISSUER'] = ISSUER;
    process.env['CLERK_AUDIENCE'] = AUDIENCE;
    verifier = new ClerkTokenVerifierService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('extracts the immutable subject, primary email, required display name and explicit verified flag', async () => {
    const identity = await verifier.verify(signedToken());

    const expected: VerifiedClerkIdentity = {
      clerkUserId: 'user_test_subject',
      email: 'owner@example.test',
      displayName: 'Owner',
      emailVerified: true,
    };
    expect(identity).toEqual(expected);
    expect(Object.isFrozen(identity)).toBe(true);
    expect(typeof identity.emailVerified).toBe('boolean');
  });

  it('fails closed with a sanitized 401 for missing, expired, wrong-signature, wrong-party, wrong-issuer or wrong-audience tokens', async () => {
    const now = Math.floor(Date.now() / 1000);
    const cases: ReadonlyArray<readonly [string, string]> = [
      ['empty token', ''],
      ['malformed token', 'not-a-jwt'],
      ['expired token', signedToken({ exp: now - 60 })],
      ['wrong signature', signedToken({}, { signingKey: otherPrivateKey })],
      ['wrong authorized party', signedToken({ azp: OTHER_ORIGIN })],
      ['wrong issuer', signedToken({ iss: 'https://evil.example.test' })],
      ['wrong audience', signedToken({ aud: 'evil.example.test' })],
      ['missing subject', signedToken({ sub: undefined })],
      ['non-string subject', signedToken({ sub: 42 })],
    ];

    for (const [label, token] of cases) {
      await expect(verifier.verify(token), label).rejects.toBeInstanceOf(UnauthorizedException);
    }
  });

  it('returns 403 profile-incomplete when an authenticated token lacks the required display name', async () => {
    await expect(verifier.verify(signedToken({ displayName: undefined }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(verifier.verify(signedToken({ displayName: 123 }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(verifier.verify(signedToken({ displayName: '   ' }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('does not treat an unverified primary email as verified', async () => {
    const identity = await verifier.verify(signedToken({ emailVerified: false }));
    expect(identity.emailVerified).toBe(false);
    expect(identity.email).toBe('owner@example.test');
  });

  it('never logs the token, secrets or profile values and never echoes them in errors', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const token = signedToken({ primaryEmail: 'secret-profile@example.test' });
    await verifier.verify(token);

    try {
      await verifier.verify(signedToken({}, { signingKey: otherPrivateKey }));
      throw new Error('expected verification to fail');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(UnauthorizedException);
      const message = (error as Error).message;
      expect(message).not.toContain(token);
      expect(message).not.toContain('secret-profile@example.test');
      expect(message).not.toContain(jwtKey);
    }

    for (const spy of [logSpy, infoSpy, errorSpy, warnSpy]) {
      expect(spy).not.toHaveBeenCalled();
    }
  });
});
