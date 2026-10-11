import { it, expect, describe } from 'vitest';
import { isDueSoon } from '../src/features/todos/overdue.ts';

const today = '2024-03-10';

describe('isDueSoon', () => {
  it.each([
    ['due today', '2024-03-10', false, 3, true],
    ['due within window', '2024-03-12', false, 3, true],
    ['due on last day of window', '2024-03-13', false, 3, true],
    ['due after window', '2024-03-14', false, 3, false],
    ['overdue is not due soon', '2024-03-09', false, 3, false],
    ['completed', '2024-03-11', true, 3, false],
    ['no due date', null, false, 3, false],
    ['custom window includes', '2024-03-17', false, 7, true],
    ['zero-day window excludes tomorrow', '2024-03-11', false, 0, false],
  ])('%s', (_name, due_date, completed, days, expected) => {
    expect(isDueSoon({ due_date, completed }, today, days)).toBe(expected);
  });
  it('defaults to a three day window', () => {
    expect(isDueSoon({ due_date: '2024-03-13', completed: false }, today)).toBe(true);
    expect(isDueSoon({ due_date: '2024-03-14', completed: false }, today)).toBe(false);
  });
});
