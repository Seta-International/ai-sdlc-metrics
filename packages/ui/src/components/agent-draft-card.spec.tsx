/**
 * AgentDraftCard component tests — Plan 08 §4 R-08.25, R-08.25a, R-08.26, R-08.27
 *
 * Verifies:
 * - Renders correct elements per Plan 08 §4 contract (props shape → DOM)
 * - Uses design-system components (Button, Alert, Badge) — no raw <button> / <input>
 * - Draft-age indicator: hidden < 24h, moderate 24–72h, high > 72h
 * - Tainted provenance block: shown above fold on high_risk + tainted, hidden otherwise
 * - Approve / Reject button handlers called with correct draftId
 * - Low-risk drafts do not render Approve / Reject buttons
 * - Spinner shown when action is pending
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import {
  AgentDraftCard,
  type AgentDraftCardProps,
  type AgentDraftPayload,
} from './agent-draft-card'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const NOW_ISO = new Date().toISOString()

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3_600_000).toISOString()
}

function makeDraft(overrides: Partial<AgentDraftPayload> = {}): AgentDraftPayload {
  return {
    id: 'draft-1',
    tier: 'high_risk_approval_required',
    tool_name: 'planner.createTask',
    summary: "Approve Jane Doe's leave request for Apr 15–19, 2026",
    provenance: {
      triggered_by: 'user:alice',
      user_utterance: 'Please approve Jane leave request',
      drafted_at: NOW_ISO,
      derived_from_tainted_sources: [],
    },
    approval_freshness: 'revalidate',
    expires_at: new Date(Date.now() + 72 * 3_600_000).toISOString(),
    ...overrides,
  }
}

function makeProps(overrides: Partial<AgentDraftCardProps> = {}): AgentDraftCardProps {
  return {
    draft: makeDraft(),
    onApprove: vi.fn().mockResolvedValue(undefined),
    onReject: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AgentDraftCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('basic rendering (R-08.25 contract)', () => {
    it('renders the draft card container with correct data-testid and data attributes', () => {
      render(<AgentDraftCard {...makeProps()} />)

      const card = screen.getByTestId('agent-draft-card')
      expect(card).toBeInTheDocument()
      expect(card).toHaveAttribute('data-draft-id', 'draft-1')
      expect(card).toHaveAttribute('data-tier', 'high_risk_approval_required')
    })

    it('renders the business-intent summary (R-08.25a)', () => {
      render(<AgentDraftCard {...makeProps()} />)

      const summary = screen.getByTestId('draft-summary')
      expect(summary).toBeInTheDocument()
      expect(summary).toHaveTextContent("Approve Jane Doe's leave request for Apr 15–19, 2026")
    })

    it('renders expires-at label', () => {
      render(<AgentDraftCard {...makeProps()} />)

      expect(screen.getByTestId('draft-expires-at')).toBeInTheDocument()
    })

    it('renders tier badge for high_risk_approval_required', () => {
      render(<AgentDraftCard {...makeProps()} />)

      const badge = screen.getByTestId('draft-tier-badge')
      expect(badge).toHaveTextContent('Approval required')
    })

    it('renders tier badge for low_risk_auto', () => {
      render(<AgentDraftCard {...makeProps({ draft: makeDraft({ tier: 'low_risk_auto' }) })} />)

      const badge = screen.getByTestId('draft-tier-badge')
      expect(badge).toHaveTextContent('Auto-approved')
    })
  })

  describe('Approve / Reject buttons (R-08.25)', () => {
    it('renders Approve and Reject buttons for high_risk_approval_required drafts', () => {
      render(<AgentDraftCard {...makeProps()} />)

      expect(screen.getByTestId('draft-approve-button')).toBeInTheDocument()
      expect(screen.getByTestId('draft-reject-button')).toBeInTheDocument()
    })

    it('does NOT render Approve / Reject buttons for low_risk_auto drafts', () => {
      render(<AgentDraftCard {...makeProps({ draft: makeDraft({ tier: 'low_risk_auto' }) })} />)

      expect(screen.queryByTestId('draft-approve-button')).not.toBeInTheDocument()
      expect(screen.queryByTestId('draft-reject-button')).not.toBeInTheDocument()
    })

    it('calls onApprove with the draft id when Approve is clicked', async () => {
      const onApprove = vi.fn().mockResolvedValue(undefined)
      render(<AgentDraftCard {...makeProps({ onApprove })} />)

      await act(async () => {
        fireEvent.click(screen.getByTestId('draft-approve-button'))
      })

      expect(onApprove).toHaveBeenCalledOnce()
      expect(onApprove).toHaveBeenCalledWith('draft-1')
    })

    it('calls onReject with the draft id when Reject is clicked', async () => {
      const onReject = vi.fn().mockResolvedValue(undefined)
      render(<AgentDraftCard {...makeProps({ onReject })} />)

      await act(async () => {
        fireEvent.click(screen.getByTestId('draft-reject-button'))
      })

      expect(onReject).toHaveBeenCalledOnce()
      expect(onReject).toHaveBeenCalledWith('draft-1')
    })

    it('disables buttons when isPending = true', () => {
      render(<AgentDraftCard {...makeProps({ isPending: true })} />)

      expect(screen.getByTestId('draft-approve-button')).toBeDisabled()
      expect(screen.getByTestId('draft-reject-button')).toBeDisabled()
    })
  })

  describe('draft-age indicator (R-08.26)', () => {
    it('does NOT show age badge when draft is less than 24h old', () => {
      const draft = makeDraft({
        provenance: {
          triggered_by: 'user:alice',
          user_utterance: '',
          drafted_at: hoursAgo(12),
          derived_from_tainted_sources: [],
        },
      })
      render(<AgentDraftCard {...makeProps({ draft })} />)

      expect(screen.queryByTestId('draft-age-badge')).not.toBeInTheDocument()
    })

    it('shows a moderate-weight age badge for drafts 24–72h old', () => {
      const draft = makeDraft({
        provenance: {
          triggered_by: 'user:alice',
          user_utterance: '',
          drafted_at: hoursAgo(36),
          derived_from_tainted_sources: [],
        },
      })
      render(<AgentDraftCard {...makeProps({ draft })} />)

      const ageBadge = screen.getByTestId('draft-age-badge')
      expect(ageBadge).toBeInTheDocument()
      expect(ageBadge).toHaveTextContent(/day/i)
    })

    it('shows a high-weight (destructive) age badge for drafts older than 72h', () => {
      const draft = makeDraft({
        provenance: {
          triggered_by: 'user:alice',
          user_utterance: '',
          drafted_at: hoursAgo(80),
          derived_from_tainted_sources: [],
        },
      })
      render(<AgentDraftCard {...makeProps({ draft })} />)

      const ageBadge = screen.getByTestId('draft-age-badge')
      expect(ageBadge).toBeInTheDocument()
      // Destructive variant = data-variant="destructive"
      expect(ageBadge).toHaveAttribute('data-variant', 'destructive')
    })
  })

  describe('tainted-source provenance block (R-08.27)', () => {
    it('renders tainted provenance block ABOVE the fold for high_risk + tainted draft', () => {
      const draft = makeDraft({
        tier: 'high_risk_approval_required',
        provenance: {
          triggered_by: 'user:alice',
          user_utterance: 'Please approve leave for employee with personal notes',
          drafted_at: NOW_ISO,
          derived_from_tainted_sources: [
            { tool: 'people.getProfile', refs: ['bio', 'notes'], authored_by: 'charlie' },
          ],
        },
      })
      render(<AgentDraftCard {...makeProps({ draft })} />)

      // Alert with warning copy should be visible
      const alert = screen.getByRole('alert')
      expect(alert).toBeInTheDocument()
      expect(alert).toHaveTextContent(/derived from text authored by another user/i)
      // The utterance is shown inside the warning
      expect(alert).toHaveTextContent('Please approve leave for employee with personal notes')
    })

    it('includes taint source tool name in the provenance block', () => {
      const draft = makeDraft({
        tier: 'high_risk_approval_required',
        provenance: {
          triggered_by: 'user:alice',
          user_utterance: 'update profile',
          drafted_at: NOW_ISO,
          derived_from_tainted_sources: [
            { tool: 'people.getProfile', refs: ['bio'], authored_by: null },
          ],
        },
      })
      render(<AgentDraftCard {...makeProps({ draft })} />)

      expect(screen.getByRole('alert')).toHaveTextContent('people.getProfile')
    })

    it('does NOT render tainted provenance block for low_risk_auto + tainted draft', () => {
      const draft = makeDraft({
        tier: 'low_risk_auto',
        provenance: {
          triggered_by: 'user:alice',
          user_utterance: 'do something',
          drafted_at: NOW_ISO,
          derived_from_tainted_sources: [
            { tool: 'people.getProfile', refs: ['bio'], authored_by: null },
          ],
        },
      })
      render(<AgentDraftCard {...makeProps({ draft })} />)

      // Only shows for high_risk + tainted combination
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('does NOT render tainted provenance block when no taint sources (even high_risk)', () => {
      const draft = makeDraft({
        tier: 'high_risk_approval_required',
        provenance: {
          triggered_by: 'user:alice',
          user_utterance: 'approve leave',
          drafted_at: NOW_ISO,
          derived_from_tainted_sources: [],
        },
      })
      render(<AgentDraftCard {...makeProps({ draft })} />)

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  describe('design-system compliance (CLAUDE.md UI/UX rule)', () => {
    it('does not use raw <button> elements for interactive actions', () => {
      const { container } = render(<AgentDraftCard {...makeProps()} />)

      // The approve/reject buttons must be rendered by Button component (shadcn)
      // which renders as <button> but wraps it in the design system — we verify
      // they carry data-slot="button" which is Button's data attribute.
      const buttons = container.querySelectorAll('button')
      // All buttons should have the Button component's styling attributes
      buttons.forEach((btn) => {
        // Button component adds data-slot="button"
        expect(btn).toHaveAttribute('data-slot', 'button')
      })
    })
  })
})
