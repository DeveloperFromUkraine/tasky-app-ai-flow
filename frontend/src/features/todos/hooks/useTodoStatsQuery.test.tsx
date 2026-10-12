import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { expect, it, vi } from 'vitest'
import { request } from '../../../lib/http'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { useCreateTodoMutation } from './useCreateTodoMutation'
import { useDeleteTodoMutation } from './useDeleteTodoMutation'
import { useTodoStatsQuery } from './useTodoStatsQuery'
import { useUpdateTodoMutation } from './useUpdateTodoMutation'

vi.mock('../../../lib/http', () => ({ request: vi.fn() }))

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

it('requests the stats endpoint with the abort signal', async () => {
  const stats = { total: 1, completed: 0, open: 1, overdue: 0, dueSoon: 0 }
  vi.mocked(request).mockResolvedValue(stats)
  const { wrapper } = setup()
  const { result } = renderHook(() => useTodoStatsQuery(), { wrapper })
  await waitFor(() => expect(result.current.data).toEqual(stats))
  expect(request).toHaveBeenCalledWith('/todos/stats', {
    signal: expect.any(AbortSignal),
  })
})

it('exposes the stats API call', async () => {
  vi.mocked(request).mockResolvedValue({})
  await todosApi.stats()
  expect(request).toHaveBeenCalledWith('/todos/stats', { signal: undefined })
})

it.each([
  ['create', useCreateTodoMutation, undefined],
  ['update', useUpdateTodoMutation, { id: 1, input: {} }],
  ['delete', useDeleteTodoMutation, 1],
] as const)('invalidates stats after %s', async (_name, useHook, vars) => {
  vi.mocked(request).mockResolvedValue(todoFixture)
  const { client, wrapper } = setup()
  const spy = vi.spyOn(client, 'invalidateQueries')
  const { result } = renderHook(() => useHook(), { wrapper })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result.current.mutate((vars ?? todoFixture) as any)
  await waitFor(() =>
    expect(spy).toHaveBeenCalledWith({ queryKey: todoKeys.stats }),
  )
})
