import { randomUUID } from 'node:crypto';
import { pino, type LoggerOptions } from 'pino';

/**
 * Structured request logging configuration (threat T-05-03).
 *
 * Safety is enforced by a whitelist serializer: a log record carries only a
 * request id, method, path-without-query and route — never headers, cookies,
 * bodies or profile values. Pino's redaction is kept as defence in depth for
 * any future field that might accidentally be added to a log payload.
 */

export const REQUEST_ID_HEADER = 'x-request-id';
const MAX_TOKEN_LENGTH = 128;
const SAFE_TOKEN = /^[A-Za-z0-9_.:-]+$/;

/** Minimal request shape the logger/filter read; avoids an Express type dep. */
export interface LoggableRequest {
  readonly id?: string | number;
  readonly method?: string;
  readonly url?: string;
  readonly route?: { readonly path?: string };
  readonly headers?: Readonly<Record<string, unknown>>;
  readonly user?: { readonly id?: string };
}

export interface LoggableResponse {
  readonly statusCode?: number;
}

export type RequestOutcome = 'success' | 'client_error' | 'server_error';

function isSafeToken(value: string): boolean {
  return (
    value.length > 0 && value.length <= MAX_TOKEN_LENGTH && SAFE_TOKEN.test(value)
  );
}

/** Reuse a caller-supplied safe correlation id, or mint a stable new one. */
export function requestIdFrom(request: LoggableRequest): string {
  const header = request.headers?.[REQUEST_ID_HEADER];
  const candidate = Array.isArray(header) ? header[0] : header;
  if (typeof candidate === 'string' && isSafeToken(candidate)) {
    return candidate;
  }
  const existing = request.id;
  if (typeof existing === 'string' && isSafeToken(existing)) {
    return existing;
  }
  return randomUUID();
}

/** Classify an HTTP status family; an absent status is treated as a fault. */
export function outcomeFrom(statusCode: number | undefined): RequestOutcome {
  const status = typeof statusCode === 'number' ? statusCode : 500;
  if (status >= 500) return 'server_error';
  if (status >= 400) return 'client_error';
  return 'success';
}

/** Fields added to every auto-logged request completion record. */
export function createRequestLogContext(
  request: LoggableRequest,
  response: LoggableResponse,
): Record<string, unknown> {
  const context: Record<string, unknown> = {
    requestId: requestIdFrom(request),
    outcome: outcomeFrom(response.statusCode),
  };
  const userId = request.user?.id;
  if (typeof userId === 'string' && isSafeToken(userId)) {
    context['userId'] = userId;
  }
  return context;
}

/** Strip a query string so query-parameter secrets never enter a log. */
function pathOnly(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  const queryAt = url.indexOf('?');
  return queryAt === -1 ? url : url.slice(0, queryAt);
}

/** Whitelist serializer: no headers, cookies or body can reach the stream. */
function safeRequestSerializer(request: LoggableRequest): Record<string, unknown> {
  return {
    id: requestIdFrom(request),
    method: request.method,
    path: pathOnly(request.url),
    route: request.route?.path,
  };
}

function safeResponseSerializer(response: LoggableResponse): Record<string, unknown> {
  return { statusCode: response.statusCode };
}

/** Redundant, explicit redaction for any future non-whitelisted log payload. */
export const LOG_REDACT_PATHS: readonly string[] = Object.freeze([
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'req.headers["x-api-key"]',
  'req.headers["x-csrf-token"]',
  'req.body',
  '*.password',
  '*.token',
  '*.secret',
  '*.authorization',
  '*.cookie',
]);

export const pinoLoggerOptions: LoggerOptions = {
  level: process.env['LOG_LEVEL'] ?? 'info',
  redact: { paths: [...LOG_REDACT_PATHS], censor: '[REDACTED]' },
  base: { service: 'ecom-v1-api' },
  serializers: {
    req: safeRequestSerializer,
    res: safeResponseSerializer,
  },
};

/** `nestjs-pino` options: logger config plus request-completion behaviour. */
export const pinoHttpOptions = {
  ...pinoLoggerOptions,
  genReqId: requestIdFrom,
  customProps: (request: LoggableRequest, response: LoggableResponse): Record<string, unknown> =>
    createRequestLogContext(request, response),
  autoLogging: true,
};
