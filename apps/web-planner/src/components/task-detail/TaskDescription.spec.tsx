import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import React from 'react'
import { TaskDescription } from './TaskDescription'

vi.mock('@future/ui', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@future/ui')>()
  return { ...mod, toast: vi.fn() }
})

import { toast } from '@future/ui'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function makePasteEvent(html: string, plain: string) {
  return {
    clipboardData: {
      getData: (type: string) => {
        if (type === 'text/html') return html
        if (type === 'text/plain') return plain
        return ''
      },
    },
    preventDefault: vi.fn(),
    currentTarget: null as unknown as HTMLTextAreaElement,
  }
}

describe('TaskDescription', () => {
  it('renders textarea with value', () => {
    render(<TaskDescription value="hello" onChange={vi.fn()} />)
    const textarea = screen.getByPlaceholderText('Add a description…') as HTMLTextAreaElement
    expect(textarea.defaultValue).toBe('hello')
  })

  it('calls onChange on blur', () => {
    const onChange = vi.fn()
    render(<TaskDescription value="initial" onChange={onChange} />)
    const textarea = screen.getByPlaceholderText('Add a description…')
    fireEvent.blur(textarea, { target: { value: 'updated' } })
    expect(onChange).toHaveBeenCalledWith('updated')
  })

  it('paste with HTML strips formatting and shows toast once', () => {
    const onChange = vi.fn()
    render(<TaskDescription value="" onChange={onChange} />)
    const textarea = screen.getByPlaceholderText('Add a description…') as HTMLTextAreaElement

    Object.defineProperty(textarea, 'selectionStart', { value: 0, configurable: true })
    Object.defineProperty(textarea, 'selectionEnd', { value: 0, configurable: true })
    Object.defineProperty(textarea, 'value', { value: '', configurable: true })

    const event = makePasteEvent('<b>bold</b>', 'bold')
    event.currentTarget = textarea

    fireEvent.paste(textarea, event)

    expect(onChange).toHaveBeenCalledWith('bold')
    expect(toast).toHaveBeenCalledOnce()
    expect(toast).toHaveBeenCalledWith('Rich text is not supported — formatting was removed.')
  })

  it('toast not shown twice on second HTML paste', () => {
    const onChange = vi.fn()
    render(<TaskDescription value="" onChange={onChange} />)
    const textarea = screen.getByPlaceholderText('Add a description…') as HTMLTextAreaElement

    Object.defineProperty(textarea, 'selectionStart', { value: 0, configurable: true })
    Object.defineProperty(textarea, 'selectionEnd', { value: 0, configurable: true })
    Object.defineProperty(textarea, 'value', { value: '', configurable: true })

    fireEvent.paste(textarea, makePasteEvent('<b>bold</b>', 'bold'))
    fireEvent.paste(textarea, makePasteEvent('<i>italic</i>', 'italic'))

    expect(toast).toHaveBeenCalledOnce()
  })

  it('paste with plain text only passes through without preventDefault', () => {
    const onChange = vi.fn()
    render(<TaskDescription value="" onChange={onChange} />)
    const textarea = screen.getByPlaceholderText('Add a description…')

    const preventDefaultSpy = vi.fn()
    fireEvent.paste(textarea, {
      clipboardData: {
        getData: (type: string) => {
          if (type === 'text/html') return ''
          if (type === 'text/plain') return 'plain only'
          return ''
        },
      },
      preventDefault: preventDefaultSpy,
    })

    expect(preventDefaultSpy).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
  })
})
