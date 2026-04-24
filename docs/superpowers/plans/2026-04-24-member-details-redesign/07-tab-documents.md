# Member Details Redesign — Plan 07: TabDocuments

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `TabDocuments` with a grouped-by-kind layout, checkbox multi-select, bulk action bar, and delete confirmation dialog.

**Architecture:** Documents are grouped by `category` field (rendered as section headers). Multi-select state lives in the component. The bulk action bar appears when ≥1 item is selected. Delete dialog opens on single or bulk delete, calls the existing `anyTrpc.people.profile.documents` endpoint which currently returns empty (no-op). The upload flow keeps the existing dialog from the old tab.

**Tech Stack:** React, TypeScript, @future/ui (Button, Checkbox, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Badge, Skeleton), @future/ui/icons (Upload, Download, Trash2, FileText), Vitest + @testing-library/react

---

## Files

| Action | Path                                                                |
| ------ | ------------------------------------------------------------------- |
| Create | `apps/web-people/src/components/profile/tabs/TabDocuments.tsx`      |
| Create | `apps/web-people/src/components/profile/tabs/TabDocuments.spec.tsx` |
| Delete | `apps/web-people/src/components/profile/TabDocuments.tsx`           |

**Prerequisite:** Plan 01 complete.

---

### Task 1: Rewrite TabDocuments

**Files:**

- Create: `apps/web-people/src/components/profile/tabs/TabDocuments.spec.tsx`
- Create: `apps/web-people/src/components/profile/tabs/TabDocuments.tsx`
- Delete: `apps/web-people/src/components/profile/TabDocuments.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web-people/src/components/profile/tabs/TabDocuments.spec.tsx`:

```tsx
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
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd apps/web-people && bun run test:unit --reporter=verbose 2>&1 | grep -A 3 "tabs/TabDocuments"
```

Expected: FAIL with "Cannot find module './TabDocuments'".

- [ ] **Step 3: Create tabs/TabDocuments.tsx**

Create `apps/web-people/src/components/profile/tabs/TabDocuments.tsx`:

```tsx
'use client'

import * as React from 'react'
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Badge,
  Skeleton,
} from '@future/ui'
import { Upload, Download, Trash2, FileText } from '@future/ui/icons'
import type { EmployeeDocument } from '../../../lib/types'
import { trpc } from '../../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

interface TabDocumentsProps {
  employmentId: string
  canUpload: boolean
}

export function TabDocuments({ employmentId, canUpload }: TabDocumentsProps) {
  const [documents, setDocuments] = React.useState<EmployeeDocument[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [deleteTarget, setDeleteTarget] = React.useState<EmployeeDocument[] | null>(null)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await anyTrpc.people.profile.documents.query({ employmentId })
        setDocuments(result?.documents ?? [])
      } finally {
        setIsLoading(false)
      }
    })()
  }, [employmentId])

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clearSelection() {
    setSelected(new Set())
  }

  const grouped = React.useMemo(() => {
    const map: Record<string, EmployeeDocument[]> = {}
    for (const doc of documents) {
      ;(map[doc.category] = map[doc.category] ?? []).push(doc)
    }
    return map
  }, [documents])

  if (isLoading) {
    return (
      <div className="p-6 space-y-3">
        {[1, 2, 3].map((k) => (
          <Skeleton key={k} className="h-12 w-full" />
        ))}
      </div>
    )
  }

  const selectedDocs = documents.filter((d) => selected.has(d.id))

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-510 text-foreground">Documents</span>
          <Badge variant="subtle">{documents.length}</Badge>
        </div>
        {canUpload && (
          <Button variant="default" size="sm" className="gap-1.5">
            <Upload className="h-3.5 w-3.5" />
            Upload
          </Button>
        )}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5">
          <span className="text-xs text-secondary-foreground">{selected.size} selected</span>
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Download className="h-3 w-3" />
              Download selected
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5"
              onClick={() => setDeleteTarget(selectedDocs)}
            >
              <Trash2 className="h-3 w-3" />
              Delete selected
            </Button>
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Document list grouped by category */}
      {documents.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No documents yet.
          {canUpload && <> Use the Upload button to add one.</>}
        </p>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).map(([category, docs]) => (
            <div key={category}>
              <p className="mb-2 text-[10px] font-510 uppercase tracking-widest text-muted-foreground">
                {category}
              </p>
              <div className="rounded-lg border border-border overflow-hidden">
                {docs.map((doc, i) => (
                  <div
                    key={doc.id}
                    className={`group flex items-center gap-3 px-4 py-3 ${
                      i > 0 ? 'border-t border-border/60' : ''
                    } ${selected.has(doc.id) ? 'bg-accent/5' : 'hover:bg-secondary/20'}`}
                  >
                    {canUpload && (
                      <Checkbox
                        checked={selected.has(doc.id)}
                        onCheckedChange={() => toggleSelect(doc.id)}
                      />
                    )}
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-xs font-510 text-foreground">{doc.title}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(doc.uploadDate).toLocaleDateString('en-GB')}
                      </p>
                    </div>
                    {doc.status === 'expiring_soon' && (
                      <Badge variant="warning" className="text-tiny">
                        Expiring
                      </Badge>
                    )}
                    {/* Row actions — visible on hover */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Download">
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      {canUpload && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-400 hover:text-red-300"
                          title="Delete"
                          onClick={() => setDeleteTarget([doc])}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={deleteTarget !== null} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Delete {deleteTarget?.length ?? 0} document
              {(deleteTarget?.length ?? 0) > 1 ? 's' : ''}?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1 py-2">
            {deleteTarget?.map((d) => (
              <p key={d.id} className="text-xs text-muted-foreground">
                {d.title}
              </p>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                // Delete action — documents not yet wired to real endpoint
                setDeleteTarget(null)
                clearSelection()
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

- [ ] **Step 4: Delete old root-level TabDocuments**

```bash
rm apps/web-people/src/components/profile/TabDocuments.tsx
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd apps/web-people && bun run test:unit --reporter=verbose 2>&1 | grep -A 5 "TabDocuments"
```

Expected: all TabDocuments tests pass.

- [ ] **Step 6: Run full suite**

```bash
cd apps/web-people && bun run test:unit
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/web-people/src/components/profile/tabs/TabDocuments.tsx \
        apps/web-people/src/components/profile/tabs/TabDocuments.spec.tsx
git add -u apps/web-people/src/components/profile/TabDocuments.tsx
git commit -m "feat(web-people): rewrite TabDocuments with grouped layout, multi-select, and delete dialog"
```
