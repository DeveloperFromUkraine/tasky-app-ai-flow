import { afterEach, it, expect, vi } from 'vitest';
import { createDatabase, initialize } from '../src/core/database.ts';
import type { Database } from '../src/features/todos/types.ts';

afterEach(() => vi.restoreAllMocks());

it('runs the table DDL on initialize', async () => {
  const database = createDatabase('postgresql://test:test@localhost:5432/test');
  const spy = vi.spyOn(database, '$executeRaw').mockResolvedValue(0 as never);
  await initialize(database as unknown as Database);
  expect(spy).toHaveBeenCalledTimes(1);
  expect((spy.mock.calls[0][0] as unknown as string[]).join('')).toContain('CREATE TABLE IF NOT EXISTS todos');
});
