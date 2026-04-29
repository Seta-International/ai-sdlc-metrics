'use client'

import * as React from 'react'
import {
  Alert,
  AlertDescription,
  Spinner,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  toast,
} from '@future/ui'
import { Cloud } from '@future/ui/icons'
import { MsImportsTable } from '../../../components/settings/MsImportsTable'
import { trpc } from '../../../lib/trpc'
import type { MsStagedUser } from '../../../lib/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

interface SyncStatus {
  lastSyncedAt: string | null
  pendingCount: number
  importedCount: number
}

interface StagedUserListResult {
  items: MsStagedUser[]
  total: number
}

export default function MsImportsPage() {
  const [status, setStatus] = React.useState<SyncStatus | null>(null)
  const [pendingResult, setPendingResult] = React.useState<StagedUserListResult>({
    items: [],
    total: 0,
  })
  const [importedResult, setImportedResult] = React.useState<StagedUserListResult>({
    items: [],
    total: 0,
  })
  const [skippedResult, setSkippedResult] = React.useState<StagedUserListResult>({
    items: [],
    total: 0,
  })
  const [isLoading, setIsLoading] = React.useState(true)
  const [isMutating, setIsMutating] = React.useState(false)

  const load = React.useCallback(async () => {
    setIsLoading(true)
    try {
      const s = await (anyTrpc.people.getMsSyncStatus.query() as Promise<SyncStatus>)
      const p = await (anyTrpc.people.listStagedMsUsers.query({
        status: 'pending',
        limit: 50,
        offset: 0,
      }) as Promise<StagedUserListResult>)
      const i = await (anyTrpc.people.listStagedMsUsers.query({
        status: 'imported',
        limit: 50,
        offset: 0,
      }) as Promise<StagedUserListResult>)
      const sk = await (anyTrpc.people.listStagedMsUsers.query({
        status: 'skipped',
        limit: 50,
        offset: 0,
      }) as Promise<StagedUserListResult>)
      setStatus(s)
      setPendingResult(p)
      setImportedResult(i)
      setSkippedResult(sk)
    } catch {
      // status stays null — will show "not connected" banner
    } finally {
      setIsLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  async function handleImport(id: string) {
    setIsMutating(true)
    try {
      await anyTrpc.people.importStagedMsUser.mutate({ id })
      toast.success('User imported successfully')
      void load()
    } catch (err) {
      toast.error((err as Error).message || 'Import failed')
    } finally {
      setIsMutating(false)
    }
  }

  async function handleSkip(id: string) {
    setIsMutating(true)
    try {
      await anyTrpc.people.skipStagedMsUser.mutate({ id })
      toast.success('User skipped')
      void load()
    } catch {
      toast.error('Skip failed')
    } finally {
      setIsMutating(false)
    }
  }

  async function handleReset(id: string) {
    setIsMutating(true)
    try {
      await anyTrpc.people.resetStagedMsUser.mutate({ id })
      toast.success('User reset to pending')
      void load()
    } catch {
      toast.error('Reset failed')
    } finally {
      setIsMutating(false)
    }
  }

  async function handleBulkImport(ids: string[]) {
    setIsMutating(true)
    try {
      const results = (await anyTrpc.people.bulkImportStagedMsUsers.mutate({ ids })) as Array<{
        id: string
        error?: string
      }>
      const errors = results.filter((r) => r.error)
      if (errors.length > 0) {
        toast.error(`${results.length - errors.length} imported, ${errors.length} failed`)
      } else {
        toast.success(`${results.length} users imported`)
      }
      void load()
    } catch {
      toast.error('Bulk import failed')
    } finally {
      setIsMutating(false)
    }
  }

  async function handleBulkSkip(ids: string[]) {
    setIsMutating(true)
    try {
      await anyTrpc.people.bulkSkipStagedMsUsers.mutate({ ids })
      toast.success(`${ids.length} users skipped`)
      void load()
    } catch {
      toast.error('Bulk skip failed')
    } finally {
      setIsMutating(false)
    }
  }

  const lastSyncLabel = status?.lastSyncedAt
    ? new Date(status.lastSyncedAt).toLocaleString()
    : 'Never synced'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-510 text-fg-primary">Microsoft 365 Imports</h2>
        {isLoading && <Spinner className="size-4" />}
      </div>

      {!isLoading && status !== null && (
        <p className="text-sm text-muted-foreground">
          Last synced: <span className="text-secondary-foreground">{lastSyncLabel}</span>
          {' · '}
          <span className="text-secondary-foreground">{status.pendingCount} pending</span>
          {' · '}
          <span className="text-secondary-foreground">{status.importedCount} imported</span>
        </p>
      )}

      {!isLoading && status === null && (
        <Alert>
          <Cloud className="h-4 w-4" />
          <AlertDescription>
            Microsoft 365 is not connected. Go to{' '}
            <a href="/admin/integrations" className="underline text-accent">
              Admin &rarr; Integrations
            </a>{' '}
            to connect.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            Pending {status && status.pendingCount > 0 && `(${status.pendingCount})`}
          </TabsTrigger>
          <TabsTrigger value="imported">Imported</TabsTrigger>
          <TabsTrigger value="skipped">Skipped</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          <MsImportsTable
            mode="pending"
            users={pendingResult.items}
            onImport={(id) => void handleImport(id)}
            onSkip={(id) => void handleSkip(id)}
            onBulkImport={(ids) => void handleBulkImport(ids)}
            onBulkSkip={(ids) => void handleBulkSkip(ids)}
            isLoading={isMutating}
          />
        </TabsContent>

        <TabsContent value="imported" className="mt-4">
          <MsImportsTable
            mode="imported"
            users={importedResult.items}
            onReset={(id) => void handleReset(id)}
            isLoading={isMutating}
          />
        </TabsContent>

        <TabsContent value="skipped" className="mt-4">
          <MsImportsTable
            mode="skipped"
            users={skippedResult.items}
            onReset={(id) => void handleReset(id)}
            isLoading={isMutating}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
