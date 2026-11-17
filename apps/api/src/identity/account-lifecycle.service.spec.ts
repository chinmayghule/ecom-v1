import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../common/auth/auth.types';
import { AccountLifecycleService } from './account-lifecycle.service';
import type { ProviderRevocation } from './account-lifecycle.types';
import { subjectDigestFor } from './identity.repository';

/**
 * Unit coverage for the owner-selected local lifecycle orchestration.
 *
 * The repository/provider are mocked here; the real-database transaction,
 * unique tombstone and retained-record proofs live in account-lifecycle.e2e-spec.ts.
 */

const SECRET = 'test-tombstone-hmac-secret';

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return Object.freeze({
    id: 'user-1',
    clerkUserId: 'sub_alice',
    email: 'alice@example.test',
    displayName: 'Alice',
    capabilities: Object.freeze(['CUSTOMER', 'MERCHANT', 'ADMIN'] as const),
    ...overrides,
  }) as AuthenticatedUser;
}

interface RepositoryStub {
  currentStatus: ReturnType<typeof vi.fn>;
  hasOutstandingObligations: ReturnType<typeof vi.fn>;
  acceptClosure: ReturnType<typeof vi.fn>;
  finalizeAnonymization: ReturnType<typeof vi.fn>;
  tombstoneFor: ReturnType<typeof vi.fn>;
}

function repositoryStub(obligations = false, status = 'ACTIVE'): RepositoryStub {
  return {
    currentStatus: vi.fn(async () => status),
    hasOutstandingObligations: vi.fn(async () => obligations),
    acceptClosure: vi.fn(async () => undefined),
    finalizeAnonymization: vi.fn(async () => undefined),
    tombstoneFor: vi.fn(async () => ({ providerRevocationOutcome: 'REVOKED' })),
  };
}

function revokerStub(outcome: 'REVOKED' | 'FAILED' = 'REVOKED'): ProviderRevocation {
  return { revoke: vi.fn(async () => ({ outcome, attempts: 1, errorCode: null })) } as ProviderRevocation;
}

function serviceWith(repo: RepositoryStub, revoker: ProviderRevocation = revokerStub()): AccountLifecycleService {
  return new AccountLifecycleService(
    repo as never,
    revoker,
    { tombstoneSecret: SECRET },
  );
}

describe('AccountLifecycleService — owner-selected local lifecycle', () => {
  let repo: RepositoryStub;

  beforeEach(() => {
    repo = repositoryStub();
  });

  it('anonymizes an eligible user with a keyed tombstone digest, never the raw Clerk subject', async () => {
    const service = serviceWith(repo);
    const user = makeUser();

    const result = await service.deleteAccount(user);

    expect(result).toEqual({ code: 'ACCOUNT_ANONYMIZED', lifecycleStatus: 'ANONYMIZED' });
    expect(repo.finalizeAnonymization).toHaveBeenCalledTimes(1);
    const input = repo.finalizeAnonymization.mock.calls[0]?.[0] as {
      userId: string;
      subjectDigest: string;
    };
    expect(input.userId).toBe(user.id);
    expect(input.subjectDigest).toBe(subjectDigestFor(user.clerkUserId, SECRET));
    expect(input.subjectDigest).not.toContain(user.clerkUserId);
    // The raw Clerk subject is never handed to the persistence boundary.
    expect(input).not.toHaveProperty('clerkSubject');
    expect(repo.acceptClosure).not.toHaveBeenCalled();
  });

  it('follows the staged-closure state sequence and cannot finalize early when obligations remain', async () => {
    repo = repositoryStub(true, 'ACTIVE');
    const service = serviceWith(repo);

    const result = await service.deleteAccount(makeUser());

    expect(result).toEqual({ code: 'CLOSURE_ACCEPTED', lifecycleStatus: 'CLOSURE_ACCEPTED' });
    expect(repo.acceptClosure).toHaveBeenCalledTimes(1);
    expect(repo.acceptClosure).toHaveBeenCalledWith('user-1');
    expect(repo.finalizeAnonymization).not.toHaveBeenCalled();
  });

  it('removes the admin capability only for the requesting user and never touches another user', async () => {
    const service = serviceWith(repo);
    const otherUser = makeUser({ id: 'user-2', clerkUserId: 'sub_bob' });

    await service.deleteAccount(makeUser());
    await service.deleteAccount(otherUser);

    const ids = repo.finalizeAnonymization.mock.calls.map(
      (call) => (call[0] as { userId: string }).userId,
    );
    expect(ids).toEqual(['user-1', 'user-2']);
    for (const call of repo.finalizeAnonymization.mock.calls) {
      expect(call[0]).not.toHaveProperty('clerkSubject', 'sub_alice');
    }
    // No call ever carries the other user's identifier into the first write.
    expect(repo.finalizeAnonymization.mock.calls[0]?.[0]).not.toMatchObject({ userId: 'user-2' });
  });

  it('treats a keyed-tombstone uniqueness conflict as an already-denied subject once anonymization is confirmed', async () => {
    repo.finalizeAnonymization.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: '7.10.1',
      }),
    );
    // First call is the initial status check; the second is the post-conflict
    // confirmation inside finalize().
    repo.currentStatus.mockResolvedValueOnce('ACTIVE').mockResolvedValueOnce('ANONYMIZED');
    const revoker = revokerStub();
    const service = serviceWith(repo, revoker);

    const result = await service.deleteAccount(makeUser());

    expect(result).toEqual({ code: 'ACCOUNT_ANONYMIZED', lifecycleStatus: 'ANONYMIZED' });
    expect(repo.currentStatus).toHaveBeenCalledWith('user-1');
    // The winner already recorded REVOKED — never call the provider again.
    expect(revoker.revoke).not.toHaveBeenCalled();
  });

  it('still revokes when a losing request finds the winner outcome only pending', async () => {
    repo.finalizeAnonymization.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: '7.10.1',
      }),
    );
    repo.currentStatus.mockResolvedValueOnce('ACTIVE').mockResolvedValueOnce('ANONYMIZED');
    repo.tombstoneFor.mockResolvedValueOnce({ providerRevocationOutcome: 'PENDING' });
    const revoker = revokerStub();
    const service = serviceWith(repo, revoker);

    const result = await service.deleteAccount(makeUser());

    expect(result).toEqual({ code: 'ACCOUNT_ANONYMIZED', lifecycleStatus: 'ANONYMIZED' });
    expect(revoker.revoke).toHaveBeenCalledTimes(1);
  });

  it('conflicts on a tombstone conflict when local anonymization cannot be confirmed', async () => {
    repo.finalizeAnonymization.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: '7.10.1',
      }),
    );
    // currentStatus stays ACTIVE — the PII-containing row was never cleared.
    repo.hasOutstandingObligations.mockResolvedValueOnce(false);
    const service = serviceWith(repo);

    await expect(service.deleteAccount(makeUser())).rejects.toBeInstanceOf(ConflictException);
  });

  it('reports a recorded provider failure without restoring local access', async () => {
    const service = serviceWith(repo, revokerStub('FAILED'));

    const result = await service.deleteAccount(makeUser());

    expect(result).toEqual({
      code: 'PROVIDER_REVOCATION_FAILED',
      lifecycleStatus: 'ANONYMIZED',
    });
    expect(repo.finalizeAnonymization).toHaveBeenCalledTimes(1);
  });

  it('rejects a subject with no local identity link', async () => {
    const service = serviceWith(repo);
    await expect(
      service.deleteAccount(makeUser({ clerkUserId: '' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
