import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

const flag = z.enum(['0', '1', 'true', 'false']).transform((value) => value === '1' || value === 'true');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),

    DATABASE_URL: z.string().min(1),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET doit contenir au moins 32 caractères'),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    LOGIN_MAX_FAILED_ATTEMPTS: z.coerce.number().int().min(3).max(50).default(5),
    LOGIN_LOCK_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),

    RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(60),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(20),

    CORS_ORIGINS: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),
    TRUST_PROXY: flag.default(false),
    APP_WEB_URL: z.url().default('http://localhost:5173'),
    SWAGGER_ENABLED: flag.optional(),

    // `log` = console (dev), `smtp` = serveur SMTP, `http` = API HTTP (Brevo/Resend).
    // `http` est le seul pilote utilisable quand l'hébergeur bloque les ports SMTP sortants.
    MAIL_DRIVER: z.enum(['log', 'smtp', 'http']).default('log'),
    MAIL_HOST: z.string().optional(),
    MAIL_PORT: z.coerce.number().int().min(1).max(65535).optional(),
    MAIL_USER: z.string().optional(),
    MAIL_PASSWORD: z.string().optional(),
    MAIL_FROM: z.string().optional(),
    MAIL_HTTP_PROVIDER: z.enum(['brevo', 'resend']).optional(),
    MAIL_HTTP_API_KEY: z.string().optional(),
    /** Surcharge de l'URL du fournisseur (tests, passerelle interne). */
    MAIL_HTTP_ENDPOINT: z.url().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    if (env.JWT_ACCESS_SECRET.includes('__GENERATED')) {
      ctx.addIssue({ code: 'custom', path: ['JWT_ACCESS_SECRET'], message: 'secret non initialisé' });
    }
    if (env.MAIL_DRIVER === 'log') {
      ctx.addIssue({
        code: 'custom',
        path: ['MAIL_DRIVER'],
        message: "le pilote `log` n'envoie aucun e-mail : interdit en production (utilisez 'smtp' ou 'http')",
      });
    }
    if (env.MAIL_DRIVER === 'http') {
      const required: Array<'MAIL_HTTP_PROVIDER' | 'MAIL_HTTP_API_KEY' | 'MAIL_FROM'> = [
        'MAIL_HTTP_PROVIDER',
        'MAIL_HTTP_API_KEY',
        'MAIL_FROM',
      ];
      for (const key of required) {
        if (!env[key]) {
          ctx.addIssue({ code: 'custom', path: [key], message: `requis quand MAIL_DRIVER='http'` });
        }
      }
    }
    if (env.MAIL_DRIVER === 'smtp') {
      const required: Array<'MAIL_HOST' | 'MAIL_USER' | 'MAIL_PASSWORD' | 'MAIL_FROM'> = [
        'MAIL_HOST',
        'MAIL_USER',
        'MAIL_PASSWORD',
        'MAIL_FROM',
      ];
      for (const key of required) {
        if (!env[key]) {
          ctx.addIssue({ code: 'custom', path: [key], message: `requis quand MAIL_DRIVER='smtp'` });
        }
      }
      if (env.MAIL_PORT === undefined) {
        ctx.addIssue({ code: 'custom', path: ['MAIL_PORT'], message: `requis quand MAIL_DRIVER='smtp'` });
      }
    }
  });

export type AppConfig = z.infer<typeof envSchema>;

let cached: AppConfig | undefined;

/**
 * Charge et valide la configuration une seule fois. Échoue immédiatement
 * (fail fast) si une variable est absente ou invalide.
 */
export function getConfig(): AppConfig {
  if (cached) return cached;

  // .env à la racine du monorepo (src/config et dist/config sont à la même profondeur).
  // N'écrase jamais une variable déjà définie dans l'environnement.
  dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '..', '.env'), quiet: true });

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(racine)'} : ${issue.message}`)
      .join('\n');
    throw new Error(`Configuration invalide :\n${details}`);
  }
  cached = parsed.data;
  return cached;
}

/** Réservé aux tests : force la relecture de process.env. */
export function resetConfigCache(): void {
  cached = undefined;
}

export const APP_CONFIG = Symbol('APP_CONFIG');
