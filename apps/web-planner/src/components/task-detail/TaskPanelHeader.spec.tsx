import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TaskPanelHeader } from './TaskPanelHeader'

afterEach(() => cleanup())

describe('TaskPanelHeader', () => {
  it('renders the history button', () => {
    render(<TaskPanelHeader title="My task" isSaving={false} onClose={vi.fn()} />)
    expect(screen.getByTestId('task-history-btn')).toBeDefined()
  })

  it('history button is disabled when onHistoryOpen is not provided', () => {
    render(<TaskPanelHeader title="My task" isSaving={false} onClose={vi.fn()} />)
    const btn = screen.getByTestId<HTMLButtonElement>('task-history-btn')
    expect(btn.disabled).toBe(true)
  })

  it('history button is enabled when onHistoryOpen is provided', () => {
    render(
      <TaskPanelHeader
        title="My task"
        isSaving={false}
        onClose={vi.fn()}
        onHistoryOpen={vi.fn()}
      />,
    )
    const btn = screen.getByTestId<HTMLButtonElement>('task-history-btn')
    expect(btn.disabled).toBe(false)
  })

  it('calls onHistoryOpen when history button is clicked', async () => {
    const onHistoryOpen = vi.fn()
    render(
      <TaskPanelHeader
        title="My task"
        isSaving={false}
        onClose={vi.fn()}
        onHistoryOpen={onHistoryOpen}
      />,
    )
    await userEvent.click(screen.getByTestId('task-history-btn'))
    expect(onHistoryOpen).toHaveBeenCalledOnce()
  })

  it('renders the close button with correct testid', () => {
    render(<TaskPanelHeader title="My task" isSaving={false} onClose={vi.fn()} />)
    expect(screen.getByTestId('task-close-btn')).toBeDefined()
  })

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn()
    render(<TaskPanelHeader title="My task" isSaving={false} onClose={onClose} />)
    await userEvent.click(screen.getByTestId('task-close-btn'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('shows saving indicator when isSaving is true', () => {
    render(<TaskPanelHeader title="My task" isSaving={true} onClose={vi.fn()} />)
    expect(screen.getByTestId('task-detail-saving')).toBeDefined()
  })

  it('does not show saving indicator when isSaving is false', () => {
    render(<TaskPanelHeader title="My task" isSaving={false} onClose={vi.fn()} />)
    expect(screen.queryByTestId('task-detail-saving')).toBeNull()
  })
})
