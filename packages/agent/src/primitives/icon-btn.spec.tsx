import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Plus } from 'lucide-react'
import { IconBtn } from './icon-btn'

describe('IconBtn', () => {
  it('renders icon and fires onClick', () => {
    const onClick = vi.fn()
    render(
      <IconBtn aria-label="add" onClick={onClick}>
        <Plus />
      </IconBtn>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'add' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('renders 24×24 by default', () => {
    render(
      <IconBtn aria-label="x">
        <Plus />
      </IconBtn>,
    )
    const btn = screen.getByRole('button', { name: 'x' })
    expect(btn.className).toMatch(/h-6/)
    expect(btn.className).toMatch(/w-6/)
  })

  it('forwards title attribute for tooltip', () => {
    render(
      <IconBtn aria-label="x" title="Add task">
        <Plus />
      </IconBtn>,
    )
    expect(screen.getByRole('button', { name: 'x' }).getAttribute('title')).toBe('Add task')
  })
})
