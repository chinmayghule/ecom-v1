/**
 * Stable, machine-readable error codes for the API error envelope.
 *
 * Codes are intentionally coarse categories — never provider/SQL details. A
 * client can branch on these without parsing prose messages.
 */
export const API_ERROR_CODES = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  HTTP_ERROR: 'HTTP_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

/** Field-level validation detail: tokens only, never raw input values. */
export interface ApiErrorDetail {
  readonly field: string;
  readonly constraint: string;
}

/** The single sanitized error envelope returned by the global filter. */
export interface ApiErrorBody {
  readonly statusCode: number;
  readonly code: ApiErrorCode;
  readonly message: string;
  readonly requestId: string;
  readonly details?: readonly ApiErrorDetail[];
}

/** Safe, stable client-facing prose. Never derived from the thrown error. */
export const API_ERROR_MESSAGES: Readonly<Record<ApiErrorCode, string>> = Object.freeze({
  VALIDATION_FAILED: 'The request contains invalid or undeclared fields.',
  BAD_REQUEST: 'The request could not be understood.',
  UNAUTHENTICATED: 'Authentication is required.',
  FORBIDDEN: 'You are not permitted to perform this action.',
  NOT_FOUND: 'The requested resource was not found.',
  CONFLICT: 'The request conflicts with the current state.',
  SERVICE_UNAVAILABLE: 'A required dependency is temporarily unavailable.',
  HTTP_ERROR: 'The request could not be completed.',
  INTERNAL_ERROR: 'An unexpected error occurred.',
} as const);
