'use client'

import { Badge } from '@future/ui'

export interface ConflictDto {
  id: string
  kind: string
  createdAt: string
  taskId: string | null
  taskTitle: string | null
  planTitle: string | null
  field: string | null
  mineValue: unknown
  theirsValue: unknown
  limitCode: string | null
  resolution: string | null
  resolvedAt: string | null
  rawError: unknown
}

type BadgeVariant = 'default' | 'info' | 'warning' | 'destructive' | 'success' | 'subtle'

interface KindMeta {
  label: string
  variant: BadgeVariant
}

const KIND_META: Record<string, KindMeta> = {
  field_lww: { label: 'Field overwrite', variant: 'info' },
  push_412_exhausted: { label: 'Push retry exhausted', variant: 'warning' },
  push_403_quota: { label: 'Quota limit', variant: 'destructive' },
  push_failed: { label: 'Push failed', variant: 'destructive' },
  pull_unresolved_assignee: { label: 'Assignee pending', variant: 'info' },
  credential_invalidated: { label: 'Credential invalid', variant: 'destructive' },
  attachment_upload_failed: { label: 'Attachment upload failed', variant: 'warning' },
}

export function kindMeta(kind: string): KindMeta {
  return KIND_META[kind] ?? { label: kind, variant: 'default' }
}

export function KindBadge({ kind }: { kind: string }) {
  const meta = kindMeta(kind)
  return <Badge variant={meta.variant}>{meta.label}</Badge>
}

/**
 * Formats an ISO date string as a human-readable relative time (e.g. "3 minutes ago").
 * No external dependency — keeps web-admin lean.
 */
export function formatRelativeTime(isoString: string): string {
  const now = Date.now()
  const then = new Date(isoString).getTime()
  const diffMs = now - then
  const diffSec = Math.floor(diffMs / 1000)

  if (diffSec < 60) return diffSec <= 1 ? 'just now' : `${diffSec} seconds ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return diffMin === 1 ? '1 minute ago' : `${diffMin} minutes ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return diffHr === 1 ? '1 hour ago' : `${diffHr} hours ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 30) return diffDay === 1 ? '1 day ago' : `${diffDay} days ago`
  const diffMonth = Math.floor(diffDay / 30)
  if (diffMonth < 12) return diffMonth === 1 ? '1 month ago' : `${diffMonth} months ago`
  const diffYear = Math.floor(diffMonth / 12)
  return diffYear === 1 ? '1 year ago' : `${diffYear} years ago`
}
