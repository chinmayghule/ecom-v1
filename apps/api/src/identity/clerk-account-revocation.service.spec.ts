import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClerkAccountRevocationService, MAX_REVOCATION_ATTEMPTS } from './clerk-account-revocation.service';
import type { AccountLifecycleRepository } from './account-lifecycle.repository';

/**
 * Unit coverage for fail-closed provider revocation. The Clerk client and the
 * tombstone recorder are injected so no credentials or network are required.
 */

const SECRET_KEY = 'sk_test_not_a_real_key';
const USER_ID = '00000000-0000-4000-8000-000000000001';
const SUBJECT = 'sub_alice_PII_MUST_NOT_LEAK';
const DIGEST = 'a'.repeat(64);

interface RecordCall {
  readonly userId: string;
  readonly digest: string;
  readonly outcome: string;
  readonly attempts: number;
  readonly errorCode: string | null;
}

function repositoryStub() {
  const calls: RecordCall[] = [];
  return {
    calls,
    recordProviderOutcome: vi.fn(
      async (
        userId: string,
        digest: string,
        outcome: string,
        attempts: number,
        errorCode: string | null,
      ): Promise<void> => {
        calls.push({ userId, digest, outcome, attempts, errorCode });
      },
    ),
  };
}

function makeService(
  repo: ReturnType<typeof repositoryStub>,
  deleteUser: (subject: string) => Promise<unknown>,
): ClerkAccountRevocationService {
  return new ClerkAccountRevocationService(
    repo as unknown as AccountLifecycleRepository,
    { clerkSecretKey: SECRET_KEY },
    () => ({ users: { deleteUser } as never }),
  );
}

describe('ClerkAccountRevocationService — fail-closed provider revocation', () => {
  let repo: ReturnType<typeof repositoryStub>;

  beforeEach(() => {
    repo = repositoryStub();
  });

  it('revokes on the first attempt and records the success against the keyed digest', async () => {
    const deleteUser = vi.fn(async () => ({ id: SUBJECT }));
    const service = makeService(repo, deleteUser);

    const result = await service.revoke(USER_ID, SUBJECT, DIGEST);

    expect(result).toEqual({ outcome: 'REVOKED', attempts: 1, errorCode: null });
    expect(deleteUser).toHaveBeenCalledTimes(1);
    expect(deleteUser).toHaveBeenCalledWith(SUBJECT);
    expect(repo.recordProviderOutcome).toHaveBeenCalledWith(USER_ID, DIGEST, 'REVOKED', 1, null);
  });

  it('retries transient provider failures before succeeding', async () => {
    const deleteUser = vi
      .fn(async (_subject: string): Promise<unknown> => ({ id: SUBJECT }))
      .mockRejectedValueOnce({ status: 503 })
      .mockRejectedValueOnce({ status: 503 });
    const service = makeService(repo, deleteUser);

    const result = await service.revoke(USER_ID, SUBJECT, DIGEST);

    expect(result.outcome).toBe('REVOKED');
    expect(result.attempts).toBe(3);
    expect(deleteUser).toHaveBeenCalledTimes(3);
  });

  it('records a sanitized failure after exhausting retries without ever throwing', async () => {
    const deleteUser = vi.fn(async () => {
      throw new Error(`Clerk said ${SUBJECT} is secret sk_live_ABCEXTRALONGSECRETVALUE`);
    });
    const service = makeService(repo, deleteUser);

    const result = await service.revoke(USER_ID, SUBJECT, DIGEST);

    expect(result.outcome).toBe('FAILED');
    expect(result.attempts).toBe(MAX_REVOCATION_ATTEMPTS);
    expect(result.errorCode).not.toContain(SUBJECT);
    expect(result.errorCode).not.toContain('sk_live');
    expect(repo.calls).toHaveLength(1);
    expect(repo.calls[0]?.userId).toBe(USER_ID);
    expect(repo.calls[0]?.outcome).toBe('FAILED');
    expect(repo.calls[0]?.digest).toBe(DIGEST);
    expect(repo.calls[0]?.errorCode).not.toContain(SUBJECT);
  });

  it('maps provider error shapes to stable sanitized codes without echoing messages', async () => {
    const cases: ReadonlyArray<{ thrown: unknown; expected: string }> = [
      { thrown: { status: 401 }, expected: 'PROVIDER_AUTH_CONFIG' },
      { thrown: { status: 403 }, expected: 'PROVIDER_AUTH_CONFIG' },
      { thrown: { status: 404 }, expected: 'PROVIDER_USER_NOT_FOUND' },
      { thrown: { status: 429 }, expected: 'PROVIDER_RATE_LIMITED' },
      { thrown: { status: 500 }, expected: 'PROVIDER_SERVER_ERROR' },
      { thrown: new Error('socket hang up'), expected: 'PROVIDER_NETWORK_OR_UNKNOWN' },
    ];
    for (const testCase of cases) {
      repo = repositoryStub();
      const service = makeService(repo, async () => {
        throw testCase.thrown;
      });
      const result = await service.revoke(USER_ID, SUBJECT, DIGEST);
      expect(result.errorCode).toBe(testCase.expected);
    }
  });
});
