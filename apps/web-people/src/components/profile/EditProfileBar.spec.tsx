import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { EditProfileBar } from './EditProfileBar'

vi.mock('@future/ui', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Button: ({ children, disabled, onClick, ...props }: any) => (
    <button disabled={disabled} onClick={onClick} {...props}>
      {children}
    </button>
  ),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Textarea: ({ value, onChange, placeholder, ...props }: any) => (
    <textarea value={value} onChange={onChange} placeholder={placeholder} {...props} />
  ),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Spinner: ({ className }: any) => <div data-testid="spinner" className={className} />,
}))

afterEach(cleanup)

describe('EditProfileBar', () => {
  it('disables Submit when no dirty fields', () => {
    render(
      <EditProfileBar
        dirtyCount={0}
        reason=""
        onReasonChange={vi.fn()}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        isSubmitting={false}
      />,
    )
    expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled()
  })

  it('enables Submit when there are dirty fields', () => {
    render(
      <EditProfileBar
        dirtyCount={2}
        reason=""
        onReasonChange={vi.fn()}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        isSubmitting={false}
      />,
    )
    expect(screen.getByRole('button', { name: /submit/i })).not.toBeDisabled()
  })

  it('shows the field count', () => {
    render(
      <EditProfileBar
        dirtyCount={3}
        reason=""
        onReasonChange={vi.fn()}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        isSubmitting={false}
      />,
    )
    expect(screen.getByText(/3 field/i)).toBeTruthy()
  })

  it('disables Submit while isSubmitting', () => {
    render(
      <EditProfileBar
        dirtyCount={1}
        reason="reason"
        onReasonChange={vi.fn()}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        isSubmitting={true}
      />,
    )
    expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled()
  })

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn()
    render(
      <EditProfileBar
        dirtyCount={1}
        reason=""
        onReasonChange={vi.fn()}
        onCancel={onCancel}
        onSubmit={vi.fn()}
        isSubmitting={false}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('calls onSubmit when Submit is clicked with dirty fields', () => {
    const onSubmit = vi.fn()
    render(
      <EditProfileBar
        dirtyCount={1}
        reason="just testing"
        onReasonChange={vi.fn()}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
        isSubmitting={false}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /submit/i }))
    expect(onSubmit).toHaveBeenCalledOnce()
  })
})
