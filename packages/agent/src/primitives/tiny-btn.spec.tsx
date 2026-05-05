import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { TinyBtn } from './tiny-btn'

describe('TinyBtn', () => {
  it('renders children and fires onClick', () => {
    const onClick = vi.fn()
    render(<TinyBtn onClick={onClick}>Send</TinyBtn>)
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('shows active state', () => {
    render(<TinyBtn active>x</TinyBtn>)
    const btn = screen.getByRole('button', { name: 'x' })
    expect(btn.className).toMatch(/bg-white/)
  })

  it('shows danger style', () => {
    render(<TinyBtn danger>delete</TinyBtn>)
    const btn = screen.getByRole('button', { name: 'delete' })
    expect(btn.className).toMatch(/text-red/)
  })

  it('disabled prevents click', () => {
    const onClick = vi.fn()
    render(
      <TinyBtn onClick={onClick} disabled>
        nope
      </TinyBtn>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'nope' }))
    expect(onClick).not.toHaveBeenCalled()
  })
})
