import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { useTodoStatsQuery } from '../hooks/useTodoStatsQuery'
import type { TodoStats as Stats } from '../types'
import { TodoStats } from './TodoStats'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
vi.mock('../hooks/useTodoStatsQuery', () => ({ useTodoStatsQuery: vi.fn() }))

function show(data: Stats | undefined) {
  vi.mocked(useTodoStatsQuery).mockReturnValue({
    data,
  } as ReturnType<typeof useTodoStatsQuery>)
  return render(<TodoStats />)
}

it('renders nothing without data or without tasks', () => {
  expect(show(undefined).container).toBeEmptyDOMElement()
  const empty = { total: 0, completed: 0, open: 0, overdue: 0, dueSoon: 0 }
  expect(show(empty).container).toBeEmptyDOMElement()
})

it('shows the counts, including due soon when present', () => {
  show({ total: 6, completed: 2, open: 4, overdue: 1, dueSoon: 3 })
  expect(screen.getByLabelText('Task summary')).toBeInTheDocument()
  expect(screen.getByText('4 open')).toBeInTheDocument()
  expect(screen.getByText('1 overdue')).toBeInTheDocument()
  expect(screen.getByText('3 due soon')).toBeInTheDocument()
  expect(screen.getByText('2 done')).toBeInTheDocument()
})

it('hides the due soon badge when none are due soon', () => {
  show({ total: 1, completed: 0, open: 1, overdue: 0, dueSoon: 0 })
  expect(screen.queryByText(/due soon/)).not.toBeInTheDocument()
})
