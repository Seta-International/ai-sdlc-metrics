'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@future/api-client'
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Progress,
  Spinner,
  toast,
} from '@future/ui'
import { trpc } from '../../../lib/trpc'

// mirrors identity.getSyncStatus return shape
// (identityAdminRouter stub returns null at type level; real return type is from GetSyncStatusHandler)
interface SyncStatusResponse {
  syncEnabled: boolean
  syncStatus: string | null
  syncProcessed: number
  syncTotal: number
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

// HACK: identity router stub returns null at the type level; remove once identityAdminRouter
// is typed with real return types in app-router.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const identityTrpc = (trpc as any).identity.admin

export function DirectorySyncCard() {
  // pollAfterTrigger bridges the gap between "job enqueued" and the job worker setting
  // syncStatus:'running'. Without it, the onSuccess refetch may return 'idle' (job not yet
  // picked up), refetchInterval drops to false, and the progress bar never appears.
  const [pollAfterTrigger, setPollAfterTrigger] = useState(false)

  const syncStatusQuery = useQuery({
    queryKey: ['identity.admin.getSyncStatus'],
    queryFn: () => identityTrpc.getSyncStatus.query({}) as Promise<SyncStatusResponse>,
    refetchInterval: (q) =>
      q.state.data?.syncStatus === 'running' || pollAfterTrigger ? 2000 : false,
  })

  const triggerMutation = useMutation({
    mutationFn: () => identityTrpc.triggerSync.mutate({}) as Promise<{ jobId: string }>,
    onSuccess: () => {
      toast.success('Directory sync triggered — this may take a few minutes')
      setPollAfterTrigger(true)
      void syncStatusQuery.refetch()
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Failed to trigger sync')
    },
  })

  const status = syncStatusQuery.data
  const isRunning = status?.syncStatus === 'running'
  const isBusy = isRunning || triggerMutation.isPending

  // Once the job is visible as running, the refetchInterval condition takes over.
  if (isRunning && pollAfterTrigger) {
    setPollAfterTrigger(false)
  }

  // Safety: stop bridging poll after 30 s regardless (handles enqueue failures not surfaced as errors).
  useEffect(() => {
    if (!pollAfterTrigger) return
    const t = setTimeout(() => setPollAfterTrigger(false), 30_000)
    return () => clearTimeout(t)
  }, [pollAfterTrigger])

  const lastSyncLabel = status?.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString() : 'Never'

  const statusBadgeVariant =
    status?.syncStatus === 'running'
      ? 'warning'
      : status?.syncStatus === 'failed'
        ? 'destructive'
        : 'subtle'

  return (
    <Card data-testid="directory-sync-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">People Directory Sync</CardTitle>
            <CardDescription>
              Sync user profiles from Microsoft Entra ID into Future
            </CardDescription>
          </div>
          {!syncStatusQuery.isLoading && status && (
            <Badge variant={statusBadgeVariant} className="capitalize">
              {status.syncStatus ?? 'idle'}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {syncStatusQuery.isError && (
          <Alert variant="destructive" className="mb-3">
            <AlertDescription>Failed to load sync status</AlertDescription>
          </Alert>
        )}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {syncStatusQuery.isLoading ? (
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
            disabled={isBusy || syncStatusQuery.isLoading}
            onClick={() => triggerMutation.mutate()}
          >
            {isBusy && <Spinner className="size-3.5 mr-1.5" />}
            Sync Now
          </Button>
        </div>
        {isRunning && (status?.syncTotal ?? 0) > 0 && (
          <div className="mt-3 flex flex-col gap-1.5">
            <Progress value={(status!.syncProcessed / status!.syncTotal) * 100} />
            <p className="text-xs text-muted-foreground">
              {status!.syncProcessed} / {status!.syncTotal} users synced
            </p>
          </div>
        )}
        {status?.lastSyncStats?.errorMessage && (
          <p className="mt-2 text-xs text-destructive">{status.lastSyncStats.errorMessage}</p>
        )}
      </CardContent>
    </Card>
  )
}
