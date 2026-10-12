import { test } from 'node:test'
import assert from 'node:assert/strict'
import { baselineFailures, BASELINE_CMD } from './baseline.mjs'

test('baselineFailures lists failing test files of the pull request head, relative, with the first error line', () => {
  const json = { testResults: [
    { name: '/r/frontend/src/features/todos/TodosPage.test.tsx', status: 'failed', message: '', assertionResults: [
      { status: 'passed', failureMessages: [] },
      { status: 'failed', failureMessages: ['Error: No QueryClient set, use QueryClientProvider to set one\n    at useQueryClient (node_modules/x.js:1:1)'] }] },
    { name: '/r/frontend/src/App.test.tsx', status: 'passed', assertionResults: [] },
    { name: '/r/frontend/src/broken.test.ts', status: 'failed', message: 'Failed to load url ./missing', assertionResults: [] },
  ] }
  assert.deepEqual(baselineFailures(json, '/r'), [
    { file: 'frontend/src/features/todos/TodosPage.test.tsx', error: 'Error: No QueryClient set, use QueryClientProvider to set one' },
    { file: 'frontend/src/broken.test.ts', error: 'Failed to load url ./missing' },
  ])
  assert.deepEqual(baselineFailures(null, '/r'), [])
  assert.ok(baselineFailures({ testResults: [{ name: '/r/a.test.ts', status: 'failed', message: 'x'.repeat(900), assertionResults: [] }] }, '/r')[0].error.length <= 300)
})

test('the baseline run writes its report into the writable coverage directory', () => {
  assert.ok(BASELINE_CMD.includes('--reporter=json'))
  assert.ok(BASELINE_CMD.some((a) => a.startsWith('--outputFile=coverage/')))
})
