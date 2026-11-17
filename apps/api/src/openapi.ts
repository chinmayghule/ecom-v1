import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

/**
 * The single code-first OpenAPI assembler for the API.
 *
 * This is the ONLY place in the repository that builds an OpenAPI document.
 * Plan 07 extends THIS file with the current-profile path and bearer metadata;
 * it never creates a second DocumentBuilder, provider or document source. The
 * document is a baseline contract surface in Phase 1 — it is not frozen and no
 * client is generated from it here.
 */

export const OPENAPI_TITLE = 'ecom-v1 API';
export const OPENAPI_DESCRIPTION =
  'Backend-enforced marketplace API for customers, merchants and platform admins.';
/** Base contract version; frozen only at the Phase 4 backend→frontend handoff. */
export const OPENAPI_VERSION = '0.1.0';
export const OPENAPI_PATH = 'api/docs';
export const BEARER_SECURITY_SCHEME = 'bearer';

/**
 * Project-level client generator decision, recorded here for the contract
 * freeze. Phase 4 owns installing `@hey-api/openapi-ts` at exactly 0.99.0,
 * generating the frontend client and enforcing the drift/freeze gate. It is
 * deliberately NOT a Phase 1 dependency and no client is generated here.
 */
export const PLANNED_CLIENT_GENERATOR = '@hey-api/openapi-ts';
export const PLANNED_CLIENT_GENERATOR_VERSION = '0.99.0';

/** Build the document from decorators on the registered controllers. */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle(OPENAPI_TITLE)
    .setDescription(OPENAPI_DESCRIPTION)
    .setVersion(OPENAPI_VERSION)
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Clerk-issued session token (verify via @clerk/backend).',
      },
      BEARER_SECURITY_SCHEME,
    )
    .build();
  return SwaggerModule.createDocument(app, config);
}

/**
 * Recursively order object keys so the emitted baseline is byte-for-byte
 * deterministic across runs and machines (arrays keep their order).
 */
function stableValue(_key: string, value: unknown): unknown {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const source = value as Record<string, unknown>;
    const ordered: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      ordered[key] = source[key];
    }
    return ordered;
  }
  return value;
}

/** Deterministic JSON for the inspectable, gitignored baseline artifact. */
export function serializeOpenApiBaseline(document: OpenAPIObject): string {
  return `${JSON.stringify(document, stableValue, 2)}\n`;
}

/** Register the one generated document and its UI path on the application. */
export function setupOpenApi(app: INestApplication): void {
  const document = buildOpenApiDocument(app);
  SwaggerModule.setup(OPENAPI_PATH, app, document);
}
