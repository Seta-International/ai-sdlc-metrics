'use client'

import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@future/api-client'
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Input,
  Label,
  Skeleton,
  Textarea,
} from '@future/ui'
import { Upload } from '@future/ui/icons'
import { AdminPageHeader } from '@/components/admin-page-header'
import { trpc } from '@/lib/trpc'

const MAX_FILE_BYTES = 5 * 1024 * 1024

type DocumentStatus = 'pending' | 'processing' | 'ready' | 'failed'

interface KbDocument {
  id: string
  title: string
  description: string | null
  status: DocumentStatus
  fileSizeBytes: number
  createdAt: string | Date
}

interface AgentsKbSlice {
  kb: {
    requestUpload: {
      mutate: (input: {
        title: string
        description?: string
        fileSizeBytes: number
        contentType: 'text/plain' | 'text/markdown' | 'application/pdf'
        fileName: string
      }) => Promise<{ documentId: string; presignedUrl: string }>
    }
    confirmUpload: {
      mutate: (input: { documentId: string }) => Promise<{ ok: boolean }>
    }
    listDocuments: { query: () => Promise<KbDocument[]> }
  }
}

const agentsKb = trpc.agents as unknown as AgentsKbSlice

const STATUS_BADGE: Record<
  DocumentStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  pending: { label: 'Pending', variant: 'secondary' },
  processing: { label: 'Processing', variant: 'secondary' },
  ready: { label: 'Ready', variant: 'default' },
  failed: { label: 'Failed', variant: 'destructive' },
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function KnowledgeBasePage() {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const { data: documents, isLoading } = useQuery({
    queryKey: ['agents', 'kb', 'documents'],
    queryFn: () => agentsKb.kb.listDocuments.query(),
    refetchInterval: 10_000,
  })

  const requestUpload = useMutation({
    mutationFn: agentsKb.kb.requestUpload.mutate,
  })

  const confirmUpload = useMutation({
    mutationFn: agentsKb.kb.confirmUpload.mutate,
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file || !title.trim()) return
    setUploadError(null)

    if (file.size > MAX_FILE_BYTES) {
      setUploadError('File exceeds 5 MB limit.')
      return
    }

    const contentType = file.type as 'text/plain' | 'text/markdown' | 'application/pdf'
    setUploading(true)
    try {
      const { documentId, presignedUrl } = await requestUpload.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        fileSizeBytes: file.size,
        contentType,
        fileName: file.name,
      })

      const putRes = await fetch(presignedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: file,
      })
      if (!putRes.ok) throw new Error(`S3 upload failed: ${putRes.status}`)

      await confirmUpload.mutateAsync({ documentId })

      setTitle('')
      setDescription('')
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      await queryClient.invalidateQueries({ queryKey: ['agents', 'kb', 'documents'] })
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <main className="p-8">
      <AdminPageHeader
        title="Knowledge Base"
        description="Upload reference documents the agent retrieves when answering policy or FAQ questions."
      />

      <form onSubmit={handleSubmit} className="mt-8 space-y-4 rounded-lg border border-border p-6">
        <h2 className="text-sm font-medium">Upload Document</h2>

        <div className="space-y-1">
          <Label htmlFor="kb-title">Title</Label>
          <Input
            id="kb-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Parental Leave Policy 2026"
            required
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="kb-description">Description (optional)</Label>
          <Textarea
            id="kb-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief summary of the document content"
            rows={2}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="kb-file">File (PDF, TXT, or MD — max 5 MB)</Label>
          <Input
            id="kb-file"
            ref={fileRef}
            type="file"
            accept=".pdf,.txt,.md,text/plain,text/markdown,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            required
          />
        </div>

        {uploadError && (
          <Alert variant="destructive">
            <AlertDescription>{uploadError}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" disabled={uploading || !file || !title.trim()}>
          <Upload className="mr-2 h-4 w-4" />
          {uploading ? 'Uploading…' : 'Upload'}
        </Button>
      </form>

      <div className="mt-8 space-y-3">
        <h2 className="text-sm font-medium">Documents</h2>

        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}

        {!isLoading && documents?.length === 0 && (
          <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
        )}

        {documents?.map((doc) => {
          const badge = STATUS_BADGE[doc.status] ?? STATUS_BADGE.pending
          return (
            <div
              key={doc.id}
              className="flex items-center justify-between rounded-md border border-border px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium">{doc.title}</p>
                {doc.description && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{doc.description}</p>
                )}
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatBytes(doc.fileSizeBytes)}
                </p>
              </div>
              <Badge variant={badge.variant}>{badge.label}</Badge>
            </div>
          )
        })}
      </div>
    </main>
  )
}
