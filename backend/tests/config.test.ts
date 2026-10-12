import { afterEach, it, expect, vi } from 'vitest';
import { resolveDatabaseUrl } from '../src/core/config.ts';

afterEach(() => vi.unstubAllEnvs());

it('prefers the override and rewrites the psycopg scheme', () => {
  vi.stubEnv('DATABASE_URL', 'postgresql://env/db');
  expect(resolveDatabaseUrl('postgresql+psycopg://u:p@h:1/d')).toBe('postgresql://u:p@h:1/d');
  expect(resolveDatabaseUrl()).toBe('postgresql://env/db');
});
it('builds the URL from parts', () => {
  vi.stubEnv('DATABASE_URL', '');
  vi.stubEnv('POSTGRES_USER', 'user');
  vi.stubEnv('POSTGRES_PASSWORD', 'pw');
  vi.stubEnv('POSTGRES_HOST', 'dbhost');
  vi.stubEnv('DB_PORT', '5433');
  vi.stubEnv('POSTGRES_DB', 'my db');
  expect(resolveDatabaseUrl()).toBe('postgresql://user:pw@dbhost:5433/my%20db');
});
it('names a missing variable', () => {
  vi.stubEnv('DATABASE_URL', '');
  vi.stubEnv('POSTGRES_USER', 'user');
  vi.stubEnv('POSTGRES_PASSWORD', '');
  expect(() => resolveDatabaseUrl()).toThrow('Missing environment variable: POSTGRES_PASSWORD');
});
