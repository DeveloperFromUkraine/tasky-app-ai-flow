import type { Todo } from './types.js';

/**
 * A todo is overdue when it is not completed and its due date (YYYY-MM-DD) is before `today`.
 * Todos without a due date are never overdue. `today` is a YYYY-MM-DD date in the same calendar.
 */
export function isOverdue(todo: Pick<Todo, 'due_date' | 'completed'>, today: string): boolean {
  if (todo.completed || todo.due_date === null) return false;
  return todo.due_date < today;
}

/** Days until the due date (negative when overdue), or null when the todo has no due date. */
export function daysUntilDue(todo: Pick<Todo, 'due_date'>, today: string): number | null {
  if (todo.due_date === null) return null;
  const ms = Date.parse(`${todo.due_date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** Open todos due within the next `days` days, today included; overdue ones are not "due soon". */
/** How many days ahead counts as "due soon" by default. */
export const DUE_SOON_DAYS = 3;

export function isDueSoon(todo: Pick<Todo, 'due_date' | 'completed'>, today: string, days = DUE_SOON_DAYS): boolean {
  if (todo.completed) return false;
  const left = daysUntilDue(todo, today);
  return left !== null && left >= 0 && left <= days;
}

/** Sort key for a list: overdue first, then by due date; todos without a due date go last. */
export function dueSortKey(todo: Pick<Todo, 'due_date' | 'completed'>, today: string): [number, string] {
  if (todo.due_date === null) return [2, ''];
  return [isOverdue(todo, today) ? 0 : 1, todo.due_date];
}

/** Counts of open todos per bucket, for a summary badge. */
export function overdueSummary(todos: Pick<Todo, 'due_date' | 'completed'>[], today: string): { overdue: number; dueSoon: number } {
  return {
    overdue: todos.filter((t) => isOverdue(t, today)).length,
    dueSoon: todos.filter((t) => isDueSoon(t, today)).length,
  };
}
