import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  type ExceptionFilter,
} from '@nestjs/common';
import { pino } from 'pino';
import {
  pinoLoggerOptions,
  requestIdFrom,
  type LoggableRequest,
} from '../logging/pino.config';
import {
  API_ERROR_CODES,
  API_ERROR_MESSAGES,
  type ApiErrorBody,
  type ApiErrorDetail,
  type ApiErrorCode,
} from './api-error';

/** Minimal server-side sink so error detail can be captured and asserted. */
export interface ExceptionSink {
  error(payload: Record<string, unknown>, message: string): void;
}

const serverLogger = pino(pinoLoggerOptions);
const defaultSink: ExceptionSink = {
  error(payload: Record<string, unknown>, message: string): void {
    serverLogger.error(payload, message);
  },
};

interface MappedError {
  readonly statusCode: number;
  readonly code: ApiErrorCode;
  readonly details?: readonly ApiErrorDetail[];
}

const MAX_TOKEN_LENGTH = 128;
const SAFE_TOKEN = /^[A-Za-z0-9_.:-]+$/;

/** Keep only a short structural token — never an echo of arbitrary input. */
function safeToken(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_TOKEN_LENGTH && SAFE_TOKEN.test(trimmed)
    ? trimmed
    : undefined;
}

/**
 * Pull safe field/constraint tokens out of class-validator's error payload.
 * Everything that is not a short structural token is discarded.
 */
function validationDetails(exception: BadRequestException): readonly ApiErrorDetail[] {
  const response = exception.getResponse();
  const raw = typeof response === 'object' && response !== null && 'message' in response
    ? (response as { message: unknown }).message
    : undefined;
  if (!Array.isArray(raw)) return [];

  const details: ApiErrorDetail[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string') {
      const match = /^property\s+([A-Za-z0-9_.:-]+)\s+/.exec(entry);
      const field = match?.[1];
      if (field !== undefined) {
        details.push({ field, constraint: 'invalid' });
      }
      continue;
    }
    if (typeof entry === 'object' && entry !== null) {
      const record = entry as { property?: unknown; constraints?: unknown };
      const field = safeToken(record.property);
      const constraints = record.constraints;
      const firstConstraint =
        typeof constraints === 'object' && constraints !== null
          ? safeToken(Object.keys(constraints)[0])
          : undefined;
      if (field !== undefined) {
        details.push({ field, constraint: firstConstraint ?? 'invalid' });
      }
    }
  }
  return details;
}

function isValidationFailure(exception: BadRequestException): boolean {
  const response = exception.getResponse();
  return (
    typeof response === 'object' &&
    response !== null &&
    'message' in response &&
    Array.isArray((response as { message: unknown }).message)
  );
}

function mapException(exception: unknown): MappedError {
  if (exception instanceof BadRequestException) {
    if (isValidationFailure(exception)) {
      return {
        statusCode: 400,
        code: API_ERROR_CODES.VALIDATION_FAILED,
        details: validationDetails(exception),
      };
    }
    return { statusCode: 400, code: API_ERROR_CODES.BAD_REQUEST };
  }
  if (exception instanceof UnauthorizedException) {
    return { statusCode: 401, code: API_ERROR_CODES.UNAUTHENTICATED };
  }
  if (exception instanceof ForbiddenException) {
    return { statusCode: 403, code: API_ERROR_CODES.FORBIDDEN };
  }
  if (exception instanceof NotFoundException) {
    return { statusCode: 404, code: API_ERROR_CODES.NOT_FOUND };
  }
  if (exception instanceof ConflictException) {
    return { statusCode: 409, code: API_ERROR_CODES.CONFLICT };
  }
  if (exception instanceof ServiceUnavailableException) {
    return { statusCode: 503, code: API_ERROR_CODES.SERVICE_UNAVAILABLE };
  }
  if (exception instanceof HttpException) {
    return { statusCode: exception.getStatus(), code: API_ERROR_CODES.HTTP_ERROR };
  }
  return { statusCode: 500, code: API_ERROR_CODES.INTERNAL_ERROR };
}

/** Server-only detail derived from the thrown value; never sent to a client. */
function errorDetail(exception: unknown): Record<string, unknown> {
  if (exception instanceof Error) {
    return { name: exception.name, message: exception.message, stack: exception.stack };
  }
  return { exception: String(exception) };
}

/**
 * One global exception-to-envelope translation (threat T-05-02).
 *
 * Client responses contain only a status, a stable code, fixed prose and a
 * request id. The original message/stack/SQL detail goes exclusively to the
 * server-side sink, which the production bootstrap wires to Pino.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly sink: ExceptionSink = defaultSink) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<LoggableRequest>();
    const response = context.getResponse<{
      status(code: number): { json(body: ApiErrorBody): void };
    }>();
    const mapped = mapException(exception);
    const requestId = requestIdFrom(request);

    this.sink.error(
      {
        err: errorDetail(exception),
        requestId,
        route: request.route?.path,
        code: mapped.code,
        statusCode: mapped.statusCode,
      },
      'request failed',
    );

    const body: ApiErrorBody = {
      statusCode: mapped.statusCode,
      code: mapped.code,
      message: API_ERROR_MESSAGES[mapped.code],
      requestId,
      ...(mapped.details !== undefined && mapped.details.length > 0
        ? { details: mapped.details }
        : {}),
    };
    response.status(mapped.statusCode).json(body);
  }
}
