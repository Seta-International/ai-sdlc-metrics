'use client'

/**
 * AgentDraftCard — Plan 08 §4 "ApprovalCardPresenter"
 *
 * THE only rendering path for agent draft cards in the UI (R-08.25).
 * Downstream UIs import and render this component — they do NOT inline-render
 * draft payload. Rendering logic (provenance block, taint warning, age indicator)
 * lives here so it cannot be "forgotten" by callers.
 *
 * Props contract matches Plan 08 §4 `<AgentDraftCard>` interface.
 */

import * as React from 'react'
import { AlertTriangle, Clock } from 'lucide-react'
import { cn } from '../lib/utils'
import { Button } from './ui/button'
import { Alert, AlertDescription } from './ui/alert'
import { Badge } from './ui/badge'
import { Spinner } from './ui/spinner'

// ─── Types ────────────────────────────────────────────────────────────────────

export type DraftTier = 'low_risk_auto' | 'high_risk_approval_required'

export type TaintedSource = {
  readonly tool: string
  readonly refs: ReadonlyArray<string>
  readonly authored_by: string | null
}

export type DraftProvenancePayload = {
  readonly triggered_by: string
  /**
   * The user utterance that triggered this draft. Sanitized via project_to_schema
   * when the approver differs from the initiator (R-08.24).
   */
  readonly user_utterance: string
  readonly drafted_at: string // ISO 8601
  readonly derived_from_tainted_sources: ReadonlyArray<TaintedSource>
}

export type AgentDraftPayload = {
  readonly id: string
  readonly tier: DraftTier
  readonly tool_name: string
  /**
   * Business-intent language summary (R-08.25a). Human-readable description
   * of the draft action. Never raw args or technical jargon.
   * Example: "Approve Jane Doe's leave request for Apr 15–19, 2026"
   */
  readonly summary: string
  readonly provenance: DraftProvenancePayload
  readonly approval_freshness: 'revalidate' | 'accept-stale'
  readonly expires_at: string // ISO 8601
}

export interface AgentDraftCardProps {
  draft: AgentDraftPayload
  onApprove: (draftId: string) => void | Promise<void>
  onReject: (draftId: string) => void | Promise<void>
  /**
   * Whether the approve/reject buttons are in a pending (loading) state.
   * When true, both buttons are disabled and a spinner is shown on the active one.
   */
  isPending?: boolean
  className?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Compute the age of a draft from its drafted_at timestamp.
 * Returns the age in hours (fractional).
 */
function computeDraftAgeHours(draftedAt: string): number {
  const draftedAtMs = new Date(draftedAt).getTime()
  if (isNaN(draftedAtMs)) return 0
  return (Date.now() - draftedAtMs) / 3_600_000
}

/**
 * Determine the visual weight for the draft-age indicator (R-08.26).
 * - < 24h: no indicator shown
 * - 24h–72h: 'moderate' weight (warning badge)
 * - > 72h: 'high' weight (destructive badge — draft may expire soon)
 */
function draftAgeIndicatorWeight(ageHours: number): 'none' | 'moderate' | 'high' {
  if (ageHours < 24) return 'none'
  if (ageHours < 72) return 'moderate'
  return 'high'
}

function formatAgeLabel(ageHours: number): string {
  if (ageHours < 24) return ''
  const days = Math.floor(ageHours / 24)
  if (days === 1) return '1 day old'
  return `${days} days old`
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/**
 * Tainted-source provenance block (R-08.27).
 * Renders ABOVE the fold with warning styling on high-risk tainted drafts.
 * Warning copy: "This draft was derived from text authored by another user
 * while you asked: '<utterance>'."
 */
function TaintedProvenanceBlock({
  provenance,
}: {
  provenance: DraftProvenancePayload
}): React.ReactElement {
  const { derived_from_tainted_sources, user_utterance } = provenance

  return (
    <Alert variant="destructive" className="mb-4">
      <AlertTriangle className="size-4" />
      <AlertDescription>
        <p className="mb-1 font-510">
          This draft was derived from text authored by another user while you asked:{' '}
          {user_utterance ? (
            <span className="italic">&ldquo;{user_utterance}&rdquo;</span>
          ) : (
            <span className="text-muted-foreground">(utterance not available)</span>
          )}
        </p>
        {derived_from_tainted_sources.length > 0 && (
          <ul className="mt-1 list-inside list-disc text-xs">
            {derived_from_tainted_sources.map((src, i) => (
              <li key={`${src.tool}-${i}`}>
                <span className="font-mono">{src.tool}</span>
                {src.refs.length > 0 && (
                  <>
                    {' — '}
                    <span className="text-muted-foreground">{src.refs.join(', ')}</span>
                  </>
                )}
                {src.authored_by !== null && (
                  <span className="ml-1 text-muted-foreground">by {src.authored_by}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </AlertDescription>
    </Alert>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * AgentDraftCard — approval card for agent-proposed write drafts.
 *
 * Rendering contract (R-08.25, R-08.25a, R-08.26, R-08.27):
 * - Summary is business-intent language, never raw args.
 * - Draft-age indicator renders past 24h; increasing visual weight past 72h.
 * - Tainted-source provenance renders ABOVE the fold with warning styling on
 *   high-risk drafts when `derived_from_tainted_sources.length > 0`.
 * - Approve / Reject buttons delegate to props handlers — no internal state machine.
 */
export function AgentDraftCard({
  draft,
  onApprove,
  onReject,
  isPending = false,
  className,
}: AgentDraftCardProps): React.ReactElement {
  const { id, tier, summary, provenance, expires_at } = draft

  const ageHours = computeDraftAgeHours(provenance.drafted_at)
  const ageWeight = draftAgeIndicatorWeight(ageHours)
  const ageLabel = formatAgeLabel(ageHours)
  const isTainted = provenance.derived_from_tainted_sources.length > 0
  const isHighRisk = tier === 'high_risk_approval_required'
  const showTaintWarning = isTainted && isHighRisk

  const [activeAction, setActiveAction] = React.useState<'approve' | 'reject' | null>(null)

  const handleApprove = async () => {
    if (isPending) return
    setActiveAction('approve')
    try {
      await onApprove(id)
    } finally {
      setActiveAction(null)
    }
  }

  const handleReject = async () => {
    if (isPending) return
    setActiveAction('reject')
    try {
      await onReject(id)
    } finally {
      setActiveAction(null)
    }
  }

  return (
    <div
      data-testid="agent-draft-card"
      data-draft-id={id}
      data-tier={tier}
      className={cn('flex flex-col rounded-lg border border-border bg-card p-4', className)}
    >
      {/* Tainted provenance block — ABOVE the fold, warning styling (R-08.27) */}
      {showTaintWarning && <TaintedProvenanceBlock provenance={provenance} />}

      {/* Draft header row */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Tier badge */}
          <Badge variant={isHighRisk ? 'warning' : 'default'} data-testid="draft-tier-badge">
            {isHighRisk ? 'Approval required' : 'Auto-approved'}
          </Badge>

          {/* Draft-age indicator (R-08.26) */}
          {ageWeight !== 'none' && (
            <Badge
              variant={ageWeight === 'high' ? 'destructive' : 'warning'}
              data-testid="draft-age-badge"
            >
              <Clock className="size-3" />
              {ageLabel}
            </Badge>
          )}
        </div>

        {/* Expires-at note */}
        <span className="shrink-0 text-xs text-muted-foreground" data-testid="draft-expires-at">
          Expires {new Date(expires_at).toLocaleDateString()}
        </span>
      </div>

      {/* Summary — business-intent language (R-08.25a) */}
      <p className="mb-4 text-sm font-510 text-foreground" data-testid="draft-summary">
        {summary}
      </p>

      {/* Action buttons */}
      {isHighRisk && (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="default"
            disabled={isPending || activeAction !== null}
            onClick={handleApprove}
            data-testid="draft-approve-button"
          >
            {activeAction === 'approve' && <Spinner className="size-4" />}
            Approve
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={isPending || activeAction !== null}
            onClick={handleReject}
            data-testid="draft-reject-button"
          >
            {activeAction === 'reject' && <Spinner className="size-4" />}
            Reject
          </Button>
        </div>
      )}
    </div>
  )
}
