'use client'

import { Spinner } from '@future/ui'
import { useMutation } from '@future/api-client'
import { AlertTriangle } from '@future/ui/icons'
import { useState } from 'react'
import { useDraftRow } from '../../hooks/use-draft-row'
import { useCanApproveDrafts } from '../../hooks/use-can-approve-drafts'
import { trpc } from '../../lib/trpc'
import { Mono } from '../../primitives/mono'
import { Tag } from '../../primitives/tag'
import { TinyBtn } from '../../primitives/tiny-btn'
import type { DraftPartArgs } from '../../runtime/agent-message-parts'
import { RejectReasonPicker, type RejectReason } from './reject-reason-picker'

type DraftStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'executed'
  | 'execution_failed'
  | 'cancelled'

const statusVariant: Record<DraftStatus, 'warning' | 'success' | 'danger' | 'default'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  expired: 'default',
  executed: 'success',
  execution_failed: 'danger',
  cancelled: 'default',
}

export type DraftCardProps = DraftPartArgs

export function DraftCard({ actionId, summary, provenance }: DraftCardProps) {
  const { data: row, isLoading } = useDraftRow(actionId)
  const canApprove = useCanApproveDrafts()
  const [showRejectPicker, setShowRejectPicker] = useState(false)

  const approveDraft = useMutation({
    mutationFn: ({ draftId }: { draftId: string }) =>
      trpc.agents.draftApproval.approve.mutate({ draftId }),
  })
  const rejectDraft = useMutation({
    mutationFn: (input: { draftId: string; reason: RejectReason; note?: string }) =>
      trpc.agents.draftApproval.reject.mutate(input),
  })

  const status = (row?.status ?? 'pending') as DraftStatus
  const isResolved = status !== 'pending'

  const handleReject = async (input: { reason: RejectReason; note?: string }) => {
    await rejectDraft.mutateAsync({
      draftId: actionId,
      reason: input.reason,
      ...(input.note ? { note: input.note } : {}),
    })
    setShowRejectPicker(false)
  }

  return (
    <div className="overflow-hidden rounded-md border border-amber-400/20 bg-gradient-to-b from-amber-400/[0.05] to-transparent">
      <div className="flex items-center gap-1.5 border-b border-white/[0.06] px-2 py-1.5">
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_0_3px_rgba(251,191,36,0.12)]"
        />
        <span className="text-xs font-semibold text-foreground">Draft · awaiting you</span>
        <Tag variant={statusVariant[status]}>{status}</Tag>
        <div className="flex-1" />
        <Mono>
          {provenance.sub_agent_domain}
          {row?.toolName ? `.${row.toolName.split('.').at(-1) ?? ''}` : ''}
        </Mono>
      </div>

      <div className="flex flex-col gap-2 px-2 py-2">
        <div className="text-sm leading-snug text-foreground">{summary}</div>

        {isLoading ? <div className="text-xs text-muted-foreground">Loading details...</div> : null}

        {row ? (
          <div className="grid grid-cols-[80px_1fr] gap-x-2 gap-y-0.5 text-xs">
            <Mono>tool</Mono>
            <Mono className="text-foreground">{row.toolName}</Mono>
            <Mono>tier</Mono>
            <Mono className="text-foreground">{row.tier}</Mono>
            <Mono>args</Mono>
            <pre className="m-0 whitespace-pre-wrap rounded-sm bg-black/30 p-1 text-xs text-foreground/80">
              {JSON.stringify(row.args, null, 2)}
            </pre>
          </div>
        ) : null}

        {row?.taintAtDraftTime ? (
          <div className="flex items-start gap-1.5 rounded-sm border border-amber-400/20 bg-amber-400/[0.06] px-2 py-1 text-xs text-amber-300">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>tainted at draft time</span>
          </div>
        ) : null}

        {row?.executionOutcomeNote && status === 'rejected' ? (
          <div className="text-xs text-muted-foreground">
            <span className="font-mono">note:</span> {row.executionOutcomeNote}
          </div>
        ) : null}
      </div>

      <div className="border-t border-white/[0.06] px-2 py-1.5">
        {isResolved ? (
          <div className="flex justify-end">
            <Tag variant={statusVariant[status]}>{status}</Tag>
          </div>
        ) : !canApprove ? (
          <div className="flex justify-end">
            <Tag>Sent for approval</Tag>
          </div>
        ) : showRejectPicker ? (
          <RejectReasonPicker
            onConfirm={handleReject}
            onCancel={() => setShowRejectPicker(false)}
          />
        ) : (
          <div className="flex items-center justify-end gap-1.5">
            <TinyBtn danger onClick={() => setShowRejectPicker(true)}>
              Reject
            </TinyBtn>
            <TinyBtn
              active
              disabled={approveDraft.isPending}
              onClick={() => approveDraft.mutateAsync({ draftId: actionId })}
            >
              {approveDraft.isPending ? <Spinner className="size-4" /> : null}
              {approveDraft.isPending ? 'Approving...' : 'Approve'}
            </TinyBtn>
          </div>
        )}
      </div>
    </div>
  )
}
