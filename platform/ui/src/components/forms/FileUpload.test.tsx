import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FileUpload } from './FileUpload'

describe('FileUpload', () => {
  it('reports selected files', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const onFilesSelected = vi.fn()
    render(<FileUpload onFilesSelected={onFilesSelected} />)
    const input = screen.getByLabelText(/file upload/i) as HTMLInputElement
    const file = new File(['x'], 'a.txt', { type: 'text/plain' })
    await user.upload(input, file)
    expect(onFilesSelected).toHaveBeenCalledWith([file])
  })

  it('rejects files over maxSizeMb', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const onReject = vi.fn()
    render(<FileUpload onFilesSelected={() => {}} onReject={onReject} maxSizeMb={0.000001} />)
    const input = screen.getByLabelText(/file upload/i) as HTMLInputElement
    const big = new File(['x'.repeat(100)], 'b.txt', { type: 'text/plain' })
    await user.upload(input, big)
    expect(onReject).toHaveBeenCalledWith(big, 'size')
  })
})
