import { it, expect, describe } from 'vitest';
import { dueSortKey } from '../src/features/todos/overdue.ts';

const today = '2024-03-10';

describe('dueSortKey', () => {
  it.each([
    ['overdue open', '2024-03-09', false, [0, '2024-03-09']],
    ['due today', '2024-03-10', false, [1, '2024-03-10']],
    ['future', '2024-03-20', false, [1, '2024-03-20']],
    ['past due but completed', '2024-03-01', true, [1, '2024-03-01']],
    ['no due date', null, false, [2, '']],
    ['no due date, completed', null, true, [2, '']],
  ])('%s', (_name, due_date, completed, expected) => {
    expect(dueSortKey({ due_date, completed }, today)).toEqual(expected);
  });

  it('orders overdue, then by due date, then undated last', () => {
    const todos = [
      { id: 'none', due_date: null, completed: false },
      { id: 'later', due_date: '2024-03-15', completed: false },
      { id: 'overdue', due_date: '2024-03-01', completed: false },
      { id: 'soon', due_date: '2024-03-11', completed: false },
    ];
    const sorted = [...todos].sort((a, b) => {
      const [ka, da] = dueSortKey(a, today);
      const [kb, db] = dueSortKey(b, today);
      return ka - kb || da.localeCompare(db);
    });
    expect(sorted.map((t) => t.id)).toEqual(['overdue', 'soon', 'later', 'none']);
  });
});
