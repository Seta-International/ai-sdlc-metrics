'use client'

import * as React from 'react'
import { Badge, Button, Card, Skeleton } from '@future/ui'
import { Check, X } from 'lucide-react'
import type { ChangeRequest } from '../../lib/types'
import { trpc } from '../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

export function TabChangeRequests({
  employmentId,
  canApprove,
}: {
  employmentId: string
  canApprove: boolean
}) {
  const [requests, setRequests] = React.useState<ChangeRequest[]>([])
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await (anyTrpc.people.profile.changeRequests.query({
          employmentId,
        }) as Promise<{ requests: ChangeRequest[] }>)
        setRequests(result.requests)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [employmentId])

  if (isLoading) return <Skeleton className="h-48 w-full" />

  const pending = requests.filter((r) => r.status === 'pending')
  const decided = requests.filter((r) => r.status !== 'pending')

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-590 text-foreground">
            Pending Changes
            {pending.length > 0 && (
              <Badge variant="subtle" className="ml-2 h-5 px-1.5 text-tiny">
                {pending.length}
              </Badge>
            )}
          </h3>
          {canApprove && pending.length > 1 && (
            <div className="flex gap-2">
              <Button variant="default" size="sm" className="gap-1 text-xs">
                <Check className="h-3 w-3" />
                Approve All
              </Button>
              <Button variant="outline" size="sm" className="gap-1 text-xs">
                <X className="h-3 w-3" />
                Reject All
              </Button>
            </div>
          )}
        </div>
        {pending.length === 0 ? (
          <p className="text-sm text-secondary-foreground/60">No pending changes.</p>
        ) : (
          <div className="space-y-2">
            {pending.map((req) => (
              <Card key={req.id} className="border-border bg-card p-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="text-sm font-510 text-foreground">{req.fieldLabel}</div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground line-through">{req.oldValue}</span>
                      <span className="text-secondary-foreground/60">-&gt;</span>
                      <span className="text-emerald-500 font-510">{req.newValue}</span>
                    </div>
                    <div className="text-xs text-secondary-foreground/60">
                      By {req.requestedByName} on{' '}
                      {new Date(req.requestedAt).toLocaleDateString('en-GB')}
                      {req.effectiveDate && (
                        <> / Effective: {new Date(req.effectiveDate).toLocaleDateString('en-GB')}</>
                      )}
                    </div>
                  </div>
                  {canApprove && (
                    <div className="flex gap-1 shrink-0">
                      <Button variant="default" size="sm" className="h-7 gap-1">
                        <Check className="h-3 w-3" />
                        Approve
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 gap-1">
                        <X className="h-3 w-3" />
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {decided.length > 0 && (
        <div>
          <h3 className="text-sm font-590 text-foreground mb-3">History</h3>
          <div className="space-y-2">
            {decided.map((req) => {
              const statusCfg: Record<
                string,
                { label: string; variant: 'default' | 'subtle' | 'destructive' | 'info' }
              > = {
                approved: { label: 'Approved', variant: 'default' },
                rejected: { label: 'Rejected', variant: 'destructive' },
                cancelled: { label: 'Cancelled', variant: 'subtle' },
              }
              const cfg = statusCfg[req.status] ?? {
                label: req.status,
                variant: 'subtle' as const,
              }
              return (
                <Card key={req.id} className="border-sidebar-border bg-overlay/1 p-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-secondary-foreground">{req.fieldLabel}</span>
                        <Badge variant={cfg.variant}>{cfg.label}</Badge>
                      </div>
                      <div className="text-xs text-secondary-foreground/60">
                        {req.oldValue} -&gt; {req.newValue}
                      </div>
                    </div>
                    <div className="text-xs text-secondary-foreground/60">
                      {req.reviewedAt && new Date(req.reviewedAt).toLocaleDateString('en-GB')}
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
