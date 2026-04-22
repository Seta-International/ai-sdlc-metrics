/**
 * RouterPromptBuilder — Plan 02 Task 7 (R-02.12..R-02.16, R-02.24)
 *
 * Deterministically renders the router LLM's system prompt and developer
 * message from typed inputs only. The output is content-hashed; the hash is
 * pinned into `agent_session` by the orchestrator (T10) for replay determinism.
 *
 * R-02.14 — NO ADDENDUM INJECTION:
 *   The `build` method signature does NOT accept `additionalInstructions`,
 *   free-text addenda, or any other escape hatch. The system prompt is generated
 *   exclusively from the typed inputs listed in BuildOpts. Any caller wanting to
 *   customise the prompt must do so by changing typed inputs (e.g. sub-agent
 *   descriptors, permission narrative, role). This is a hard architectural rule
 *   that prevents prompt-injection vectors from sneaking in through a free-text
 *   back-door. Reference: Plan 02 §6 R-02.14.
 *
 * R-02.15 — DETERMINISTIC ASSEMBLY:
 *   Sub-agents are sorted lexicographically by key before rendering.
 *   JSON Schemas are emitted with sorted keys (via Zod v4's native
 *   `z.toJSONSchema()` + canonicalize). No Date.now(), Math.random(), request IDs, or any other
 *   non-deterministic value appears in the prompt body.
 *
 * R-02.16 — CONTENT-ONLY OUTPUT:
 *   This builder has no knowledge of `agent_session`. It returns the prompt
 *   strings + hash; the orchestrator (T10) is responsible for persisting the hash.
 */

import { Injectable } from '@nestjs/common'
import * as z from 'zod'
import { canonicalize } from '../../infrastructure/cache/canonical-args'
import type { ResolvedSubAgent } from '../../infrastructure/registry/sub-agent-registry'
import type { WindowedSummaries } from '../../domain/value-objects/windowed-summaries'
import { ROUTER_PLAN_JSON_SCHEMA_PLACEHOLDER } from '../../domain/value-objects/router-plan-schema'

// ─── DI token ─────────────────────────────────────────────────────────────────

export const ROUTER_PROMPT_BUILDER = Symbol('ROUTER_PROMPT_BUILDER')

// ─── Input / output types ──────────────────────────────────────────────────────

export interface BuildOpts {
  readonly tenantId: string
  readonly userId: string
  readonly surface: 'global-chat' | 'inline' | 'async'
  readonly roleKey: string
  readonly roleAllowedPermissions: ReadonlySet<string>
  readonly subAgents: ReadonlyArray<ResolvedSubAgent>
  /** Pre-rendered text from PermissionNarrativeBuilder.build().text (T6). */
  readonly permissionNarrative: string
  /** γ/α window — see WindowedSummaries stub (Plan 04 will extend). */
  readonly recentSummaryWindow: WindowedSummaries
  /** SHA-256 hex hash of the tool catalog; computed once, passed by orchestrator. */
  readonly toolCatalogHash: string
}

export interface BuildResult {
  readonly systemPrompt: string
  readonly developerMessage: string
  /** SHA-256 hex hash of { systemPrompt, developerMessage, toolCatalogHash }. */
  readonly routerPromptHash: string
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Convert a Zod schema to a JSON Schema object with sorted keys.
 *
 * Uses Zod v4's native `z.toJSONSchema()` for the conversion. The `~standard`
 * helper key injected by Zod v4 is dropped by `canonicalize`'s undefined-drop
 * rule. Keys are sorted by the canonicalize pass to guarantee deterministic output.
 */
function zodToSortedJsonSchema(schema: z.ZodType): Record<string, unknown> {
  // Zod v4's native JSON Schema emitter. `reused: 'inline'` prevents $ref
  // indirection for simple schemas, keeping the prompt self-contained.
  const raw = z.toJSONSchema(schema, { reused: 'inline' })

  // Drop the `~standard` runtime key injected by Zod — it's a function-valued
  // field that canonicalize would reject. We create a plain-object copy without it.
  const { ['~standard']: _drop, ...plainRaw } = raw as Record<string, unknown>

  // canonicalize returns a JSON string with sorted keys; re-parse to a plain object
  // so we can embed it in the prompt as structured data.
  const { canonical } = canonicalize(plainRaw)
  return JSON.parse(canonical) as Record<string, unknown>
}

/**
 * Render the sub-agent catalog section of the system prompt.
 *
 * Sub-agents MUST be sorted lexicographically by key before this is called
 * (the caller is responsible for sorting — enforced by renderSystemPrompt).
 */
function renderSubAgentCatalog(subAgents: ReadonlyArray<ResolvedSubAgent>): string {
  if (subAgents.length === 0) {
    return '(No sub-agents are available for this session.)'
  }

  return subAgents
    .map((sa) => {
      const { config } = sa
      const inputSchemaJson = zodToSortedJsonSchema(config.inputSchema)
      const outputSchemaJson = zodToSortedJsonSchema(config.outputSchema)

      return [
        `- key: ${config.key}`,
        `  domain: ${config.domain}`,
        `  description: ${config.description}`,
        `  whenToUse: ${config.whenToUse}`,
        `  inputSchema (JSON Schema): ${JSON.stringify(inputSchemaJson)}`,
        `  outputSchema (JSON Schema): ${JSON.stringify(outputSchemaJson)}`,
      ].join('\n')
    })
    .join('\n\n')
}

/**
 * Render the system prompt from typed inputs.
 * Sub-agents are sorted lex by key here to guarantee determinism (R-02.15).
 */
function renderSystemPrompt(subAgents: ReadonlyArray<ResolvedSubAgent>): string {
  // Sort lex by key — determinism invariant (R-02.15).
  const sorted = [...subAgents].sort((a, b) => {
    const ak = a.config.key as string
    const bk = b.config.key as string
    return ak < bk ? -1 : ak > bk ? 1 : 0
  })

  const catalog = renderSubAgentCatalog(sorted)
  const routerPlanSchema = JSON.stringify(
    JSON.parse(canonicalize(ROUTER_PLAN_JSON_SCHEMA_PLACEHOLDER).canonical),
  )

  return [
    '<role preamble>',
    'You are the router for Future, a multi-tenant business AaaS. Your sole job is to classify the',
    "user's utterance, emit a structured RouterPlan, and hand off to sub-agents. You do not write",
    'code, do not fabricate data, and do not compose free-form text beyond the plan object.',
    '',
    '<sub-agent catalog>',
    'Each entry below describes a sub-agent available for this session.',
    "Select sub-agents by their key. Match the user's intent to the most appropriate sub-agent(s).",
    '',
    catalog,
    '',
    '<output contract>',
    'Emit a RouterPlan JSON object matching the schema below. Do not wrap in markdown fences.',
    'Do not emit prose before or after the JSON object.',
    '',
    '<RouterPlanSchema JSONSchema>',
    routerPlanSchema,
  ].join('\n')
}

/**
 * Render the recent summary window section of the developer message.
 * Returns an empty string if both rolling is null and verbatim is empty.
 */
function renderSummaryWindow(window: WindowedSummaries): string {
  const lines: string[] = []

  if (window.rolling !== null) {
    lines.push(`Conversation-level summary: ${window.rolling}`)
  }

  if (window.verbatim.length > 0) {
    lines.push('Recent turns (newest last):')
    for (const entry of window.verbatim) {
      lines.push(`  - [turnTraceId: ${entry.turnTraceId}] ${entry.summary}`)
    }
  }

  return lines.join('\n')
}

/**
 * Render the developer message from turn-dynamic inputs.
 */
function renderDeveloperMessage(opts: BuildOpts): string {
  const { tenantId, roleKey, surface, permissionNarrative, recentSummaryWindow, toolCatalogHash } =
    opts

  const summarySection = renderSummaryWindow(recentSummaryWindow)

  const parts: string[] = [
    '<permission narrative>',
    permissionNarrative,
    '',
    '<tenant context>',
    `tenant_id = ${tenantId}`,
    `role = ${roleKey}`,
    `surface = ${surface}`,
  ]

  if (summarySection.length > 0) {
    parts.push('')
    parts.push('<recent summary window>')
    parts.push(summarySection)
  }

  parts.push(
    '',
    '<tool catalog hash>',
    `tool_catalog_hash = ${toolCatalogHash}`,
    '(This is a content pin. Sub-agents bind to tools matching this hash; deviation is a replay error.)',
    '',
    '<directive guidance>',
    'Classify the utterance into exactly one of the intents in the registry (or "unclassified").',
    'Stamp flow_id on every plan. Emit disambiguation only when the registry cannot cover the utterance.',
  )

  return parts.join('\n')
}

// ─── RouterPromptBuilder ──────────────────────────────────────────────────────

@Injectable()
export class RouterPromptBuilder {
  /**
   * Build the router LLM's system prompt + developer message from typed inputs.
   *
   * The returned `routerPromptHash` is a SHA-256 hex hash of the canonical
   * serialisation of `{ systemPrompt, developerMessage, toolCatalogHash }`.
   * tenantId is intentionally excluded from the hash — different tenants can
   * legitimately share a prompt hash when they happen to have identical role +
   * narrative + sub-agent subsets. tenantId is captured separately on the
   * `agent_session` row by the orchestrator (T10).
   *
   * R-02.14: this method does NOT accept additionalInstructions or any
   * free-text addendum — see file-level comment.
   */
  build(opts: BuildOpts): BuildResult {
    const systemPrompt = renderSystemPrompt(opts.subAgents)
    const developerMessage = renderDeveloperMessage(opts)

    // R-02.15 / R-02.24: every input to the hash passes through canonicalize
    // (sorted keys, UTC-normalised datetimes, undefined-drop).
    const { hash: routerPromptHash } = canonicalize({
      systemPrompt,
      developerMessage,
      toolCatalogHash: opts.toolCatalogHash,
    })

    return { systemPrompt, developerMessage, routerPromptHash }
  }
}
