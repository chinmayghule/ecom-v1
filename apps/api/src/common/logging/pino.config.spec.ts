import { pino, type DestinationStream } from 'pino';
import { describe, expect, it } from 'vitest';
import {
  LOG_REDACT_PATHS,
  createRequestLogContext,
  outcomeFrom,
  pinoLoggerOptions,
  requestIdFrom,
} from './pino.config';

/**
 * Log-shape contract for the structured request logger (threat T-05-03).
 * A synthetic request deliberately carries every credential/body/profile
 * field we must never emit; the assertion inspects the actual JSON written to
 * a Pino destination stream, not a re-implementation of the serializer.
 */

interface CapturedLine {
  readonly payload: Record<string, unknown>;
}

function captureLines(): { stream: DestinationStream; lines: CapturedLine[] } {
  const lines: CapturedLine[] = [];
  const stream: DestinationStream = {
    write(chunk: string | Uint8Array): void {
      const text = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
      for (const line of text.split('\n')) {
        if (line.length === 0) continue;
        lines.push({ payload: JSON.parse(line) as Record<string, unknown> });
      }
    },
  };
  return { stream, lines };
}

const DANGEROUS_VALUES = [
  'Bearer sk_test_secret',
  'session=abc123',
  'sk_live_should_never_log',
  'victim@example.test',
  'hunter2',
  'token=querysecret',
] as const;

const syntheticRequest = {
  method: 'POST',
  url: '/me?token=querysecret',
  route: { path: '/me' },
  headers: {
    authorization: 'Bearer sk_test_secret',
    cookie: 'session=abc123',
    'x-api-key': 'sk_live_should_never_log',
    'x-request-id': 'req-stable-7',
  },
  body: { email: 'victim@example.test', password: 'hunter2' },
};

const syntheticResponse = { statusCode: 201 };

describe('Pino structured request logging boundary', () => {
  it('emits a stable request id, route and outcome with no credential or body leakage', () => {
    const { stream, lines } = captureLines();
    const logger = pino(pinoLoggerOptions, stream);

    logger.info(
      {
        req: syntheticRequest,
        res: syntheticResponse,
        ...createRequestLogContext(syntheticRequest, syntheticResponse),
      },
      'request completed',
    );

    expect(lines).toHaveLength(1);
    const record = lines[0]!.payload;
    const serialized = JSON.stringify(record);
    const request = record['req'] as Record<string, unknown>;

    expect(record['requestId']).toBe('req-stable-7');
    expect(record['outcome']).toBe('success');
    expect(request['id']).toBe('req-stable-7');
    expect(request['method']).toBe('POST');
    expect(request['route']).toBe('/me');
    expect(request['path']).toBe('/me');

    for (const value of DANGEROUS_VALUES) {
      expect(serialized).not.toContain(value);
    }
    expect(serialized).not.toContain('authorization');
    expect(serialized).not.toContain('cookie');
    expect(serialized).not.toContain('x-api-key');
    expect(serialized).not.toContain('body');
  });

  it('derives the request id from the caller header and generates one when absent', () => {
    const withHeader = { headers: { 'x-request-id': 'caller-id-9' } };
    expect(requestIdFrom(withHeader)).toBe('caller-id-9');
    expect(requestIdFrom(withHeader)).toBe('caller-id-9');

    const withoutHeader = { headers: {} };
    const first = requestIdFrom(withoutHeader);
    const second = requestIdFrom(withoutHeader);
    expect(first).not.toBe(second);
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('classifies outcomes by status family only', () => {
    expect(outcomeFrom(200)).toBe('success');
    expect(outcomeFrom(302)).toBe('success');
    expect(outcomeFrom(404)).toBe('client_error');
    expect(outcomeFrom(503)).toBe('server_error');
  });

  it('keeps explicit redaction paths for credential-bearing fields', () => {
    expect(LOG_REDACT_PATHS).toContain('req.headers.authorization');
    expect(LOG_REDACT_PATHS).toContain('req.headers.cookie');
  });

  it('attaches userId only when an authenticated user is present on the request', () => {
    const withUser = { ...syntheticRequest, user: { id: 'usr-123' } };
    expect(createRequestLogContext(withUser, syntheticResponse)).toMatchObject({
      userId: 'usr-123',
    });
    expect(
      Object.hasOwn(createRequestLogContext(syntheticRequest, syntheticResponse), 'userId'),
    ).toBe(false);
  });
});
