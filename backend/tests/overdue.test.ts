import { it, expect, describe } from 'vitest';
import { isOverdue, daysUntilDue } from '../src/features/todos/overdue.ts';

const today = '2024-03-10';

describe('isOverdue', () => {
  it.each([
    ['past due, open', '2024-03-09', false, true],
    ['due today', '2024-03-10', false, false],
    ['due in future', '2024-03-11', false, false],
    ['past due, completed', '2024-03-01', true, false],
    ['no due date', null, false, false],
    ['no due date, completed', null, true, false],
  ])('%s', (_name, due_date, completed, expected) => {
    expect(isOverdue({ due_date, completed }, today)).toBe(expected);
  });
});

describe('daysUntilDue', () => {
  it.each([
    ['2024-03-10', 0],
    ['2024-03-13', 3],
    ['2024-03-07', -3],
    ['2024-03-01', -9],
  ])('%s -> %i', (due_date, expected) => {
    expect(daysUntilDue({ due_date }, today)).toBe(expected);
  });
  it('returns null without a due date', () => {
    expect(daysUntilDue({ due_date: null }, today)).toBeNull();
  });
  it('counts across a leap day', () => {
    expect(daysUntilDue({ due_date: '2024-03-01' }, '2024-02-28')).toBe(2);
  });
});
