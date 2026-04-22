'use client'

import * as React from 'react'
import type { ColumnDef, CellContext } from '@tanstack/react-table'
import {
  DataTable,
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  FileUploadDropzone,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type FutureTableState,
  defaultTableState,
} from '@future/ui'
import { CheckCircle2, AlertTriangle, Clock, Upload } from 'lucide-react'
import type { EmployeeDocument, DocumentRequirement } from '../../lib/types'
import { trpc } from '../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

const documentColumns: ColumnDef<EmployeeDocument>[] = [
  { accessorKey: 'title', header: 'Title', enableSorting: true },
  {
    accessorKey: 'category',
    header: 'Category',
    cell: ({ getValue }: CellContext<EmployeeDocument, unknown>) => (
      <Badge variant="subtle">{getValue() as string}</Badge>
    ),
  },
  {
    accessorKey: 'uploadDate',
    header: 'Uploaded',
    cell: ({ getValue }: CellContext<EmployeeDocument, unknown>) =>
      new Date(getValue() as string).toLocaleDateString('en-GB'),
  },
  {
    accessorKey: 'expiryDate',
    header: 'Expiry',
    cell: ({ getValue }: CellContext<EmployeeDocument, unknown>) => {
      const date = getValue() as string | null
      if (!date) return <span className="text-secondary-foreground/60">--</span>
      const daysRemaining = Math.ceil(
        (new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      )
      const color =
        daysRemaining < 0
          ? 'text-red-400'
          : daysRemaining < 30
            ? 'text-red-400'
            : daysRemaining < 90
              ? 'text-amber-400'
              : 'text-secondary-foreground'
      return (
        <span className={color}>
          {new Date(date).toLocaleDateString('en-GB')}
          {daysRemaining <= 90 && <span className="ml-1 text-xs">({daysRemaining}d)</span>}
        </span>
      )
    },
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ getValue }: CellContext<EmployeeDocument, unknown>) => {
      const status = getValue() as string
      const config: Record<
        string,
        { label: string; variant: 'default' | 'subtle' | 'destructive' | 'warning' | 'info' }
      > = {
        valid: { label: 'Valid', variant: 'default' },
        expiring_soon: { label: 'Expiring Soon', variant: 'warning' },
        expired: { label: 'Expired', variant: 'destructive' },
        pending_review: { label: 'Pending Review', variant: 'info' },
      }
      const c = config[status] ?? { label: status, variant: 'subtle' as const }
      return <Badge variant={c.variant}>{c.label}</Badge>
    },
  },
]

export function TabDocuments({
  employmentId,
  canUpload,
}: {
  employmentId: string
  canUpload: boolean
}) {
  const [documents, setDocuments] = React.useState<EmployeeDocument[]>([])
  const [requirements, setRequirements] = React.useState<DocumentRequirement[]>([])
  const [tableState, setTableState] = React.useState<FutureTableState>(defaultTableState)
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await (anyTrpc.people.profile.documents.query({ employmentId }) as Promise<{
          documents: EmployeeDocument[]
          requirements: DocumentRequirement[]
        }>)
        setDocuments(result.documents)
        setRequirements(result.requirements)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [employmentId])

  return (
    <div className="space-y-6">
      {requirements.length > 0 && (
        <Card className="border-border bg-card p-4">
          <h3 className="text-sm font-590 text-foreground mb-3">Required Documents</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {requirements.map((req) => (
              <div key={req.category + req.title} className="flex items-center gap-2 text-sm">
                {req.submitted ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : req.required ? (
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                ) : (
                  <Clock className="h-4 w-4 text-secondary-foreground/60" />
                )}
                <span
                  className={req.submitted ? 'text-secondary-foreground' : 'text-muted-foreground'}
                >
                  {req.title}
                </span>
                {req.required && !req.submitted && (
                  <Badge variant="destructive" className="text-tiny h-4 px-1">
                    Required
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-590 text-foreground">Documents</h3>
        {canUpload && (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="default" size="sm" className="gap-1">
                <Upload className="h-3.5 w-3.5" />
                Upload Document
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upload Document</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <FileUploadDropzone
                  description="Drop files here or click to browse"
                  onFiles={() => {}}
                />
                <div className="space-y-3">
                  <Input placeholder="Document title" />
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="identity">Identity</SelectItem>
                      <SelectItem value="tax">Tax</SelectItem>
                      <SelectItem value="contract">Contract</SelectItem>
                      <SelectItem value="certification">Certification</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input type="date" placeholder="Expiry date (optional)" />
                  <Button className="w-full">Upload</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <DataTable
        columns={documentColumns}
        rows={documents}
        state={tableState}
        totalCount={documents.length}
        onStateChange={setTableState}
        isLoading={isLoading}
      />
    </div>
  )
}
