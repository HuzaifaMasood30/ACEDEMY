import { z } from 'zod';

/**
 * Environment contract. Parsing at module load means a misconfigured deployment
 * fails immediately and loudly instead of at the first request that needs the value.
 */
const booleanish = (defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((v) =>
      v === undefined ? defaultValue : ['true', '1', 'yes'].includes(v.toLowerCase()),
    );

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_APP_NAME: z.string().default('Academy ERP'),

  AUTH_SECRET: z.string().min(16, 'AUTH_SECRET must be at least 16 characters'),
  AUTH_TRUST_HOST: booleanish(true),
  SESSION_MAX_AGE: z.coerce.number().int().positive().default(28800),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),

  ACADEMY_NAME: z.string().default('Academy'),
  ACADEMY_TIMEZONE: z.string().default('Asia/Karachi'),
  ACADEMY_CURRENCY: z.string().default('PKR'),
  ACADEMY_LOCALE: z.string().default('en'),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./storage/uploads'),
  STORAGE_MAX_FILE_MB: z.coerce.number().int().positive().default(10),
  S3_ENDPOINT: z.string().optional().default(''),
  S3_REGION: z.string().optional().default(''),
  S3_BUCKET: z.string().optional().default(''),
  S3_ACCESS_KEY_ID: z.string().optional().default(''),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(''),
  S3_FORCE_PATH_STYLE: booleanish(true),

  WHATSAPP_MODE: z.enum(['mock', 'cloud']).default('mock'),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional().default(''),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional().default(''),
  WHATSAPP_ACCESS_TOKEN: z.string().optional().default(''),
  WHATSAPP_GRAPH_API_VERSION: z.string().default('v21.0'),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().optional().default(''),
  WHATSAPP_APP_SECRET: z.string().optional().default(''),
  WHATSAPP_API_BASE: z.string().default('https://graph.facebook.com'),
  WHATSAPP_DEFAULT_LOCALE: z.string().default('en'),
  WHATSAPP_QUIET_HOURS_START: z.string().default('21:00'),
  WHATSAPP_QUIET_HOURS_END: z.string().default('07:00'),
  WHATSAPP_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(60),

  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  WORKER_BATCH_SIZE: z.coerce.number().int().positive().default(25),
  WORKER_MAX_ATTEMPTS: z.coerce.number().int().positive().default(4),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(4),

  SEED_DEFAULT_PASSWORD: z.string().default('Academy@123'),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return parsed.data;
}

export const env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

/** True when the WhatsApp adapter is configured to talk to the real Cloud API. */
export const whatsappLiveMode =
  env.WHATSAPP_MODE === 'cloud' &&
  env.WHATSAPP_ACCESS_TOKEN.length > 0 &&
  env.WHATSAPP_PHONE_NUMBER_ID.length > 0;
