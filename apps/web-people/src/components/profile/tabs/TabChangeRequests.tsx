'use client'

import * as React from 'react'
import { Button, Badge } from '@future/ui'
import { Check, X, ArrowRight } from '@future/ui/icons'

// TODO: replace with real people.listChangeRequests query once backend is wired

interface MockChangeRequest {
  id: string
  field: string
  from: string
  to: string
  submitterName: string
  reason: string
  age: string
  priority: 'high' | 'normal'
  status: 'pending' | 'approved' | 'rejected'
}

const MOCK_REQUESTS: MockChangeRequest[] = [
  {
    id: 'cr-001',
    field: 'Job title',
    from: 'Senior Engineer',
    to: 'Staff Engineer',
    submitterName: 'Alice Johnson',
    reason: 'Post-promotion title alignment.',
    age: '2 days',
    priority: 'high',
    status: 'pending',
  },
  {
    id: 'cr-002',
    field: 'Work arrangement',
    from: 'On-site',
    to: 'Hybrid — 3 days',
    submitterName: 'Alice Johnson',
    reason: 'Agreed with manager in Q1 review.',
    age: '5 days',
    priority: 'normal',
    status: 'pending',
  },
  {
    id: 'cr-003',
    field: 'Department',
    from: 'Infrastructure',
    to: 'Platform',
    submitterName: 'Kai Tanaka',
    reason: 'Internal transfer.',
    age: '2 weeks',
    priority: 'normal',
    status: 'approved',
  },
]

type FilterType = 'pending' | 'approved' | 'rejected' | 'all'

const FILTER_COUNTS: Record<FilterType, number> = {
  pending: 2,
  approved: 1,
  rejected: 0,
  all: 3,
}

interface TabChangeRequestsProps {
  employmentId: string
  canApprove: boolean
}

export function TabChangeRequests({ canApprove }: TabChangeRequestsProps) {
  const [filter, setFilter] = React.useState<FilterType>('pending')
  const [selectedId, setSelectedId] = React.useState<string>(MOCK_REQUESTS[0]!.id)

  const filtered = MOCK_REQUESTS.filter((r) => filter === 'all' || r.status === filter)
  const active = MOCK_REQUESTS.find((r) => r.id === selectedId) ?? MOCK_REQUESTS[0]!

  return (
    <div className="grid h-full" style={{ gridTemplateColumns: '1fr 420px' }}>
      {/* List panel */}
      <div>
        {/* Filter pills */}
        <div className="flex gap-1.5 border-b border-border px-4 py-2.5">
          {(['pending', 'approved', 'rejected', 'all'] as FilterType[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-2.5 py-1 text-xs font-510 transition-colors ${
                filter === f
                  ? 'border border-border bg-secondary/40 text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
              <span className="ml-1.5 text-tiny text-muted-foreground">{FILTER_COUNTS[f]}</span>
            </button>
          ))}
        </div>

        {/* Request rows */}
        <div>
          {filtered.map((req) => (
            <div
              key={req.id}
              data-testid="cr-row"
              onClick={() => setSelectedId(req.id)}
              className={`cursor-pointer border-b border-border/60 px-4 py-3 transition-colors ${
                selectedId === req.id
                  ? 'border-l-2 border-l-accent bg-accent/5'
                  : 'border-l-2 border-l-transparent hover:bg-secondary/10'
              }`}
            >
              <div className="mb-1.5 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-510 text-foreground">{req.submitterName}</p>
                </div>
                {req.priority === 'high' && (
                  <Badge variant="warning" className="text-tiny">
                    High
                  </Badge>
                )}
                <span className="text-tiny text-muted-foreground">{req.age}</span>
              </div>
              <p className="text-xs text-secondary-foreground">
                <span className="text-muted-foreground">{req.field}:</span>{' '}
                <span className="text-muted-foreground line-through">{req.from}</span>{' '}
                <ArrowRight className="inline h-3 w-3 text-muted-foreground" />{' '}
                <span className="font-510 text-foreground">{req.to}</span>
              </p>
              <p className="mt-1 text-micro text-muted-foreground">{req.reason}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Detail panel */}
      <aside className="border-l border-border bg-card/50 p-5 overflow-auto">
        <p className="mb-3 text-tiny font-510 uppercase tracking-widest text-muted-foreground">
          Request detail
        </p>

        <div className="mb-4">
          <p className="text-sm font-510 text-foreground">{active.submitterName}</p>
          <p className="text-micro text-muted-foreground">ID: {active.id.toUpperCase()}</p>
        </div>

        {/* FROM / TO */}
        <div className="mb-4 rounded-lg border border-border bg-card p-3">
          <p className="mb-2 text-tiny font-510 uppercase tracking-widest text-muted-foreground">
            {active.field}
          </p>
          <div className="space-y-2">
            <div className="rounded border border-red-500/15 bg-red-500/5 p-2">
              <p className="mb-0.5 text-tiny font-510 text-red-400">FROM</p>
              <p className="text-xs text-secondary-foreground line-through">{active.from}</p>
            </div>
            <div className="rounded border border-emerald-500/20 bg-emerald-500/5 p-2">
              <p className="mb-0.5 text-tiny font-510 text-emerald-400">TO</p>
              <p className="text-xs font-510 text-foreground">{active.to}</p>
            </div>
          </div>
        </div>

        <div className="mb-1 flex justify-between text-xs">
          <span className="text-muted-foreground">Requested by</span>
          <span className="text-secondary-foreground">{active.submitterName}</span>
        </div>
        <div className="mb-1 flex justify-between text-xs">
          <span className="text-muted-foreground">Reason</span>
          <span className="text-secondary-foreground">{active.reason}</span>
        </div>
        <div className="mb-4 flex justify-between text-xs">
          <span className="text-muted-foreground">Submitted</span>
          <span className="text-secondary-foreground">{active.age} ago</span>
        </div>

        {canApprove && (
          <div className="flex gap-2">
            <Button
              variant="default"
              size="sm"
              className="flex-1 gap-1.5"
              onClick={() => console.log('Approve', active.id)}
            >
              <Check className="h-3.5 w-3.5" />
              Approve
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="flex-1 gap-1.5"
              onClick={() => console.log('Reject', active.id)}
            >
              <X className="h-3.5 w-3.5" />
              Reject
            </Button>
          </div>
        )}
      </aside>
    </div>
  )
}
