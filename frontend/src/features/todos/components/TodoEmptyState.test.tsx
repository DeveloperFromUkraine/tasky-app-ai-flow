import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { TodoEmptyState } from './TodoEmptyState'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))

it('offers to create the first task when there are no todos', async () => {
  const onCreate = vi.fn()
  render(
    <TodoEmptyState hasTodos={false} disabled={false} onCreate={onCreate} />,
  )
  await userEvent
    .setup()
    .click(screen.getByRole('button', { name: 'Add your first task' }))
  expect(onCreate).toHaveBeenCalledOnce()
})

it('disables the create button when disabled', () => {
  render(<TodoEmptyState hasTodos={false} disabled onCreate={vi.fn()} />)
  expect(
    screen.getByRole('button', { name: 'Add your first task' }),
  ).toBeDisabled()
})

it('shows a no-match message without a button when todos exist', () => {
  render(<TodoEmptyState hasTodos disabled={false} onCreate={vi.fn()} />)
  expect(screen.getByText('No matching tasks')).toBeInTheDocument()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
