import express from 'express';
import request from 'supertest';
import { it, expect, vi } from 'vitest';
import { createHealthRouter } from '../src/api/health.ts';
import type { Database } from '../src/features/todos/types.ts';

it('reports ok after querying the database', async () => {
  const findFirst = vi.fn().mockResolvedValue(null);
  const app = express();
  app.use(createHealthRouter({ todo: { findFirst } } as unknown as Database));
  const response = await request(app).get('/health');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ status: 'ok' });
  expect(findFirst).toHaveBeenCalledOnce();
});
