import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import type { Todo } from '../types'
import { useTodoFilters } from './useTodoFilters'

const todos: Todo[] = [
  { ...todoFixture, id: 1, title: 'Alpha', completed: true },
  { ...todoFixture, id: 2, title: 'Beta', completed: false },
]

it('starts with all todos, newest first', () => {
  const { result } = renderHook(() => useTodoFilters(todos))
  expect(result.current.filter).toBe('all')
  expect(result.current.visible.map((t) => t.id)).toEqual([2, 1])
})

it('filters by status and search text', () => {
  const { result } = renderHook(() => useTodoFilters(todos))
  act(() => result.current.setFilter('completed'))
  expect(result.current.visible.map((t) => t.id)).toEqual([1])
  act(() => result.current.setFilter('all'))
  act(() => result.current.setSearch('beta'))
  expect(result.current.visible.map((t) => t.id)).toEqual([2])
})
