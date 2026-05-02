/**
 * Called after each supervisor-loop iteration to decide whether to continue or
 * exit. Sends a prompt to the router LLM (same OpenAI model as the router)
 * containing:
 *   - The original user utterance
 *   - The completion criteria hint (CompletionSpec.hintToRouter)
 *   - The prior iteration summary and scorer results
 *   - Whether the last iteration was complete
 *
 * Parse-retry semantics:
 *   - On first LLM/parse failure: retry once with an error-correction prompt.
 *   - On second failure: return { kind: 'exit', reason: 'disambiguation',
 *     disambiguationQuestion: 'Unable to determine next step.' }
 *
 * Design notes:
 *   - Uses a dedicated Zod schema (ReplanDecisionSchema) separate from RouterPlanSchema.
 *   - Calls generateObject from the Vercel AI SDK directly because
 *     RouterLlmClient.generate() is locked to RouterPlanSchema.
 *   - Model and API key are resolved from process.env (same contract as RouterLlmClient).
 *   - Sequential awaits only; no Promise.all.
 */

import { Injectable, OnModuleInit } from '@nestjs/common'
import { generateObject } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import * as z from 'zod'
import type { SubAgentDirective } from '../../domain/value-objects/router-plan-schema'
import type {
  CompletionSpec,
  IterationRecord,
  PhaseExecutorTurnState,
} from './phase-executor-contracts'
import { recordReplanLlmCallTotal } from '../../infrastructure/observability/gateway-metrics'

export type ReplanResult =
  | { kind: 'continue'; nextDirective: SubAgentDirective }
  | {
      kind: 'exit'
      reason: 'complete' | 'stuck' | 'disambiguation'
      disambiguationQuestion?: string
    }

export interface ReplanOpts {
  readonly turnState: PhaseExecutorTurnState
  readonly priorIteration: IterationRecord
  /**
   * Full ordered history of completed iterations (excluding the current
   * `priorIteration`). The user-message builder caps this to the last 5
   * entries to prevent prompt bloat.
   */
  readonly iterationHistory: IterationRecord[]
  readonly completionCriteria: CompletionSpec
  readonly userUtterance: string
  readonly abortSignal: AbortSignal
  /**
   * Tenant ID for metric recording.
   * Optional — if omitted, replan LLM call metrics are skipped.
   */
  readonly tenantId?: string
}

/**
 * Discriminated union emitted by the router LLM for replan decisions.
 *
 * `continue` → dispatch a new sub-agent with the given key, input, and reason.
 * `exit`     → terminate the loop with a reason code.
 */
const ReplanDecisionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('continue'),
    next_sub_agent_key: z.string().min(1),
    next_reason: z.string().min(1),
    next_input: z.record(z.string(), z.unknown()),
  }),
  z.object({
    action: z.literal('exit'),
    exit_reason: z.enum(['complete', 'stuck', 'disambiguation']),
    disambiguation_question: z.string().min(1).optional(),
  }),
])

type ReplanDecision = z.infer<typeof ReplanDecisionSchema>

/**
 * Fallback message surfaced to the user when both LLM attempts fail to produce
 * a valid replan decision. Exported so tests reference the same string without
 * risk of silent drift between implementation and assertions.
 */
export const FALLBACK_DISAMBIGUATION_MESSAGE = 'Unable to determine next step.'

@Injectable()
export class IterativeRePlanner implements OnModuleInit {
  /**
   * Validates that OPENAI_API_KEY is present in the environment.
   * Called once at module init (NestJS lifecycle hook) so the failure is loud
   * and immediate at boot rather than silently failing on the first request.
   *
   * Per the sourcing contract: the key originates in AWS Secrets Manager;
   * Terraform/ECS maps it into the container environment. It must never appear
   * in a committed file, .env, DB, or build artifact.
   */
  onModuleInit(): void {
    if (!process.env['OPENAI_API_KEY'] && !process.env['LOCAL_DEV']) {
      throw new Error(
        'OPENAI_API_KEY missing — required to be provided via ECS Secrets Manager mapping per CLAUDE.md secrets rule',
      )
    }
  }

  /**
   * Decides whether the supervisor loop should continue or exit after
   * `priorIteration` completes.
   *
   * Calls the router LLM once. On parse failure retries once with an error-
   * correction prompt. On second failure returns the fallback exit result.
   */
  async replan(opts: ReplanOpts): Promise<ReplanResult> {
    const {
      priorIteration,
      iterationHistory,
      completionCriteria,
      userUtterance,
      abortSignal,
      tenantId,
    } = opts

    const systemPrompt = _buildSystemPrompt(completionCriteria)
    const userMessage = _buildUserMessage(userUtterance, priorIteration, iterationHistory)

    const firstDecision = await _callLlm(systemPrompt, userMessage, abortSignal)
    if (firstDecision.kind === 'ok') {
      const result = _toReplanResult(firstDecision.decision)
      _safeRecordReplanMetric(tenantId, result)
      return result
    }

    // Error-correction retry.
    const correctionMessage = _buildCorrectionMessage(userMessage, firstDecision.error)
    const secondDecision = await _callLlm(systemPrompt, correctionMessage, abortSignal)
    if (secondDecision.kind === 'ok') {
      const result = _toReplanResult(secondDecision.decision)
      _safeRecordReplanMetric(tenantId, result)
      return result
    }

    // Both attempts failed — surface as disambiguation
    if (tenantId) {
      try {
        recordReplanLlmCallTotal(tenantId, 'parse_error')
      } catch {
        // Metric emission must never fail a user turn
      }
    }
    return {
      kind: 'exit',
      reason: 'disambiguation',
      disambiguationQuestion: FALLBACK_DISAMBIGUATION_MESSAGE,
    }
  }
}

type LlmCallResult = { kind: 'ok'; decision: ReplanDecision } | { kind: 'error'; error: string }

/**
 * Calls the router LLM with a configurable OpenAI model and parses the response
 * via ReplanDecisionSchema. Returns `{ kind: 'error' }` on any failure so the
 * caller can apply retry logic without throwing.
 *
 * Model: resolved from process.env.OPENAI_REPLAN_MODEL (defaults to 'gpt-5.4').
 * Configure via ECS task-definition environment to switch models without a
 * code change — same contract as OPENAI_API_KEY injection.
 *
 * API key: sourced from process.env.OPENAI_API_KEY exactly as RouterLlmClient
 * does — injected at runtime by ECS Secrets Manager mapping.
 */
async function _callLlm(
  systemPrompt: string,
  userMessage: string,
  abortSignal: AbortSignal,
): Promise<LlmCallResult> {
  try {
    const openai = createOpenAI({ apiKey: process.env['OPENAI_API_KEY'] })
    const modelName = process.env['OPENAI_REPLAN_MODEL'] ?? 'gpt-5.4'
    const model = openai(modelName)

    const result = await generateObject({
      model,
      schema: ReplanDecisionSchema,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      abortSignal,
    })

    return { kind: 'ok', decision: result.object }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { kind: 'error', error: message }
  }
}

/**
 * Builds the system prompt for the iterative replan LLM call.
 *
 * Contains the completion-criteria hint so the model understands what "done"
 * means for this specific task.
 */
function _buildSystemPrompt(completionCriteria: CompletionSpec): string {
  return (
    `You are a supervisor agent deciding whether an iterative task loop should continue or exit.\n\n` +
    `Completion criteria: ${completionCriteria.hintToRouter}\n\n` +
    `You MUST respond with a JSON object matching the following discriminated union:\n` +
    `  { "action": "continue", "next_sub_agent_key": "<key>", "next_reason": "<why>", "next_input": { ... } }\n` +
    `  { "action": "exit", "exit_reason": "complete" | "stuck" | "disambiguation", "disambiguation_question": "<optional>" }\n\n` +
    `Choose "continue" when more work is needed to meet the completion criteria.\n` +
    `Choose "exit" with reason "complete" when the criteria are fully met.\n` +
    `Choose "exit" with reason "stuck" when further iterations cannot make progress.\n` +
    `Choose "exit" with reason "disambiguation" when you need clarification from the user.\n` +
    `Emit only a JSON object. No markdown fences, no prose before or after.`
  )
}

/**
 * Builds the user message summarising the iteration history and prior
 * iteration, then asks for a replan decision.
 *
 * History is capped to the last 5 entries to prevent prompt bloat. Each entry
 * includes the iteration number, sub-agent key, completion status, and a
 * truncated summary (~200 chars).
 */
function _buildUserMessage(
  userUtterance: string,
  priorIteration: IterationRecord,
  iterationHistory: IterationRecord[],
): string {
  const HISTORY_CAP = 5
  const SUMMARY_MAX = 200

  const historySection =
    iterationHistory.length === 0
      ? ''
      : (() => {
          const capped = iterationHistory.slice(-HISTORY_CAP)
          const lines = capped.map((rec) => {
            const summary =
              rec.output.summary.length > SUMMARY_MAX
                ? rec.output.summary.slice(0, SUMMARY_MAX) + '…'
                : rec.output.summary
            return (
              `  Iteration ${rec.iterationNumber}: sub-agent=${rec.subAgentKey}, ` +
              `complete=${rec.isComplete}, summary="${summary}"`
            )
          })
          return `Iteration history (last ${capped.length}):\n${lines.join('\n')}\n\n`
        })()

  const scorerSummary = priorIteration.scorerResults
    .map((r) => `  - score=${r.score}, passed=${r.passed}, reason=${r.reason}`)
    .join('\n')

  return (
    `Original user request: ${userUtterance}\n\n` +
    historySection +
    `Iteration ${priorIteration.iterationNumber} results:\n` +
    `  Sub-agent: ${priorIteration.subAgentKey}\n` +
    `  Summary: ${priorIteration.output.summary}\n` +
    `  Completion scorers:\n${scorerSummary}\n` +
    `  Is complete: ${priorIteration.isComplete}\n\n` +
    `Given the above, what should happen next?`
  )
}

/**
 * Builds the error-correction user message for the second LLM attempt.
 *
 * Includes the original user message and the failure reason so the model
 * understands exactly what went wrong with the previous response.
 */
function _buildCorrectionMessage(originalUserMessage: string, errorMessage: string): string {
  return (
    `Your previous response did not match the required schema.\n` +
    `Reason the last output failed: ${errorMessage}\n\n` +
    `Please try again. Original context:\n${originalUserMessage}\n\n` +
    `Emit only a JSON object matching the schema. No markdown fences, no prose before or after.`
  )
}

/**
 * Maps a validated ReplanDecision to a ReplanResult.
 */
function _toReplanResult(decision: ReplanDecision): ReplanResult {
  if (decision.action === 'continue') {
    const nextDirective: SubAgentDirective = {
      sub_agent_key: decision.next_sub_agent_key,
      input: decision.next_input,
      reason: decision.next_reason,
    }
    return { kind: 'continue', nextDirective }
  }

  return {
    kind: 'exit',
    reason: decision.exit_reason,
    disambiguationQuestion: decision.disambiguation_question,
  }
}

/**
 * Records the replan LLM call outcome metric.
 * Swallows errors — metric emission must never fail a user turn.
 */
function _safeRecordReplanMetric(tenantId: string | undefined, result: ReplanResult): void {
  if (!tenantId) return

  const outcome =
    result.kind === 'continue'
      ? 'continue'
      : result.reason === 'complete'
        ? 'exit_complete'
        : result.reason === 'stuck'
          ? 'exit_stuck'
          : 'exit_disambiguation'

  try {
    recordReplanLlmCallTotal(tenantId, outcome)
  } catch {
    // Metric emission must never fail a user turn
  }
}
