import { expect, it } from 'vitest'
import type { Todo, TodoInput } from '../types'
import { formatDate, isOverdue, selectTodos, validateTodo } from './todos'

const input: TodoInput = {
  title: 'Task',
  description: '',
  priority: 'low',
  due_date: null,
  completed: false,
}

function make(id: number, overrides: Partial<Todo> = {}): Todo {
  return {
    ...input,
    id,
    created_at: `2024-01-0${id}T00:00:00Z`,
    updated_at: `2024-01-0${id}T00:00:00Z`,
    ...overrides,
  }
}

it('validates a correct todo', () => {
  expect(validateTodo(input)).toEqual({})
})

it('rejects blank and too long titles', () => {
  expect(validateTodo({ ...input, title: '   ' }).title).toBe(
    'Enter a task title.',
  )
  expect(validateTodo({ ...input, title: 'a'.repeat(121) }).title).toMatch(
    /120/,
  )
})

it('rejects too long descriptions', () => {
  expect(
    validateTodo({ ...input, description: 'a'.repeat(2001) }).description,
  ).toMatch(/2000/)
})

it('rejects invalid dates and accepts valid ones', () => {
  expect(validateTodo({ ...input, due_date: '2024-02-30' }).due_date).toBe(
    'Enter a valid date.',
  )
  expect(validateTodo({ ...input, due_date: 'abc' }).due_date).toBeDefined()
  expect(validateTodo({ ...input, due_date: '2024-02-29' })).toEqual({})
})

it('filters by status and search text', () => {
  const todos = [
    make(1, { title: 'Buy milk' }),
    make(2, { title: 'Walk', description: 'MILK run', completed: true }),
    make(3, { title: 'Other' }),
  ]
  expect(
    selectTodos(todos, 'all', ' milk ', 'newest').map((t) => t.id),
  ).toEqual([2, 1])
  expect(
    selectTodos(todos, 'completed', '', 'newest').map((t) => t.id),
  ).toEqual([2])
  expect(selectTodos(todos, 'active', '', 'newest').map((t) => t.id)).toEqual([
    3, 1,
  ])
})

it('sorts by priority and due date', () => {
  const todos = [
    make(1, { priority: 'low', due_date: '2024-05-01' }),
    make(2, { priority: 'high', due_date: null }),
    make(3, { priority: 'medium', due_date: '2024-04-01' }),
  ]
  expect(selectTodos(todos, 'all', '', 'priority').map((t) => t.id)).toEqual([
    2, 3, 1,
  ])
  expect(selectTodos(todos, 'all', '', 'due').map((t) => t.id)).toEqual([
    3, 1, 2,
  ])
})

it('detects overdue todos', () => {
  expect(isOverdue(make(1, { due_date: '2000-01-01' }))).toBe(true)
  expect(isOverdue(make(1, { due_date: '2000-01-01', completed: true }))).toBe(
    false,
  )
  expect(isOverdue(make(1, { due_date: '9999-01-01' }))).toBe(false)
  expect(isOverdue(make(1))).toBe(false)
})

it('formats dates', () => {
  expect(formatDate('2024-03-05')).toBe('5 Mar 2024')
})
