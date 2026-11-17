import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

/**
 * The single code-first OpenAPI assembler for the API.
 *
 * This is the ONLY place in the repository that builds an OpenAPI document.
 * Later plans (notably Plan 07's current-profile path) extend THIS file rather
 * than creating a second DocumentBuilder, provider or document source. The
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

/** Register the one generated document and its UI path on the application. */
export function setupOpenApi(app: INestApplication): void {
  const document = buildOpenApiDocument(app);
  SwaggerModule.setup(OPENAPI_PATH, app, document);
}
