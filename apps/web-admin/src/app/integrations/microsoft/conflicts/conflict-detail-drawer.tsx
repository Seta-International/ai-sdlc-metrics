'use client'

import { useMutation } from '@future/api-client'
import { useSession } from '@future/auth'
import {
  Button,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@future/ui'
import { ExternalLink } from '@future/ui/icons'
import { trpc } from '../../../../lib/trpc'
import type { ConflictDto } from './conflict-row'

interface PlannerConflictTrpcSlice {
  planner: {
    msSync: {
      conflicts: {
        retry: {
          mutate: (input: {
            tenantId: string
            actorId: string
            conflictId: string
          }) => Promise<void>
        }
        acceptMsState: {
          mutate: (input: {
            tenantId: string
            actorId: string
            conflictId: string
          }) => Promise<void>
        }
      }
    }
  }
}

export interface ConflictDetailDrawerProps {
  conflict: ConflictDto | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onActionSuccess: () => void
}

function ValueDisplay({ label, value }: { label: string; value: unknown }) {
  const text =
    value === null || value === undefined
      ? '—'
      : typeof value === 'string'
        ? value
        : JSON.stringify(value, null, 2)

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <pre className="rounded-md bg-secondary/30 px-3 py-2 font-mono text-xs text-foreground whitespace-pre-wrap break-all">
        {text}
      </pre>
    </div>
  )
}

function RawErrorBlock({ rawError }: { rawError: unknown }) {
  if (rawError === null || rawError === undefined) return null
  const text = typeof rawError === 'string' ? rawError : JSON.stringify(rawError, null, 2)
  return (
    <details className="rounded-md border border-border">
      <summary className="cursor-pointer px-3 py-2 text-sm text-muted-foreground select-none hover:text-foreground">
        Raw error
      </summary>
      <pre className="px-3 pb-3 font-mono text-xs text-foreground whitespace-pre-wrap break-all">
        {text}
      </pre>
    </details>
  )
}

export function ConflictDetailDrawer({
  conflict,
  open,
  onOpenChange,
  onActionSuccess,
}: ConflictDetailDrawerProps) {
  const session = useSession()
  const t = trpc as unknown as PlannerConflictTrpcSlice

  const retryMutation = useMutation({
    mutationFn: (conflictId: string) =>
      t.planner.msSync.conflicts.retry.mutate({
        tenantId: session!.tenantId,
        actorId: session!.actorId,
        conflictId,
      }),
    onSuccess: () => {
      onOpenChange(false)
      onActionSuccess()
    },
  })

  const acceptMsMutation = useMutation({
    mutationFn: (conflictId: string) =>
      t.planner.msSync.conflicts.acceptMsState.mutate({
        tenantId: session!.tenantId,
        actorId: session!.actorId,
        conflictId,
      }),
    onSuccess: () => {
      onOpenChange(false)
      onActionSuccess()
    },
  })

  if (!conflict) return null

  const isPending = retryMutation.isPending || acceptMsMutation.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Conflict detail</SheetTitle>
          <SheetDescription>
            {conflict.taskTitle ? `Task: ${conflict.taskTitle}` : 'No associated task'}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 p-4">
          {/* Created at */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Created at</p>
            <p className="text-sm text-foreground">
              {new Date(conflict.createdAt).toLocaleString()}
            </p>
          </div>

          {/* Resource link */}
          {conflict.taskId && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Resource</p>
              <a
                href={`/planner/tasks/${conflict.taskId}`}
                className="inline-flex items-center gap-1.5 text-sm text-accent-foreground hover:underline"
              >
                {conflict.taskTitle ?? conflict.taskId}
                <ExternalLink className="size-3" />
              </a>
            </div>
          )}

          {/* Field name */}
          {conflict.field && conflict.kind !== 'push_403_quota' && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Field</p>
              <p className="font-mono text-sm text-foreground">{conflict.field}</p>
            </div>
          )}

          {/* Side-by-side values for field_lww */}
          {conflict.kind === 'field_lww' && (
            <div className="grid grid-cols-2 gap-3">
              <ValueDisplay label="Your change" value={conflict.mineValue} />
              <ValueDisplay label="Microsoft 365 change" value={conflict.theirsValue} />
            </div>
          )}

          {/* Raw error for non-field kinds */}
          {conflict.kind !== 'field_lww' && <RawErrorBlock rawError={conflict.rawError} />}

          {/* Special notes */}
          {conflict.kind === 'pull_unresolved_assignee' && (
            <p className="text-sm text-muted-foreground">
              Resolves automatically on next identity sync.
            </p>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 pt-2">
            {(conflict.kind === 'push_412_exhausted' || conflict.kind === 'push_failed') && (
              <>
                <Button
                  size="sm"
                  disabled={isPending}
                  onClick={() => retryMutation.mutate(conflict.id)}
                >
                  {retryMutation.isPending && <Spinner className="size-4" />}
                  Retry
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => acceptMsMutation.mutate(conflict.id)}
                >
                  {acceptMsMutation.isPending && <Spinner className="size-4" />}
                  Accept MS state
                </Button>
              </>
            )}

            {conflict.kind === 'push_403_quota' && (
              <>
                {conflict.taskId && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={`https://tasks.office.com/`} target="_blank" rel="noreferrer">
                      Open in MS
                      <ExternalLink className="ml-1.5 size-3" />
                    </a>
                  </Button>
                )}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button size="sm" disabled>
                          Retry
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Resolve the quota limit in Microsoft 365 first</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </>
            )}

            {conflict.kind === 'credential_invalidated' && (
              <Button size="sm" variant="outline" asChild>
                <a href="/integrations/microsoft">Reconnect</a>
              </Button>
            )}

            {conflict.kind === 'attachment_upload_failed' && (
              <Button
                size="sm"
                disabled={isPending}
                onClick={() => retryMutation.mutate(conflict.id)}
              >
                {retryMutation.isPending && <Spinner className="size-4" />}
                Retry upload
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
