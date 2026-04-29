'use client'

import { useState } from 'react'
import { useMutation } from '@future/api-client'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
  Spinner,
} from '@future/ui'
import { useSession } from '@future/auth'
import { trpc } from '../../lib/trpc'

interface MsSyncTrpcSlice {
  planner: {
    msSync: {
      forceResyncTask: {
        mutate: (input: { tenantId: string; actorId: string; taskId: string }) => Promise<void>
      }
    }
  }
}

interface MsSyncSectionProps {
  task: {
    id: string
    msTaskId: string
    msTaskEtag: string | null
    lastPushedAt: string | null
  }
  onSyncComplete?: () => void
}

export function MsSyncSection({ task, onSyncComplete }: MsSyncSectionProps) {
  const session = useSession()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const t = trpc as unknown as MsSyncTrpcSlice

  const forceResync = useMutation({
    mutationFn: () =>
      t.planner.msSync.forceResyncTask.mutate({
        tenantId: session!.tenantId,
        actorId: session!.actorId,
        taskId: task.id,
      }),
    onSuccess: () => {
      setConfirmOpen(false)
      onSyncComplete?.()
    },
  })

  return (
    <Card>
      <CardHeader className="pb-2">
        <h3 className="text-sm font-semibold">Microsoft 365 sync</h3>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="text-sm text-muted-foreground space-y-1">
          <div>
            <dt className="inline">Last synced:</dt>{' '}
            <dd className="inline ml-1">{task.lastPushedAt ?? 'Never'}</dd>
          </div>
          <div>
            <dt className="inline">MS Task ID:</dt>{' '}
            <dd className="inline ml-1 font-mono text-xs">{task.msTaskId}</dd>
          </div>
        </dl>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setConfirmOpen(true)}
          disabled={forceResync.isPending}
        >
          {forceResync.isPending && <Spinner className="size-4 mr-2" />}
          Force re-sync from MS
        </Button>

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Force re-sync from Microsoft 365?</AlertDialogTitle>
              <AlertDialogDescription>
                This overwrites local changes on this task with the latest MS version. Unsaved edits
                will be lost.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => forceResync.mutate()}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Force re-sync
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  )
}
