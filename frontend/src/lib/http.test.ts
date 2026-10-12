import { afterEach, expect, it, vi } from 'vitest'
import { request } from './http'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stub(response: Partial<Response> | Error) {
  const fetchMock = vi.fn(() =>
    response instanceof Error
      ? Promise.reject(response)
      : Promise.resolve(response),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

it('returns parsed json and prefixes the path', async () => {
  const fetchMock = stub({ ok: true, status: 200, json: async () => [1] })
  await expect(request('/todos')).resolves.toEqual([1])
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/todos',
    expect.objectContaining({
      headers: { 'Content-Type': 'application/json' },
    }),
  )
})

it('returns undefined for 204', async () => {
  stub({ ok: true, status: 204 })
  await expect(request('/todos/1')).resolves.toBeUndefined()
})

it('reports connection failures', async () => {
  stub(new Error('boom'))
  await expect(request('/todos')).rejects.toThrow('Cannot connect')
})

it('rethrows abort errors', async () => {
  const error = new Error('aborted')
  stub(error)
  const controller = new AbortController()
  controller.abort()
  await expect(request('/todos', { signal: controller.signal })).rejects.toBe(
    error,
  )
})

it('maps 422 to a validation message', async () => {
  stub({ ok: false, status: 422, json: async () => ({}) })
  await expect(request('/todos')).rejects.toThrow('Check the task details')
})

it('uses the server detail or a generic message', async () => {
  stub({ ok: false, status: 404, json: async () => ({ detail: 'Not found' }) })
  await expect(request('/todos')).rejects.toThrow('Not found')
  stub({
    ok: false,
    status: 500,
    json: async () => Promise.reject(new Error('x')),
  })
  await expect(request('/todos')).rejects.toThrow('The operation failed')
})
