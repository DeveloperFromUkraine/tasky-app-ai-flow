import express from 'express';
import request from 'supertest';
import { it, expect, vi, afterEach } from 'vitest';
import { todoStats } from '../src/features/todos/stats.ts';
import { createTodosRouter } from '../src/features/todos/router.ts';

afterEach(() => vi.useRealTimers());

it('counts total, completed, open, overdue and due soon todos', () => {
  const todos = [
    { due_date: '2026-03-01', completed: false },
    { due_date: '2026-03-11', completed: false },
    { due_date: '2026-03-20', completed: false },
    { due_date: '2026-03-01', completed: true },
    { due_date: null, completed: false },
  ];
  expect(todoStats(todos, '2026-03-10')).toEqual({ total: 5, completed: 1, open: 4, overdue: 1, dueSoon: 1 });
});
it('returns zeros for an empty list', () => {
  expect(todoStats([], '2026-03-10')).toEqual({ total: 0, completed: 0, open: 0, overdue: 0, dueSoon: 0 });
});
it('serves stats on /stats before the :id route, using the UTC date', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-03-10T12:00:00Z'));
  const repository = {
    list: vi.fn().mockResolvedValue([{ due_date: '2026-03-09', completed: false }, { due_date: '2026-03-10', completed: true }]),
    create: vi.fn(), get: vi.fn(), update: vi.fn(), delete: vi.fn(),
  };
  const app = express();
  app.use(express.json());
  app.use('/api/todos', createTodosRouter(repository));
  const response = await request(app).get('/api/todos/stats');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ total: 2, completed: 1, open: 1, overdue: 1, dueSoon: 0 });
  expect(repository.get).not.toHaveBeenCalled();
});
