import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TabDocuments } from './TabDocuments'
import type { EmployeeDocument } from '../../../lib/types'

const { mockDocumentsQuery } = vi.hoisted(() => ({
  mockDocumentsQuery: vi.fn().mockResolvedValue({ documents: [], requirements: [] }),
}))

vi.mock('../../../lib/trpc', () => ({
  trpc: {
    people: {
      profile: { documents: { query: mockDocumentsQuery } },
    },
  },
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const mockDocs: EmployeeDocument[] = [
  {
    id: 'd1',
    title: 'Employment contract — 2023.pdf',
    category: 'Contract',
    uploadDate: '2023-07-15',
    expiryDate: null,
    status: 'valid',
    isConfidential: false,
    documentId: 'doc-1',
  },
  {
    id: 'd2',
    title: 'Tax form 2024.pdf',
    category: 'Tax',
    uploadDate: '2025-02-04',
    expiryDate: null,
    status: 'valid',
    isConfidential: false,
    documentId: 'doc-2',
  },
  {
    id: 'd3',
    title: 'NDA.pdf',
    category: 'Contract',
    uploadDate: '2026-03-01',
    expiryDate: null,
    status: 'valid',
    isConfidential: false,
    documentId: 'doc-3',
  },
]

describe('TabDocuments', () => {
  it('shows "No documents yet." when empty', async () => {
    mockDocumentsQuery.mockResolvedValueOnce({ documents: [], requirements: [] })
    render(<TabDocuments employmentId="emp-1" canUpload={false} />)
    await waitFor(() => expect(screen.getByText('No documents yet.')).toBeTruthy())
  })

  it('renders document titles when loaded', async () => {
    mockDocumentsQuery.mockResolvedValueOnce({ documents: mockDocs, requirements: [] })
    render(<TabDocuments employmentId="emp-1" canUpload={false} />)
    await waitFor(() => expect(screen.getByText('Employment contract — 2023.pdf')).toBeTruthy())
  })

  it('groups documents by category', async () => {
    mockDocumentsQuery.mockResolvedValueOnce({ documents: mockDocs, requirements: [] })
    render(<TabDocuments employmentId="emp-1" canUpload={false} />)
    await waitFor(() => {
      expect(screen.getByText('Contract')).toBeTruthy()
      expect(screen.getByText('Tax')).toBeTruthy()
    })
  })

  it('hides Upload button when canUpload is false', async () => {
    mockDocumentsQuery.mockResolvedValueOnce({ documents: [], requirements: [] })
    render(<TabDocuments employmentId="emp-1" canUpload={false} />)
    await waitFor(() => screen.getByText('No documents yet.'))
    expect(screen.queryByText('Upload')).toBeNull()
  })

  it('shows Upload button when canUpload is true', async () => {
    mockDocumentsQuery.mockResolvedValueOnce({ documents: [], requirements: [] })
    render(<TabDocuments employmentId="emp-1" canUpload={true} />)
    await waitFor(() => expect(screen.getByText('Upload')).toBeTruthy())
  })

  it('shows bulk action bar when a document is selected', async () => {
    mockDocumentsQuery.mockResolvedValueOnce({ documents: mockDocs, requirements: [] })
    render(<TabDocuments employmentId="emp-1" canUpload={true} />)
    await waitFor(() => screen.getByText('Employment contract — 2023.pdf'))

    const checkboxes = screen.getAllByRole('checkbox')
    await userEvent.click(checkboxes[0]!)
    expect(screen.getByText(/selected/)).toBeTruthy()
  })

  it('opens delete dialog when delete icon clicked', async () => {
    mockDocumentsQuery.mockResolvedValueOnce({ documents: mockDocs, requirements: [] })
    render(<TabDocuments employmentId="emp-1" canUpload={true} />)
    await waitFor(() => screen.getByText('Employment contract — 2023.pdf'))

    const deleteButtons = screen.getAllByTitle('Delete')
    await userEvent.click(deleteButtons[0]!)
    expect(screen.getByText(/Delete 1 document/)).toBeTruthy()
  })
})
