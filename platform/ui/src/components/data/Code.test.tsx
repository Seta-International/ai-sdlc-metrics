import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Code } from './Code'

describe('Code', () => {
  it('renders source synchronously then upgrades to highlighted', async () => {
    render(<Code lang="json">{'{"a":1}'}</Code>)
    expect(screen.getByText(/\{"a":1\}/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('hl')).toBeInTheDocument(), { timeout: 4000 })
  })

  it('copies source to clipboard on click', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      writable: true,
      value: { writeText },
    })
    render(<Code lang="json">{'{"a":1}'}</Code>)
    fireEvent.click(screen.getByLabelText('Copy code'))
    expect(writeText).toHaveBeenCalledWith('{"a":1}')
  })
})
