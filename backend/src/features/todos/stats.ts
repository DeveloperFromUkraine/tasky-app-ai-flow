import { overdueSummary } from './overdue.js';
import type { Todo } from './types.js';

export interface TodoStats {
  total: number;
  completed: number;
  open: number;
  overdue: number;
  dueSoon: number;
}

/** Counts for the summary bar above the list. `today` is a YYYY-MM-DD date (UTC). */
export function todoStats(todos: Pick<Todo, 'due_date' | 'completed'>[], today: string): TodoStats {
  const completed = todos.filter((todo) => todo.completed).length;
  return { total: todos.length, completed, open: todos.length - completed, ...overdueSummary(todos, today) };
}
