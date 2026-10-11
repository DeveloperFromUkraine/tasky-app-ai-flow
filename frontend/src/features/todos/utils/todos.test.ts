import { describe, expect, it } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import type { Todo, TodoInput } from '../types'
import { isOverdue, selectTodos, validateTodo } from './todos'

const input: TodoInput = {
  title: 'Task',
  description: '',
  priority: 'low',
  due_date: null,
  completed: false,
}

const make = (over: Partial<Todo>): Todo => ({ ...todoFixture, ...over })

describe('validateTodo', () => {
  it('accepts valid input', () => {
    expect(validateTodo(input)).toEqual({})
  })

  it('rejects blank and overlong titles', () => {
    expect(validateTodo({ ...input, title: '  ' }).title).toBe(
      'Enter a task title.',
    )
    expect(validateTodo({ ...input, title: 'a'.repeat(121) }).title).toMatch(
      /120/,
    )
  })

  it('rejects overlong descriptions', () => {
    expect(
      validateTodo({ ...input, description: 'a'.repeat(2001) }).description,
    ).toMatch(/2000/)
  })

  it('validates due dates', () => {
    expect(validateTodo({ ...input, due_date: '2026-02-30' }).due_date).toBe(
      'Enter a valid date.',
    )
    expect(validateTodo({ ...input, due_date: '2026-02-28' })).toEqual({})
  })
})

describe('selectTodos', () => {
  const a = make({ id: 1, title: 'Alpha', priority: 'low' })
  const b = make({
    id: 2,
    title: 'Beta',
    priority: 'high',
    completed: true,
    due_date: '2026-01-01',
    created_at: '2026-10-02T12:00:00Z',
  })
  const c = make({ id: 3, title: 'Gamma', description: 'about ALPHA' })

  it('filters by status', () => {
    expect(selectTodos([a, b, c], 'completed', '', 'newest')).toEqual([b])
    expect(
      selectTodos([a, b, c], 'active', '', 'newest').map((t) => t.id),
    ).toEqual([3, 1])
  })

  it('searches title and description case-insensitively', () => {
    expect(
      selectTodos([a, b, c], 'all', ' alpha ', 'newest').map((t) => t.id),
    ).toEqual([3, 1])
  })

  it('sorts by priority and due date', () => {
    expect(
      selectTodos([a, b, c], 'all', '', 'priority').map((t) => t.id),
    ).toEqual([2, 3, 1])
    expect(selectTodos([a, b, c], 'all', '', 'due').map((t) => t.id)).toEqual([
      2, 3, 1,
    ])
  })
})

describe('isOverdue', () => {
  it('is true only for open todos with a past due date', () => {
    expect(isOverdue(make({ due_date: '2000-01-01' }))).toBe(true)
    expect(isOverdue(make({ due_date: '2000-01-01', completed: true }))).toBe(
      false,
    )
    expect(isOverdue(make({ due_date: '2999-01-01' }))).toBe(false)
    expect(isOverdue(make({ due_date: null }))).toBe(false)
  })
})
