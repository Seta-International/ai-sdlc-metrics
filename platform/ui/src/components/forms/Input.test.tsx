import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Input } from './Input'

describe('Input', () => {
  it('accepts user typing and fires onChange', async () => {
    const onChange = vi.fn()
    render(<Input aria-label="Name" onChange={onChange} />)
    await userEvent.type(screen.getByLabelText('Name'), 'abc')
    expect(onChange).toHaveBeenCalled()
    expect(screen.getByLabelText('Name')).toHaveValue('abc')
  })

  it('shows error state when invalid', () => {
    render(<Input aria-label="Email" invalid />)
    expect(screen.getByLabelText('Email')).toHaveClass('border-error')
  })

  it('forwards refs', () => {
    const ref = { current: null as HTMLInputElement | null }
    render(<Input ref={ref} aria-label="X" />)
    expect(ref.current?.tagName).toBe('INPUT')
  })
})
