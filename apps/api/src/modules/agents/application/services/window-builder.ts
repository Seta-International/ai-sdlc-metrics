/**
 * WindowBuilder — Plan 04 §4 "WindowBuilder (module boundary consumed by plan 02 router)"
 *
 * Builds γ (global) and α (inline) memory windows for the router prompt.
 *
 * γ window:
 *   - verbatim: last 3 user-turn summaries, delimiter-wrapped
 *   - compressed: last 10 summaries beyond the verbatim 3 (concat placeholder — nano summarizer wired in later)
 *   - rolling: concatenation of all available summaries updated when ≥3 turns exist
 *
 * α window:
 *   - verbatim: last N user-turn summaries (default 5), delimiter-wrapped
 *   - compressed: [] (α windows carry no compressed tier)
 *   - rolling: null (α windows carry no rolling summary)
 *
 * IMPORTANT: WindowBuilder NEVER invokes L3/L4/domain tools.
 * Router read surface is γ/α only.
 */

import type { ConversationMessageRepository } from '../../domain/repositories/conversation-message.repository'
import type { ConversationMessageEntity } from '../../domain/entities/conversation-message.entity'
import type {
  WindowedSummaries,
  VerbatimSummary,
} from '../../domain/value-objects/windowed-summaries'

// Rolling summary is computed only when ≥3 user turns with summaries exist.
const ROLLING_TURN_THRESHOLD = 3

// γ verbatim count.
const GAMMA_VERBATIM_COUNT = 3

// γ compressed count.
const GAMMA_COMPRESSED_COUNT = 10

// α verbatim count default.
const ALPHA_VERBATIM_DEFAULT = 5

// Delimiter tags wrapping every summary at inject time.
const SUMMARY_DELIMITER_OPEN = '<conversation_summary source="post_turn_nano">'
const SUMMARY_DELIMITER_CLOSE = '</conversation_summary>'

export type BuildGlobalOpts = {
  conversationId: string
  tenantId: string
  /**
   * Optional permission-scope field filter. When provided, any
   * field-key token found in the summary text that is NOT in this set will
   * be stripped. Field tokens are expected in the form `key=value` within
   * the raw summary string.
   */
  allowedFields?: Set<string>
}

export type BuildInlineOpts = {
  conversationId: string
  tenantId: string
  /** Number of verbatim summaries to include. Defaults to 5. */
  verbatimCount?: number
}

export class WindowBuilder {
  constructor(private readonly messageRepo: ConversationMessageRepository) {}

  /**
   * Build the γ (global) memory window.
   *
   * Fetches enough messages to populate verbatim (3) + compressed (10) tiers.
   * Applies delimiter wrapping and permission-scope filtering.
   */
  async buildGlobal(opts: BuildGlobalOpts): Promise<WindowedSummaries> {
    const { conversationId, tenantId, allowedFields } = opts

    // Fetch enough messages to fill verbatim + compressed tiers.
    // We need GAMMA_VERBATIM_COUNT + GAMMA_COMPRESSED_COUNT = 13 summaries at minimum,
    // but we fetch a generous limit to account for null-summary rows being skipped.
    const limit = (GAMMA_VERBATIM_COUNT + GAMMA_COMPRESSED_COUNT) * 3
    const rawMessages = await this.messageRepo.listForWindow({ conversationId, tenantId, limit })

    // Filter to messages that have a non-null summary (post-turn async summarization may not have run yet).
    const withSummary = rawMessages.filter(
      (m): m is ConversationMessageEntity & { summary: string } => m.summary !== null,
    )

    // listForWindow returns newest → oldest (DESC). Reverse to oldest → newest for slicing.
    const oldest = [...withSummary].reverse()

    // Verbatim: last GAMMA_VERBATIM_COUNT entries (newest).
    const verbatimRaw = oldest.slice(-GAMMA_VERBATIM_COUNT)

    // Compressed: the GAMMA_COMPRESSED_COUNT entries immediately before the verbatim slice.
    // Guard compressedEnd: when oldest.length < GAMMA_VERBATIM_COUNT the result would be
    // negative, causing slice(0, negative) to bleed into verbatim territory.
    const compressedEnd = Math.max(0, oldest.length - GAMMA_VERBATIM_COUNT)
    const compressedStart = Math.max(0, compressedEnd - GAMMA_COMPRESSED_COUNT)
    const compressedRaw = oldest.slice(compressedStart, compressedEnd)

    // Rolling: computed from ALL available summaries when ≥ ROLLING_TURN_THRESHOLD exist.
    const rolling =
      oldest.length >= ROLLING_TURN_THRESHOLD ? oldest.map((m) => m.summary).join(' ') : null

    const verbatim: VerbatimSummary[] = verbatimRaw.map((m) => ({
      turnTraceId: m.traceId,
      summary: this.wrapAndFilter(m.summary, allowedFields),
    }))

    // MVP compressed tier: concatenation placeholder.
    const compressed: string[] = compressedRaw.map((m) =>
      this.wrapAndFilter(m.summary, allowedFields),
    )

    return { verbatim, compressed, rolling }
  }

  /**
   * Build the α (inline) memory window.
   *
   * Simpler than γ: only verbatim entries, no compressed tier, no rolling summary.
   */
  async buildInline(opts: BuildInlineOpts): Promise<WindowedSummaries> {
    const { conversationId, tenantId } = opts
    const verbatimCount = opts.verbatimCount ?? ALPHA_VERBATIM_DEFAULT

    // Fetch a generous limit to account for null-summary rows.
    const limit = verbatimCount * 3
    const rawMessages = await this.messageRepo.listForWindow({ conversationId, tenantId, limit })

    const withSummary = rawMessages.filter(
      (m): m is ConversationMessageEntity & { summary: string } => m.summary !== null,
    )

    // listForWindow returns newest → oldest (DESC). Reverse to oldest → newest, then take last N.
    const oldest = [...withSummary].reverse()
    const verbatimRaw = oldest.slice(-verbatimCount)

    const verbatim: VerbatimSummary[] = verbatimRaw.map((m) => ({
      turnTraceId: m.traceId,
      summary: this.wrapAndFilter(m.summary, undefined),
    }))

    return { verbatim, compressed: [], rolling: null }
  }

  /**
   * Wrap a raw summary in delimiters and optionally apply
   * permission-scope field filtering.
   *
   * Field filtering strips `key=value` tokens where `key` is not in the
   * allowedFields set. This is an MVP approximation; a production implementation
   * would use structured field extraction aligned with the summary schema.
   */
  private wrapAndFilter(rawSummary: string, allowedFields?: Set<string>): string {
    let filtered = rawSummary

    if (allowedFields !== undefined) {
      // Strip key=value tokens whose key is not in the allowed set.
      filtered = filtered.replace(/\b(\w+)=\S+/g, (match, key: string) => {
        return allowedFields.has(key) ? match : ''
      })
      // Collapse multiple spaces produced by stripping.
      filtered = filtered.replace(/\s{2,}/g, ' ').trim()
    }

    return `${SUMMARY_DELIMITER_OPEN}${filtered}${SUMMARY_DELIMITER_CLOSE}`
  }
}
