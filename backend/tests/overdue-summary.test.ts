import { it, expect, describe } from 'vitest';
import { isDueSoon, dueSortKey, overdueSummary, DUE_SOON_DAYS } from '../src/features/todos/overdue.ts';

const today = '2024-03-10';

describe('isDueSoon', () => {
  it.each([
    ['today', '2024-03-10', false, true],
    ['at the default limit', '2024-03-13', false, true],
    ['past the limit', '2024-03-14', false, false],
    ['overdue', '2024-03-09', false, false],
    ['completed', '2024-03-11', true, false],
    ['no due date', null, false, false],
  ])('%s', (_name, due_date, completed, expected) => {
    expect(isDueSoon({ due_date, completed }, today)).toBe(expected);
  });
  it('honours a custom window', () => {
    expect(isDueSoon({ due_date: '2024-03-14', completed: false }, today, 4)).toBe(true);
    expect(DUE_SOON_DAYS).toBe(3);
  });
});

describe('dueSortKey', () => {
  it('ranks overdue, upcoming and undated todos', () => {
    expect(dueSortKey({ due_date: '2024-03-01', completed: false }, today)).toEqual([0, '2024-03-01']);
    expect(dueSortKey({ due_date: '2024-03-20', completed: false }, today)).toEqual([1, '2024-03-20']);
    expect(dueSortKey({ due_date: '2024-03-01', completed: true }, today)).toEqual([1, '2024-03-01']);
    expect(dueSortKey({ due_date: null, completed: false }, today)).toEqual([2, '']);
  });
});

describe('overdueSummary', () => {
  it('counts overdue and due-soon open todos', () => {
    const todos = [
      { due_date: '2024-03-01', completed: false },
      { due_date: '2024-03-02', completed: true },
      { due_date: '2024-03-11', completed: false },
      { due_date: '2024-03-12', completed: false },
      { due_date: null, completed: false },
    ];
    expect(overdueSummary(todos, today)).toEqual({ overdue: 1, dueSoon: 2 });
    expect(overdueSummary([], today)).toEqual({ overdue: 0, dueSoon: 0 });
  });
});
