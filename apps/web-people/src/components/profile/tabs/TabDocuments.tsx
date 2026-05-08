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
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set())
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
      <div className="space-y-3 p-6">
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
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Download className="h-3 w-3" />
              Download
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5"
              onClick={() => setDeleteTarget(selectedDocs)}
            >
              <Trash2 className="h-3 w-3" />
              Delete
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
              <p className="mb-2 text-tiny font-510 uppercase tracking-widest text-muted-foreground">
                {category}
              </p>
              <div className="overflow-hidden rounded-lg border border-border">
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
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-510 text-foreground">{doc.title}</p>
                      <p className="text-tiny text-muted-foreground">
                        {new Date(doc.uploadDate).toLocaleDateString('en-GB')}
                      </p>
                    </div>
                    {doc.status === 'expiring_soon' && (
                      <Badge variant="warning" className="text-tiny">
                        Expiring
                      </Badge>
                    )}
                    {/* Row actions — visible on hover */}
                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
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
