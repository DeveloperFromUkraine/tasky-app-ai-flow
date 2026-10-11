import { it, expect } from 'vitest';
import { createSchema, updateSchema, idSchema, todoSchema } from '../src/features/todos/validators.ts';
import { fromModel } from '../src/features/todos/mappers.ts';
import { record, todo } from './fixture.ts';

it('applies create defaults and trims strings', () => {
  expect(createSchema.parse({ title: '  Task  ', description: '  d  ' })).toEqual({ title: 'Task', description: 'd', priority: 'medium', due_date: null, completed: false });
});
it.each([{ title: 'Task', extra: 1 }, {}, { title: 'Task', description: 'x'.repeat(2001) }, { title: 'Task', completed: 'yes' }])('rejects invalid create input %j', (payload) => {
  expect(createSchema.safeParse(payload).success).toBe(false);
});
it('accepts partial updates and rejects empty or unknown ones', () => {
  expect(updateSchema.parse({ completed: true })).toEqual({ completed: true });
  expect(updateSchema.parse({ due_date: null })).toEqual({ due_date: null });
  expect(updateSchema.safeParse({}).success).toBe(false);
  expect(updateSchema.safeParse({ id: 2 }).success).toBe(false);
});
it.each([['5', 5], [7, 7]])('coerces valid id %j', (input, expected) => {
  expect(idSchema.parse(input)).toBe(expected);
});
it.each(['0', '-1', '1.5', 'abc', '9007199254740993'])('rejects invalid id %s', (input) => {
  expect(idSchema.safeParse(input).success).toBe(false);
});
it('requires valid ids and timestamps in todoSchema', () => {
  expect(todoSchema.safeParse(todo).success).toBe(true);
  expect(todoSchema.safeParse({ ...todo, id: 0 }).success).toBe(false);
  expect(todoSchema.safeParse({ ...todo, created_at: 'nope' }).success).toBe(false);
});
it('maps records with and without a due date', () => {
  expect(fromModel(record)).toEqual(todo);
  expect(fromModel({ ...record, due_date: null }).due_date).toBeNull();
});
