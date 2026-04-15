'use client'

import * as React from 'react'
import { Card, Badge, Button, Alert, Skeleton } from '@future/ui'
import { FileText, Plus } from 'lucide-react'
import type { ContractVersion } from '../../lib/types'
import { trpc } from '../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

export function TabContracts({
  employmentId,
  canCreate,
  canViewSalary,
}: {
  employmentId: string
  canCreate: boolean
  canViewSalary: boolean
}) {
  const [contracts, setContracts] = React.useState<ContractVersion[]>([])
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await (anyTrpc.people.profile.contracts.query({ employmentId }) as Promise<{
          contracts: ContractVersion[]
        }>)
        setContracts(result.contracts)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [employmentId])

  if (isLoading) {
    return (
      <div className="space-y-4">
        {(['a', 'b'] as const).map((k) => (
          <Skeleton key={k} className="h-32 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {canCreate && (
        <div className="flex justify-end">
          <Button variant="default" size="sm" className="gap-1">
            <Plus className="h-3.5 w-3.5" />
            New Contract
          </Button>
        </div>
      )}
      {contracts.length === 0 ? (
        <p className="text-sm text-[#62666d] py-8 text-center">No contracts recorded.</p>
      ) : (
        contracts.map((contract) => {
          const statusCfg: Record<
            string,
            { label: string; variant: 'default' | 'subtle' | 'destructive' | 'info' | 'warning' }
          > = {
            active: { label: 'Active', variant: 'default' },
            expired: { label: 'Expired', variant: 'subtle' },
            superseded: { label: 'Superseded', variant: 'subtle' },
            draft: { label: 'Draft', variant: 'info' },
          }
          const cfg = statusCfg[contract.status] ?? {
            label: contract.status,
            variant: 'subtle' as const,
          }
          const isExpiringSoon =
            contract.endDate &&
            contract.status === 'active' &&
            Math.ceil((new Date(contract.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) <
              90

          return (
            <Card
              key={contract.id}
              className={`border p-5 ${contract.status === 'active' ? 'border-[#7170ff]/30 bg-[rgba(113,112,255,0.04)]' : 'border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)]'}`}
            >
              {isExpiringSoon && (
                <Alert className="mb-3 border-amber-500/30 bg-amber-500/5 text-sm text-amber-200">
                  Contract expiring soon
                </Alert>
              )}
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="subtle">{contract.contractType.replace('_', ' ')}</Badge>
                    <Badge variant={cfg.variant}>{cfg.label}</Badge>
                  </div>
                  <div className="text-sm text-[#d0d6e0]">
                    {new Date(contract.startDate).toLocaleDateString('en-GB')}
                    {contract.endDate &&
                      ` - ${new Date(contract.endDate).toLocaleDateString('en-GB')}`}
                    {!contract.endDate && ' - Indefinite'}
                  </div>
                  {canViewSalary && contract.baseSalary != null && (
                    <div className="text-sm text-[#8a8f98]">
                      Base salary: {contract.currency} {contract.baseSalary.toLocaleString()}
                    </div>
                  )}
                  {contract.signedDate && (
                    <div className="text-xs text-[#62666d]">
                      Signed: {new Date(contract.signedDate).toLocaleDateString('en-GB')}
                    </div>
                  )}
                </div>
                {contract.documentId && (
                  <Button variant="outline" size="sm" className="gap-1">
                    <FileText className="h-3.5 w-3.5" />
                    View Contract
                  </Button>
                )}
              </div>
            </Card>
          )
        })
      )}
    </div>
  )
}
