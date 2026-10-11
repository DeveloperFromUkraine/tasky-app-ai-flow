import { it, expect, describe } from 'vitest';
import { overdueSummary } from '../src/features/todos/overdue.ts';

const today = '2024-03-10';

describe('overdueSummary', () => {
  it('returns zero counts for an empty list', () => {
    expect(overdueSummary([], today)).toEqual({ overdue: 0, dueSoon: 0 });
  });
  it('counts open overdue and due-soon todos separately', () => {
    const todos = [
      { due_date: '2024-03-01', completed: false },
      { due_date: '2024-03-09', completed: false },
      { due_date: '2024-03-10', completed: false },
      { due_date: '2024-03-13', completed: false },
      { due_date: '2024-03-14', completed: false },
      { due_date: null, completed: false },
    ];
    expect(overdueSummary(todos, today)).toEqual({ overdue: 2, dueSoon: 2 });
  });
  it('ignores completed todos', () => {
    const todos = [
      { due_date: '2024-03-01', completed: true },
      { due_date: '2024-03-11', completed: true },
    ];
    expect(overdueSummary(todos, today)).toEqual({ overdue: 0, dueSoon: 0 });
  });
});
