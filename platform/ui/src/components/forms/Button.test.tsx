import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './Button'

describe('Button', () => {
  it('renders label and fires onClick', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Save</Button>)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('applies variant classes', () => {
    const { rerender } = render(<Button>Primary</Button>)
    expect(screen.getByRole('button')).toHaveClass('bg-primary')
    rerender(<Button variant="secondary">Secondary</Button>)
    expect(screen.getByRole('button')).toHaveClass('bg-canvas')
    rerender(<Button variant="ghost">Ghost</Button>)
    expect(screen.getByRole('button')).toHaveClass('bg-transparent')
  })

  it('is disabled-blocked', async () => {
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        X
      </Button>,
    )
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('renders leading icon slot', () => {
    render(<Button icon={<svg data-testid="ico" />}>X</Button>)
    expect(screen.getByTestId('ico')).toBeInTheDocument()
  })

  it('never has pill rounding', () => {
    render(<Button>X</Button>)
    expect(screen.getByRole('button').className).not.toMatch(/rounded-pill|rounded-full/)
  })
})
