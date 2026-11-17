import { ValidationPipe, type ValidationPipeOptions } from '@nestjs/common';

/**
 * The one global validation policy for every HTTP body, query and param.
 *
 * `whitelist` strips fields that are not declared on a DTO and
 * `forbidNonWhitelisted` turns that into a rejection instead of a silent drop.
 * `forbidUnknownValues` rejects values with no validation metadata at all, so
 * an untyped `object` boundary cannot bypass the contract (threat T-05-01).
 */
export const API_VALIDATION_OPTIONS = {
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
  forbidUnknownValues: true,
} as const satisfies ValidationPipeOptions;

/** Global pipe with the project's validation policy fixed in one place. */
export class ApiValidationPipe extends ValidationPipe {
  constructor() {
    super(API_VALIDATION_OPTIONS);
  }
}
