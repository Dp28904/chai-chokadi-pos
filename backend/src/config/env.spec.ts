import { loadEnv } from './env';

const good = {
  DATABASE_URL: 'postgresql://x',
  JWT_SECRET: 'a'.repeat(40),
  ADMIN_PASSWORD: 'long-enough-pw',
};

describe('loadEnv', () => {
  it('accepts a valid config', () => {
    expect(loadEnv({ ...good, NODE_ENV: 'production' }).production).toBe(true);
  });

  it('rejects a weak JWT secret', () => {
    expect(() => loadEnv({ ...good, JWT_SECRET: 'change-me' })).toThrow(/JWT_SECRET/);
  });

  it('rejects the default admin password in production only', () => {
    expect(() => loadEnv({ ...good, ADMIN_PASSWORD: 'admin123', NODE_ENV: 'production' })).toThrow(
      /ADMIN_PASSWORD/,
    );
    expect(() => loadEnv({ ...good, ADMIN_PASSWORD: 'admin123' })).not.toThrow();
  });

  it('requires DATABASE_URL', () => {
    expect(() => loadEnv({ ...good, DATABASE_URL: '' })).toThrow(/DATABASE_URL/);
  });
});
