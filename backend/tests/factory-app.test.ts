import request from 'supertest';
import { afterEach, it, expect, vi } from 'vitest';
import { createApp } from '../src/factory.ts';
import type { Database } from '../src/features/todos/types.ts';

afterEach(() => vi.restoreAllMocks());

function setup() {
  const todo = { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) };
  return { app: createApp({ todo } as unknown as Database), todo };
}

it('serves health and unknown routes', async () => {
  const { app } = setup();
  expect((await request(app).get('/api/health')).body).toEqual({ status: 'ok' });
  const missing = await request(app).get('/nope');
  expect(missing.status).toBe(404);
  expect(missing.body).toEqual({ detail: 'Not Found' });
});
it('does not expose x-powered-by and serves the spec', async () => {
  const { app } = setup();
  const response = await request(app).get('/openapi.json');
  expect(response.status).toBe(200);
  expect(response.headers['x-powered-by']).toBeUndefined();
});
it('maps malformed JSON to 422', async () => {
  const { app } = setup();
  const response = await request(app).post('/api/todos').set('Content-Type', 'application/json').send('{bad');
  expect(response.status).toBe(422);
  expect(response.body).toEqual({ detail: 'Invalid JSON.' });
});
it('maps oversized bodies to 413', async () => {
  const { app } = setup();
  const response = await request(app).post('/api/todos').send({ title: 'x'.repeat(200_000) });
  expect(response.status).toBe(413);
  expect(response.body).toEqual({ detail: 'Request body too large.' });
});
it('hides unexpected errors behind a 500', async () => {
  const { app, todo } = setup();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  todo.findMany.mockRejectedValue(new Error('boom'));
  const response = await request(app).get('/api/todos');
  expect(response.status).toBe(500);
  expect(response.body).toEqual({ detail: 'Internal Server Error' });
});
