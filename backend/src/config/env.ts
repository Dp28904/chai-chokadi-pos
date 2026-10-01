/**
 * Reads and validates environment variables once, at startup.
 * The app refuses to boot with a missing or weak configuration.
 */
export interface Env {
  production: boolean;
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  corsOrigin: string | null;
  adminUsername: string;
  adminPassword: string;
}

const WEAK_SECRETS = new Set(['change-me', 'secret', 'changeme', 'jwt-secret']);

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const production = source.NODE_ENV === 'production';
  const errors: string[] = [];

  const databaseUrl = source.DATABASE_URL ?? '';
  if (!databaseUrl) errors.push('DATABASE_URL is required');

  const jwtSecret = source.JWT_SECRET ?? '';
  if (jwtSecret.length < 32 || WEAK_SECRETS.has(jwtSecret)) {
    errors.push('JWT_SECRET must be a random string of at least 32 characters (try: openssl rand -hex 32)');
  }

  const adminUsername = (source.ADMIN_USERNAME ?? 'admin').trim();
  const adminPassword = source.ADMIN_PASSWORD ?? '';
  if (production && (adminPassword.length < 8 || adminPassword === 'admin123')) {
    errors.push('ADMIN_PASSWORD must be at least 8 characters and not the default in production');
  }

  const port = Number(source.PORT ?? 3000);
  if (!Number.isInteger(port) || port <= 0) errors.push('PORT must be a positive integer');

  if (errors.length) {
    throw new Error(`Invalid configuration:\n  - ${errors.join('\n  - ')}`);
  }

  return {
    production,
    port,
    databaseUrl,
    jwtSecret,
    corsOrigin: source.CORS_ORIGIN?.trim() || null,
    adminUsername,
    adminPassword,
  };
}

export const ENV = Symbol('ENV');
