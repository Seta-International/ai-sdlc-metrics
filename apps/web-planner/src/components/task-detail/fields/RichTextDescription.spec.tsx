import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RichTextDescription } from './RichTextDescription'

afterEach(() => cleanup())

describe('RichTextDescription', () => {
  it('renders the editor container', () => {
    render(<RichTextDescription value="" onChange={vi.fn()} />)
    expect(screen.getByTestId('rich-text-description')).toBeDefined()
  })

  it('renders initial HTML content', () => {
    render(<RichTextDescription value="<p>Hello <strong>world</strong></p>" onChange={vi.fn()} />)
    const el = screen.getByTestId('rich-text-description')
    expect(el.textContent).toContain('Hello')
    expect(el.textContent).toContain('world')
  })

  it('does not call onChange when clicking outside without editing', async () => {
    const onChange = vi.fn()
    render(<RichTextDescription value="<p>Initial</p>" onChange={onChange} />)
    const editor = screen.getByRole('textbox')
    editor.focus()
    await userEvent.click(document.body)
    await new Promise((r) => setTimeout(r, 0))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not call onChange for empty value on external click without editing', async () => {
    const onChange = vi.fn()
    render(<RichTextDescription value="" onChange={onChange} />)
    screen.getByRole('textbox').focus()
    await userEvent.click(document.body)
    await new Promise((r) => setTimeout(r, 0))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('renders toolbar buttons B/I/U', () => {
    render(<RichTextDescription value="" onChange={vi.fn()} />)
    expect(screen.getByTestId('toolbar-bold')).toBeDefined()
    expect(screen.getByTestId('toolbar-italic')).toBeDefined()
    expect(screen.getByTestId('toolbar-underline')).toBeDefined()
  })
})
