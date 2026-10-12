import { afterEach, it, expect, vi } from 'vitest';
import { createDatabase, initialize } from '../src/core/database.ts';
import { start } from '../src/core/lifespan.ts';

vi.mock('../src/core/database.ts', () => ({ createDatabase: vi.fn(), initialize: vi.fn() }));

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

function setup() {
  const todo = { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) };
  const database = { $connect: vi.fn().mockResolvedValue(undefined), $disconnect: vi.fn().mockResolvedValue(undefined), todo };
  vi.mocked(createDatabase).mockReturnValue(database as never);
  vi.mocked(initialize).mockResolvedValue(undefined);
  vi.stubEnv('API_PORT', '0');
  vi.stubEnv('DATABASE_URL', 'postgresql://test:test@localhost:5432/test');
  return database;
}

it('connects, initializes, listens and registers signal handlers', async () => {
  const database = setup();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const onceSpy = vi.spyOn(process, 'once').mockImplementation(() => process);
  const result = await start();
  try {
    expect(database.$connect).toHaveBeenCalled();
    expect(initialize).toHaveBeenCalledWith(database);
    expect(onceSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    expect(onceSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    expect(result.server.listening).toBe(true);
    // the shutdown handler closes the server and disconnects the database
    const shutdown = onceSpy.mock.calls.find((call) => call[0] === 'SIGTERM')![1] as () => void;
    shutdown();
    await vi.waitFor(() => expect(database.$disconnect).toHaveBeenCalled());
  } finally {
    if (result.server.listening) await new Promise((resolve) => result.server.close(resolve));
  }
});
it('logs a disconnect failure during shutdown', async () => {
  const database = setup();
  database.$disconnect.mockRejectedValue(new Error('x'));
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const onceSpy = vi.spyOn(process, 'once').mockImplementation(() => process);
  const previous = process.exitCode;
  const { server } = await start();
  (onceSpy.mock.calls.find((call) => call[0] === 'SIGINT')![1] as () => void)();
  await vi.waitFor(() => expect(error).toHaveBeenCalled());
  process.exitCode = previous;
  if (server.listening) await new Promise((resolve) => server.close(resolve));
});
it('disconnects and rethrows when startup fails', async () => {
  const database = setup();
  database.$connect.mockRejectedValue(new Error('down'));
  await expect(start()).rejects.toThrow('down');
  expect(database.$disconnect).toHaveBeenCalled();
});
