import { afterEach, describe, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { isOverdue, selectTodos, validateTodo } from './todos'

const todo = (overrides: Partial<typeof todoFixture>) => ({
  ...todoFixture,
  ...overrides,
})

describe('validateTodo', () => {
  const valid = { title: 'Task', description: '', priority: 'low' as const }

  it('accepts valid input', () => {
    expect(validateTodo({ ...valid, due_date: '2026-02-28' })).toEqual({})
  })

  it('rejects blank and too long titles', () => {
    expect(validateTodo({ ...valid, title: '   ' }).title).toBe(
      'Enter a task title.',
    )
    expect(validateTodo({ ...valid, title: 'a'.repeat(121) }).title).toMatch(
      /120/,
    )
  })

  it('rejects impossible dates', () => {
    expect(validateTodo({ ...valid, due_date: '2026-02-30' }).due_date).toBe(
      'Enter a valid date.',
    )
  })
})

describe('selectTodos', () => {
  const a = todo({ id: 1, title: 'Alpha', priority: 'low', completed: true })
  const b = todo({
    id: 2,
    title: 'Beta',
    priority: 'high',
    due_date: '2026-01-01',
    created_at: '2026-10-02T12:00:00Z',
  })

  it('filters by status and search', () => {
    expect(selectTodos([a, b], 'completed', '', 'newest')).toEqual([a])
    expect(selectTodos([a, b], 'active', '', 'newest')).toEqual([b])
    expect(selectTodos([a, b], 'all', ' BETA ', 'newest')).toEqual([b])
  })

  it('sorts by priority, due date and newest', () => {
    expect(selectTodos([a, b], 'all', '', 'priority')).toEqual([b, a])
    expect(selectTodos([a, b], 'all', '', 'due')).toEqual([b, a])
    expect(selectTodos([a, b], 'all', '', 'newest')).toEqual([b, a])
  })
})

describe('isOverdue', () => {
  afterEach(() => vi.useRealTimers())

  it('is true only for open todos due before today', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 15, 12))
    expect(isOverdue(todo({ due_date: '2026-06-14' }))).toBe(true)
    expect(isOverdue(todo({ due_date: '2026-06-15' }))).toBe(false)
    expect(isOverdue(todo({ due_date: '2026-06-14', completed: true }))).toBe(
      false,
    )
    expect(isOverdue(todo({ due_date: null }))).toBe(false)
  })
})
