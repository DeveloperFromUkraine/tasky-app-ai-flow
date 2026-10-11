import express from 'express';
import request from 'supertest';
import { afterEach, it, expect, vi } from 'vitest';
import { createHealthRouter } from '../src/api/health.ts';
import { resolveDatabaseUrl } from '../src/core/config.ts';
import { createTodosRouter } from '../src/features/todos/router.ts';
import { todo } from './fixture.ts';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

function setup() {
  const repository = { list: vi.fn(), create: vi.fn(), get: vi.fn(), update: vi.fn(), delete: vi.fn() };
  const app = express();
  app.use(express.json());
  app.use('/api/todos', createTodosRouter(repository));
  return { app, repository };
}

it('reports health after querying the database', async () => {
  const database = { todo: { findFirst: vi.fn().mockResolvedValue(null) } };
  const app = express();
  app.use('/api', createHealthRouter(database as never));
  const response = await request(app).get('/api/health');
  expect(response.body).toEqual({ status: 'ok' });
  expect(database.todo.findFirst).toHaveBeenCalledOnce();
});
it('gets a task and returns 404 when missing', async () => {
  const { app, repository } = setup();
  repository.get.mockResolvedValueOnce(todo).mockResolvedValueOnce(null);
  expect((await request(app).get('/api/todos/1')).body).toEqual(todo);
  expect(repository.get).toHaveBeenCalledWith(1);
  expect((await request(app).get('/api/todos/2')).status).toBe(404);
});
it('rejects a non-numeric id with 422', async () => {
  const { app, repository } = setup();
  expect((await request(app).get('/api/todos/abc')).status).toBe(422);
  expect(repository.get).not.toHaveBeenCalled();
});
it('patches a task, 404s when missing and 422s on empty body', async () => {
  const { app, repository } = setup();
  repository.update.mockResolvedValueOnce(todo).mockResolvedValueOnce(null);
  expect((await request(app).patch('/api/todos/1').send({ completed: true })).body).toEqual(todo);
  expect(repository.update).toHaveBeenCalledWith(1, { completed: true });
  expect((await request(app).patch('/api/todos/1').send({ completed: true })).status).toBe(404);
  expect((await request(app).patch('/api/todos/1').send({})).status).toBe(422);
});
it('deletes a task with 204 and 404s when missing', async () => {
  const { app, repository } = setup();
  repository.delete.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  expect((await request(app).delete('/api/todos/1')).status).toBe(204);
  expect((await request(app).delete('/api/todos/1')).status).toBe(404);
});

it('prefers the override, then DATABASE_URL, and normalises the psycopg scheme', () => {
  vi.stubEnv('DATABASE_URL', 'postgresql+psycopg://a:b@h:1/d');
  expect(resolveDatabaseUrl()).toBe('postgresql://a:b@h:1/d');
  expect(resolveDatabaseUrl('postgresql://x:y@z:2/w')).toBe('postgresql://x:y@z:2/w');
});
it('builds the URL from parts and reports a missing variable', () => {
  vi.stubEnv('DATABASE_URL', '');
  vi.stubEnv('POSTGRES_USER', 'u');
  vi.stubEnv('POSTGRES_PASSWORD', 'p');
  vi.stubEnv('POSTGRES_HOST', 'host');
  vi.stubEnv('DB_PORT', '5433');
  vi.stubEnv('POSTGRES_DB', 'my db');
  expect(resolveDatabaseUrl()).toBe('postgresql://u:p@host:5433/my%20db');
  vi.stubEnv('POSTGRES_HOST', '');
  expect(() => resolveDatabaseUrl()).toThrow('Missing environment variable: POSTGRES_HOST');
});
