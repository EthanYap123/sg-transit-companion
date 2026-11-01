import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_VERSION: z.string().default('0.0.0'),
  GIT_COMMIT: z.string().default('local'),
  LTA_ACCOUNT_KEY: z.string().default(''),
  LTA_BASE_URL: z.url().default('https://datamall2.mytransport.sg/ltaodataservice'),
  /** Empty means no Redis: the API runs on its in-memory cache alone. */
  REDIS_URL: z.string().default(''),
  REDIS_KEY_PREFIX: z.enum(['dev', 'test', 'stg', 'prod']).default('dev'),
  REDIS_DAILY_COMMAND_BUDGET: z.coerce.number().int().nonnegative().default(12_000),
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
