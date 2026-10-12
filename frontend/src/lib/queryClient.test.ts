import { expect, it } from 'vitest'
import { queryClient } from './queryClient'

it('uses a 30s stale time, one query retry and no mutation retries', () => {
  const options = queryClient.getDefaultOptions()
  expect(options.queries?.staleTime).toBe(30_000)
  expect(options.queries?.retry).toBe(1)
  expect(options.mutations?.retry).toBe(false)
})
