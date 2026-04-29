'use client'

import * as React from 'react'
import { Button, Badge, Skeleton } from '@future/ui'
import { Plus, FileText } from '@future/ui/icons'
import { ProfileCard } from '../cards/ProfileCard'
import type { ContractVersion } from '../../../lib/types'
import { trpc } from '../../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

interface TabCompensationProps {
  employmentId: string
  canViewSalary: boolean
  canCreateContract: boolean
  canEdit: boolean
}

const CONTRACT_STATUS_VARIANT: Record<
  string,
  'default' | 'subtle' | 'info' | 'warning' | 'destructive'
> = {
  active: 'default',
  expired: 'subtle',
  superseded: 'subtle',
  draft: 'info',
}

export function TabCompensation({
  employmentId,
  canViewSalary,
  canCreateContract,
  canEdit,
}: TabCompensationProps) {
  const [contracts, setContracts] = React.useState<ContractVersion[]>([])
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await anyTrpc.people.listContractVersions.query({ employmentId })
        setContracts(Array.isArray(result) ? result : [])
      } finally {
        setIsLoading(false)
      }
    })()
  }, [employmentId])

  if (isLoading) {
    return (
      <div className="grid gap-8 p-6" style={{ gridTemplateColumns: '1fr 300px' }}>
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    )
  }

  const activeContract = contracts.find((c) => c.status === 'active')
  const history = [...contracts].sort(
    (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
  )

  return (
    <div className="grid gap-8 p-6" style={{ gridTemplateColumns: '1fr 300px' }}>
      {/* Main column */}
      <div className="flex flex-col gap-5">
        {/* Current */}
        <ProfileCard
          title="Current"
          locked={!canViewSalary}
          action={canViewSalary && canEdit ? { label: 'Adjust', onClick: () => {} } : undefined}
        >
          {!canViewSalary ? (
            <p className="py-1.5 text-xs text-muted-foreground">
              Restricted. You can view salary with{' '}
              <code className="font-mono text-secondary-foreground">people:salary:read</code>{' '}
              permission.
            </p>
          ) : activeContract ? (
            <div className="grid grid-cols-3 gap-4 py-2">
              <div>
                <p className="mb-1 text-tiny font-510 uppercase tracking-widest text-muted-foreground">
                  Base salary
                </p>
                <p className="text-xl font-510 tracking-tight text-foreground">
                  {activeContract.baseSalary?.toLocaleString() ?? '—'}
                </p>
                {activeContract.currency && (
                  <p className="text-micro text-muted-foreground">{activeContract.currency}</p>
                )}
              </div>
              <div>
                <p className="mb-1 text-tiny font-510 uppercase tracking-widest text-muted-foreground">
                  Type
                </p>
                <p className="text-xl font-510 tracking-tight text-foreground capitalize">
                  {activeContract.contractType.replace('_', ' ')}
                </p>
              </div>
              <div>
                <p className="mb-1 text-tiny font-510 uppercase tracking-widest text-muted-foreground">
                  Signed
                </p>
                <p className="text-sm text-secondary-foreground">
                  {activeContract.signedDate
                    ? new Date(activeContract.signedDate).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })
                    : '—'}
                </p>
              </div>
            </div>
          ) : (
            <p className="py-1.5 text-xs text-muted-foreground">No active contract.</p>
          )}
        </ProfileCard>

        {/* History */}
        <ProfileCard title="History">
          {history.length === 0 ? (
            <p className="py-1.5 text-xs text-muted-foreground">No contract history.</p>
          ) : (
            <div className="space-y-0">
              {history.map((contract, i) => (
                <div
                  key={contract.id}
                  className={`flex items-start justify-between py-3 ${
                    i > 0 ? 'border-t border-border/40' : ''
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="subtle" className="text-tiny">
                        {contract.contractType.replace('_', ' ')}
                      </Badge>
                      <Badge
                        variant={CONTRACT_STATUS_VARIANT[contract.status] ?? 'subtle'}
                        className="text-tiny"
                      >
                        {contract.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-secondary-foreground">
                      {new Date(contract.startDate).toLocaleDateString('en-GB')}
                      {contract.endDate
                        ? ` – ${new Date(contract.endDate).toLocaleDateString('en-GB')}`
                        : ' – Indefinite'}
                    </p>
                    {canViewSalary && contract.baseSalary != null && (
                      <p className="text-xs text-muted-foreground">
                        {contract.currency} {contract.baseSalary.toLocaleString()}
                      </p>
                    )}
                  </div>
                  {contract.documentId && (
                    <Button variant="ghost" size="sm" className="gap-1.5 h-7">
                      <FileText className="h-3 w-3" />
                      View
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </ProfileCard>

        {canCreateContract && (
          <Button variant="outline" size="sm" className="w-fit gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Add contract
          </Button>
        )}
      </div>

      {/* Right side rail */}
      <div className="flex flex-col gap-4">
        {canViewSalary && activeContract?.baseSalary != null && (
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="mb-1 text-tiny font-510 uppercase tracking-widest text-muted-foreground">
              Total comp
            </p>
            <p className="text-2xl font-510 tracking-tight text-foreground">
              {activeContract.baseSalary.toLocaleString()}
            </p>
            <p className="text-micro text-muted-foreground">{activeContract.currency} / year</p>
          </div>
        )}
        {activeContract && (
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="mb-1.5 text-tiny font-510 uppercase tracking-widest text-muted-foreground">
              Contract
            </p>
            <div className="flex items-center gap-2">
              <Badge variant="default" className="text-tiny">
                Active
              </Badge>
              <span className="text-xs text-muted-foreground capitalize">
                {activeContract.contractType.replace('_', ' ')}
              </span>
            </div>
            <p className="mt-1 text-micro text-muted-foreground">
              Since {new Date(activeContract.startDate).toLocaleDateString('en-GB')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
