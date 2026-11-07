import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_VERSION: z.string().default('0.0.0'),
  GIT_COMMIT: z.string().default('local'),
  LTA_ACCOUNT_KEY: z.string().default(''),
  LTA_BASE_URL: z.url().default('https://datamall2.mytransport.sg/ltaodataservice'),
  DATABASE_URL: z.string().default(''),
  /** Comma-separated web origins allowed to call the public API from a browser. */
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  /** Bearer token for /internal/* routes. Empty keeps them closed. */
  CRON_SECRET: z.string().default(''),
  /** Empty means no Redis: the API runs on its in-memory cache alone. */
  REDIS_URL: z.string().default(''),
  REDIS_KEY_PREFIX: z.enum(['dev', 'test', 'stg', 'prod']).default('dev'),
  REDIS_DAILY_COMMAND_BUDGET: z.coerce.number().int().nonnegative().default(12_000),
  RATE_LIMIT_PUBLIC_PER_MINUTE: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_INTERNAL_PER_MINUTE: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_USER_READS_PER_MINUTE: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_USER_WRITES_PER_MINUTE: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_FAILED_AUTH_PER_MINUTE: z.coerce.number().int().positive().default(30),
  /** Shared with the web app; signs the short-lived API token. Empty keeps user routes closed. */
  API_JWT_SECRET: z.string().default(''),
  /**
   * How many proxies sit in front of the API. Needed to see real client addresses for rate limiting.
   * Leave at 0 unless behind a proxy: a higher value lets callers fake their address.
   */
  TRUST_PROXY: z.coerce.number().int().nonnegative().default(0),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  return parsed.data;
}
