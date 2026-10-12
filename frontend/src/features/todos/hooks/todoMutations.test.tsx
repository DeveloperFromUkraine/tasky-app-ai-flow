import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { useCreateTodoMutation } from './useCreateTodoMutation'
import { useDeleteTodoMutation } from './useDeleteTodoMutation'
import { useTodosBusy } from './useTodosBusy'
import { useTodosQuery } from './useTodosQuery'
import { useUpdateTodoMutation } from './useUpdateTodoMutation'

vi.mock('../api/todos', () => ({
  todosApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}))

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

const other = { ...todoFixture, id: 8, title: 'Other' }

it('loads the todo list', async () => {
  vi.mocked(todosApi.list).mockResolvedValue([todoFixture])
  const { wrapper } = setup()
  const { result } = renderHook(() => useTodosQuery(), { wrapper })
  await waitFor(() => expect(result.current.data).toEqual([todoFixture]))
})

it('prepends a created todo to the cached list', async () => {
  const created = { ...todoFixture, id: 9 }
  vi.mocked(todosApi.create).mockResolvedValue(created)
  const { client, wrapper } = setup()
  client.setQueryData(todoKeys.list, [todoFixture])
  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })
  await act(() =>
    result.current.mutateAsync({
      title: 't',
      description: '',
      priority: 'low',
      due_date: null,
      completed: false,
    }),
  )
  expect(client.getQueryData(todoKeys.list)).toEqual([created, todoFixture])
})

it('replaces an updated todo in the cached list', async () => {
  const saved = { ...todoFixture, title: 'Renamed' }
  vi.mocked(todosApi.update).mockResolvedValue(saved)
  const { client, wrapper } = setup()
  client.setQueryData(todoKeys.list, [todoFixture, other])
  const { result } = renderHook(() => useUpdateTodoMutation(), { wrapper })
  await act(() =>
    result.current.mutateAsync({ id: 7, input: { title: 'Renamed' } }),
  )
  expect(todosApi.update).toHaveBeenCalledWith(7, { title: 'Renamed' })
  expect(client.getQueryData(todoKeys.list)).toEqual([saved, other])
})

it('removes a deleted todo from the cached list', async () => {
  vi.mocked(todosApi.remove).mockResolvedValue(undefined)
  const { client, wrapper } = setup()
  client.setQueryData(todoKeys.list, [todoFixture, other])
  const { result } = renderHook(() => useDeleteTodoMutation(), { wrapper })
  await act(() => result.current.mutateAsync(7))
  expect(client.getQueryData(todoKeys.list)).toEqual([other])
})

it('reports busy while a mutation is pending', async () => {
  let resolve: (value: undefined) => void = () => {}
  vi.mocked(todosApi.remove).mockReturnValue(
    new Promise<undefined>((r) => {
      resolve = r
    }),
  )
  const { wrapper } = setup()
  const { result } = renderHook(
    () => ({ busy: useTodosBusy(), del: useDeleteTodoMutation() }),
    { wrapper },
  )
  expect(result.current.busy).toBe(false)
  act(() => {
    result.current.del.mutate(7)
  })
  await waitFor(() => expect(result.current.busy).toBe(true))
  await act(async () => resolve(undefined))
  await waitFor(() => expect(result.current.busy).toBe(false))
})
