import { z } from 'zod';

/**
 * Boot-time env validation. The app refuses to start with an invalid/missing
 * config rather than failing mysteriously at runtime. Wired into ConfigModule
 * via `validate` (see app.module.ts).
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000,http://localhost:3001')
    .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),

  DATABASE_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(8),
  JWT_REFRESH_SECRET: z.string().min(8),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(60 * 60 * 24 * 30),
  // Empty string = host-only cookie on the API's own domain. Required when the
  // frontend lives on a different registrable domain (e.g. Vercel) than the API
  // (e.g. Render) — there's no shared parent domain to scope the cookie to.
  COOKIE_DOMAIN: z.string().default('localhost'),
  COOKIE_SECURE: z
    .string()
    .default('false')
    .transform((s) => s === 'true'),
  // SameSite policy for auth/cart cookies. Use 'none' for cross-site setups
  // (frontend and API on different domains); browsers require Secure=true then.
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),

  // R2 is optional — uploads are disabled (503) when unset.
  R2_ACCOUNT_ID: z.string().optional().default(''),
  R2_ACCESS_KEY_ID: z.string().optional().default(''),
  R2_SECRET_ACCESS_KEY: z.string().optional().default(''),
  R2_BUCKET: z.string().optional().default('nexlor-commerce'),
  R2_PUBLIC_BASE_URL: z.string().optional().default(''),
  R2_ENDPOINT: z.string().optional().default(''),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
