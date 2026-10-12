import { it, expect } from 'vitest';
import { createSchema, updateSchema, idSchema, todoSchema } from '../src/features/todos/validators.ts';
import { fromModel } from '../src/features/todos/mappers.ts';
import { record, todo } from './fixture.ts';

it('applies create defaults and trims', () => {
  expect(createSchema.parse({ title: '  A  ' })).toEqual({ title: 'A', description: '', priority: 'medium', due_date: null, completed: false });
});
it('rejects unknown create fields', () => {
  expect(createSchema.safeParse({ title: 'A', extra: 1 }).success).toBe(false);
});
it('accepts partial updates and rejects empty ones', () => {
  expect(updateSchema.parse({ completed: true })).toEqual({ completed: true });
  expect(updateSchema.safeParse({}).success).toBe(false);
  expect(updateSchema.safeParse({ priority: 'urgent' }).success).toBe(false);
});
it.each([['5', 5], [7, 7]])('parses id %j', (input, expected) => {
  expect(idSchema.parse(input)).toBe(expected);
});
it.each(['0', '-1', '1.5', 'abc', String(Number.MAX_SAFE_INTEGER + 2)])('rejects id %s', (input) => {
  expect(idSchema.safeParse(input).success).toBe(false);
});
it('validates a full todo', () => {
  expect(todoSchema.parse(todo)).toEqual(todo);
  expect(todoSchema.safeParse({ ...todo, id: 0 }).success).toBe(false);
});
it('maps database records, including a missing due date', () => {
  expect(fromModel(record)).toEqual(todo);
  expect(fromModel({ ...record, due_date: null }).due_date).toBeNull();
});
