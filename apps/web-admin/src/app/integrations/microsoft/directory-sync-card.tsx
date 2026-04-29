'use client'

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
  Spinner,
  toast,
} from '@future/ui'
import { trpc } from '../../../lib/trpc'

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
  const syncStatusQuery = useQuery({
    queryKey: ['identity.getSyncStatus'],
    queryFn: () =>
      (
        trpc as unknown as {
          identity: { getSyncStatus: { query: (i: object) => Promise<SyncStatusDto> } }
        }
      ).identity.getSyncStatus.query({}) as Promise<SyncStatusDto>,
  })

  const triggerMutation = useMutation({
    mutationFn: () =>
      (
        trpc as unknown as {
          identity: { triggerSync: { mutate: (i: object) => Promise<{ jobId: string }> } }
        }
      ).identity.triggerSync.mutate({}) as Promise<{ jobId: string }>,
    onSuccess: () => {
      toast.success('Directory sync triggered — this may take a few minutes')
      void syncStatusQuery.refetch()
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Failed to trigger sync')
    },
  })

  const status = syncStatusQuery.data
  const isRunning = status?.syncStatus === 'running'
  const isBusy = isRunning || triggerMutation.isPending

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
        {status?.lastSyncStats?.errorMessage && (
          <p className="mt-2 text-xs text-destructive">{status.lastSyncStats.errorMessage}</p>
        )}
      </CardContent>
    </Card>
  )
}
