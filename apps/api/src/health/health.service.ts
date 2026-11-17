import { Inject, Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../common/database/prisma.service';

/**
 * Explicit, bounded readiness probe settings. The timeout is a token-backed
 * constructor seam so tests can prove a bounded failure without a sleep.
 */
export const READINESS_TIMEOUT_MS = 5_000;
export const READINESS_TIMEOUT_TOKEN = 'READINESS_TIMEOUT_MS';

export interface LivenessStatus {
  readonly status: 'ok';
}

export interface DependencyStatus {
  readonly status: 'up' | 'down';
}

export interface ReadinessStatus {
  readonly status: 'ok';
  readonly checks: { readonly database: DependencyStatus };
}

/**
 * Liveness and readiness have deliberately different semantics (T-05-04,
 * T-05-06): liveness is purely in-process, while readiness runs one bounded
 * real PostgreSQL query through the single PrismaService and fails closed with
 * a non-2xx, detail-free response when that query is unavailable.
 */
@Injectable()
export class HealthService {
  private readonly probeTimeoutMs: number;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(READINESS_TIMEOUT_TOKEN) timeoutMs?: number,
  ) {
    this.probeTimeoutMs = timeoutMs ?? READINESS_TIMEOUT_MS;
  }

  /** Process-level availability — no dependency call, no external state. */
  getLiveness(): LivenessStatus {
    return { status: 'ok' };
  }

  /** Dependency-aware readiness backed by a real, bounded database query. */
  async getReadiness(): Promise<ReadinessStatus> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const probe = this.prisma.$queryRaw<Array<{ ok: boolean }>>`SELECT true AS ok`;
      const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('readiness probe timed out')), this.probeTimeoutMs);
        if (typeof timer.unref === 'function') {
          timer.unref();
        }
      });
      const rows = await Promise.race([probe, deadline]);
      if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.ok !== true) {
        throw new Error('unexpected readiness probe result');
      }
      return { status: 'ok', checks: { database: { status: 'up' } } };
    } catch {
      // Never surface connection strings, SQL, provider or stack detail.
      throw new ServiceUnavailableException();
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }
}
