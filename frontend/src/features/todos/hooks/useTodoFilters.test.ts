import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import type { Todo } from '../types'
import { useTodoFilters } from './useTodoFilters'

const todos: Todo[] = [
  {
    id: 1,
    title: 'Buy milk',
    description: '',
    priority: 'low',
    due_date: null,
    completed: false,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 2,
    title: 'Walk',
    description: '',
    priority: 'high',
    due_date: null,
    completed: true,
    created_at: '2024-01-02T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
  },
]

it('starts with all todos, newest first', () => {
  const { result } = renderHook(() => useTodoFilters(todos))
  expect(result.current.visible.map((t) => t.id)).toEqual([2, 1])
})

it('applies filter, search and sort changes', () => {
  const { result } = renderHook(() => useTodoFilters(todos))
  act(() => result.current.setFilter('completed'))
  expect(result.current.visible.map((t) => t.id)).toEqual([2])
  act(() => result.current.setFilter('all'))
  act(() => result.current.setSearch('milk'))
  expect(result.current.visible.map((t) => t.id)).toEqual([1])
  act(() => result.current.setSearch(''))
  act(() => result.current.setSort('priority'))
  expect(result.current.visible.map((t) => t.id)).toEqual([2, 1])
})
