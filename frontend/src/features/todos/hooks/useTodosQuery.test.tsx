import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { expect, it, vi } from 'vitest'
import { request } from '../../../lib/http'
import { todoFixture } from '../../../test/todoFixture'
import { useTodosBusy } from './useTodosBusy'
import { useTodosQuery } from './useTodosQuery'
import { todoKeys } from '../api/queryKeys'

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

it('loads the todo list with the abort signal', async () => {
  vi.mocked(request).mockResolvedValue([todoFixture])
  const { wrapper } = setup()
  const { result } = renderHook(() => useTodosQuery(), { wrapper })
  await waitFor(() => expect(result.current.data).toEqual([todoFixture]))
  expect(request).toHaveBeenCalledWith('/todos', {
    signal: expect.any(AbortSignal),
  })
})

it('reports busy only while a todo mutation is running', async () => {
  const { client, wrapper } = setup()
  const { result } = renderHook(() => useTodosBusy(), { wrapper })
  expect(result.current).toBe(false)
  let resolve: () => void = () => {}
  const pending = new Promise<void>((r) => {
    resolve = r
  })
  const mutation = client
    .getMutationCache()
    .build(client, { mutationKey: todoKeys.create, mutationFn: () => pending })
  const run = mutation.execute(undefined)
  await waitFor(() => expect(result.current).toBe(true))
  resolve()
  await run
  await waitFor(() => expect(result.current).toBe(false))
})
