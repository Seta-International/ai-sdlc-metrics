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

  it('calls onChange on blur with current HTML', async () => {
    const onChange = vi.fn()
    render(<RichTextDescription value="<p>Initial</p>" onChange={onChange} />)
    const editor = screen.getByRole('textbox')
    editor.focus()
    await userEvent.click(document.body)
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled()
    })
  })

  it('renders toolbar buttons B/I/U', () => {
    render(<RichTextDescription value="" onChange={vi.fn()} />)
    expect(screen.getByTestId('toolbar-bold')).toBeDefined()
    expect(screen.getByTestId('toolbar-italic')).toBeDefined()
    expect(screen.getByTestId('toolbar-underline')).toBeDefined()
  })
})
