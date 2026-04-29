'use client'

import { useState, useEffect } from 'react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Spinner,
  toast,
} from '@future/ui'
import { trpc } from '../../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

interface SyncStatusDto {
  syncEnabled: boolean
  syncStatus: string | null
  lastSyncAt: string | null
  nextScheduledAt: string | null
  lastSyncStats: {
    usersCreated: number
    usersDeactivated: number
    rolesChanged: number
    status: string
    errorMessage: string | null
  } | null
}

export function DirectorySyncCard() {
  const [status, setStatus] = useState<SyncStatusDto | null>(null)
  const [isLoadingStatus, setIsLoadingStatus] = useState(true)
  const [isMutating, setIsMutating] = useState(false)

  async function loadStatus() {
    setIsLoadingStatus(true)
    try {
      const s = await (anyTrpc.identity.getSyncStatus.query({}) as Promise<SyncStatusDto>)
      setStatus(s)
    } catch {
      setStatus(null)
    } finally {
      setIsLoadingStatus(false)
    }
  }

  useEffect(() => {
    void loadStatus()
  }, [])

  async function handleTriggerSync() {
    setIsMutating(true)
    try {
      await (anyTrpc.identity.triggerSync.mutate({}) as Promise<{ jobId: string }>)
      toast.success('Directory sync triggered — this may take a few minutes')
      void loadStatus()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to trigger sync')
    } finally {
      setIsMutating(false)
    }
  }

  const isRunning = status?.syncStatus === 'running'
  const isBusy = isRunning || isMutating

  const lastSyncLabel = status?.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString() : 'Never'

  const statusBadgeVariant =
    status?.syncStatus === 'running'
      ? 'warning'
      : status?.syncStatus === 'failed'
        ? 'destructive'
        : 'subtle'

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">People Directory Sync</CardTitle>
            <CardDescription>
              Sync user profiles from Microsoft Entra ID into Future
            </CardDescription>
          </div>
          {!isLoadingStatus && status && (
            <Badge variant={statusBadgeVariant} className="capitalize">
              {status.syncStatus ?? 'idle'}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {isLoadingStatus ? (
              <span className="flex items-center gap-1.5">
                <Spinner className="size-3" />
                Loading…
              </span>
            ) : (
              <>
                Last sync: <span className="text-secondary-foreground">{lastSyncLabel}</span>
              </>
            )}
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={isBusy || isLoadingStatus}
            onClick={() => void handleTriggerSync()}
          >
            {isBusy && <Spinner className="size-3.5 mr-1.5" />}
            Sync Now
          </Button>
        </div>
        {status?.lastSyncStats && status.lastSyncStats.errorMessage && (
          <p className="mt-2 text-xs text-destructive">{status.lastSyncStats.errorMessage}</p>
        )}
      </CardContent>
    </Card>
  )
}
