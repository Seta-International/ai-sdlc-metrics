'use client'

import * as React from 'react'
import { Badge, Button } from '@future/ui'
import { ArrowRight } from '@future/ui/icons'
import { useChangeRequests } from '../../../lib/hooks/use-change-requests'
import type { ChangeRequestSummary } from '../../../lib/hooks/use-change-requests'

type FilterType = 'all' | 'pending' | 'approved' | 'rejected'

const FIELD_LABELS: Record<string, string> = {
  'person_profile.preferred_name': 'Preferred name',
  'person_profile.date_of_birth': 'Date of birth',
  'person_profile.nationality': 'Nationality',
  'person_profile.name_display_order': 'Name display order',
  'employment_detail.personal_email': 'Personal email',
  'employment_detail.personal_phone': 'Personal phone',
  'employment_detail.office_location': 'Office location',
  'employment_detail.work_phone': 'Work phone',
  'employment.company_email': 'Company email',
}

function fieldLabel(path: string): string {
  return FIELD_LABELS[path] ?? path
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'pending') {
    return (
      <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-100">
        Pending
      </Badge>
    )
  }
  if (status === 'approved') {
    return (
      <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100">
        Approved
      </Badge>
    )
  }
  if (status === 'rejected') {
    return (
      <Badge className="bg-red-100 text-red-800 border-red-200 hover:bg-red-100">Rejected</Badge>
    )
  }
  return <Badge variant="subtle">{status}</Badge>
}

function ChangeRequestCard({ request }: { request: ChangeRequestSummary }) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{fieldLabel(request.fieldPath)}</span>
        <StatusBadge status={request.status} />
      </div>
      <div className="flex items-center gap-2 text-xs text-fg-muted">
        <span className="line-through">{String(request.oldValue ?? '—')}</span>
        <ArrowRight className="h-3 w-3" />
        <span className="text-fg font-medium">{String(request.newValue ?? '—')}</span>
      </div>
      {request.reason && <p className="text-xs text-fg-muted">Reason: {request.reason}</p>}
      {request.status === 'rejected' && request.reviewNote && (
        <p className="text-xs text-red-700">Rejection note: {request.reviewNote}</p>
      )}
      <p className="text-xs text-fg-muted">
        Submitted {new Date(request.createdAt).toLocaleDateString()}
      </p>
    </div>
  )
}

interface TabChangeRequestsProps {
  employmentId: string
  canApprove: boolean
}

export function TabChangeRequests({
  employmentId,
  canApprove: _canApprove,
}: TabChangeRequestsProps) {
  const [filter, setFilter] = React.useState<FilterType>('all')
  const { items, isLoading } = useChangeRequests(employmentId)

  const filtered = items.filter((r) => filter === 'all' || r.status === filter)
  const counts: Record<FilterType, number> = {
    all: items.length,
    pending: items.filter((r) => r.status === 'pending').length,
    approved: items.filter((r) => r.status === 'approved').length,
    rejected: items.filter((r) => r.status === 'rejected').length,
  }

  if (isLoading) {
    return <div className="p-4 text-sm text-fg-muted">Loading…</div>
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex gap-2">
        {(['all', 'pending', 'approved', 'rejected'] as FilterType[]).map((f) => (
          <Button
            key={f}
            variant={filter === f ? 'outline' : 'ghost'}
            size="sm"
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f]})
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-fg-muted">No change requests found.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <ChangeRequestCard key={r.id} request={r} />
          ))}
        </div>
      )}
    </div>
  )
}
