import { plainToInstance } from 'class-transformer';
import { IsNotEmpty, IsString, Matches, validateSync } from 'class-validator';

/**
 * The single typed configuration boundary for the API.
 *
 * Startup fails closed when a required value is absent or malformed. Errors
 * name only the offending environment variable — never its value — so a
 * connection string or secret can never reach a log or an HTTP response
 * (threat T-04-03).
 */

/** Conservative, explicit pool ceiling for the runtime pg adapter (T-04-05). */
export const DATABASE_POOL_MAX = 5;
export const DATABASE_ACQUIRE_TIMEOUT_MS = 5_000;
export const DATABASE_IDLE_TIMEOUT_MS = 10_000;

export const REQUIRED_ENV_KEYS = [
  'DATABASE_URL',
  'DIRECT_URL',
  'CLERK_SECRET_KEY',
  'CLERK_JWT_KEY',
  'CLERK_WEB_ORIGIN',
  'ADMIN_EMAILS',
  'TOMBSTONE_SECRET',
] as const;

export type RequiredEnvKey = (typeof REQUIRED_ENV_KEYS)[number];

class RuntimeEnv {
  @IsString()
  @IsNotEmpty()
  @Matches(/^postgres(?:ql)?:\/\//, { message: 'must be a postgres:// or postgresql:// URL' })
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^postgres(?:ql)?:\/\//, { message: 'must be a postgres:// or postgresql:// URL' })
  DIRECT_URL!: string;

  @IsString()
  @IsNotEmpty()
  CLERK_SECRET_KEY!: string;

  @IsString()
  @IsNotEmpty()
  CLERK_JWT_KEY!: string;

  @IsString()
  @IsNotEmpty()
  CLERK_WEB_ORIGIN!: string;

  @IsString()
  @IsNotEmpty()
  ADMIN_EMAILS!: string;

  @IsString()
  @IsNotEmpty()
  TOMBSTONE_SECRET!: string;
}

export interface AppConfig {
  /** Pooled runtime connection — used by PrismaService/pg. */
  readonly databaseUrl: string;
  /** Direct connection — used only by migration CLI commands. */
  readonly directUrl: string;
  readonly clerkSecretKey: string;
  readonly clerkJwtKey: string;
  readonly clerkWebOrigin: string;
  readonly adminEmails: readonly string[];
  /** Server-side HMAC secret for permanent keyed tombstones; never persisted raw. */
  readonly tombstoneSecret: string;
  readonly databasePoolMax: number;
  readonly databaseAcquireTimeoutMs: number;
  readonly databaseIdleTimeoutMs: number;
}

/** Error whose message contains only variable names, never values. */
export class ConfigurationError extends Error {
  constructor(readonly invalidKeys: readonly RequiredEnvKey[]) {
    super(
      `Invalid runtime configuration: ${invalidKeys.join(', ')}. ` +
        'Set these environment variables; values are intentionally never logged.',
    );
    this.name = 'ConfigurationError';
  }
}

/**
 * Validate the process environment and return a typed, immutable config.
 * Throws ConfigurationError listing only the names of invalid variables.
 */
export function validateEnv(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const picked: Record<string, string | undefined> = {};
  for (const key of REQUIRED_ENV_KEYS) {
    picked[key] = env[key];
  }

  const parsed = plainToInstance(RuntimeEnv, picked);
  const errors = validateSync(parsed, { forbidUnknownValues: false });
  if (errors.length > 0) {
    const invalidKeys = REQUIRED_ENV_KEYS.filter((key) =>
      errors.some((error) => error.property === key),
    );
    throw new ConfigurationError(
      invalidKeys.length > 0 ? invalidKeys : [...REQUIRED_ENV_KEYS],
    );
  }

  const adminEmails = parsed.ADMIN_EMAILS.split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);

  return Object.freeze<AppConfig>({
    databaseUrl: parsed.DATABASE_URL,
    directUrl: parsed.DIRECT_URL,
    clerkSecretKey: parsed.CLERK_SECRET_KEY,
    clerkJwtKey: parsed.CLERK_JWT_KEY,
    clerkWebOrigin: parsed.CLERK_WEB_ORIGIN,
    adminEmails: Object.freeze(adminEmails),
    tombstoneSecret: parsed.TOMBSTONE_SECRET,
    databasePoolMax: DATABASE_POOL_MAX,
    databaseAcquireTimeoutMs: DATABASE_ACQUIRE_TIMEOUT_MS,
    databaseIdleTimeoutMs: DATABASE_IDLE_TIMEOUT_MS,
  });
}
