/**
 * RouterLlmClient — Plan 02 Task 9, Part C (Plan §5 "Router LLM call")
 *
 * Thin wrapper around Vercel AI SDK's `generateObject` that:
 *   1. Accepts a resolved `ModelChoice` + assembled prompt messages.
 *   2. Calls `generateObject` with `RouterPlanSchema` as the Zod schema.
 *   3. Returns either the validated RouterPlan or a `malformed` error so that
 *      the orchestrator (T10) can route to `RouterDecisionParser.parseRaw()`
 *      for retry semantics.
 *
 * Design decision — model resolution:
 *   The wrapper receives a CONCRETE `ModelChoice` (already resolved by T5's
 *   `SubAgentRegistry.resolveForSession`). It does NOT evaluate function-valued
 *   models. Keeping model resolution outside this wrapper ensures the orchestrator
 *   controls tenancy and model selection.
 *
 * OpenAI API key:
 *   Pulled from `process.env.OPENAI_API_KEY`. In production, the ECS task
 *   definition injects this value from AWS Secrets Manager via the `secrets`
 *   block in the ECS task definition JSON (Terraform-managed). Never hardcode.
 *   TODO (ops): ensure `OPENAI_API_KEY` is wired in the ECS task secret map.
 *
 * The `ROUTER_LLM_CLIENT` DI token is exported for injection into T10 orchestrator.
 */

import { Injectable } from '@nestjs/common'
import { generateObject } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { RouterPlanSchema } from '../../domain/value-objects/router-plan-schema'
import type { RouterPlan } from '../../domain/value-objects/router-plan-schema'
import type { ModelChoice } from '../../domain/services/sub-agent-types'

// ─── DI token ─────────────────────────────────────────────────────────────────

export const ROUTER_LLM_CLIENT = Symbol('ROUTER_LLM_CLIENT')

// ─── Input type ───────────────────────────────────────────────────────────────

export interface RouterLlmClientOpts {
  /** Concrete model choice, already resolved by T5's resolveForSession. */
  readonly model: ModelChoice
  /** Router system prompt (output of RouterPromptBuilder, T7). */
  readonly systemPrompt: string
  /** Developer message (persona/constraints section from T7). */
  readonly developerMessage: string
  /** The raw user utterance. */
  readonly userMessage: string
}

// ─── Result type ──────────────────────────────────────────────────────────────

export type RouterLlmResult =
  | { kind: 'ok'; plan: RouterPlan }
  | { kind: 'malformed'; error: Error; rawText: string | null }

// ─── RouterLlmClient ─────────────────────────────────────────────────────────

@Injectable()
export class RouterLlmClient {
  /**
   * Invokes `generateObject` with the assembled router messages and
   * `RouterPlanSchema` as the schema.
   *
   * On success: returns `{ kind: 'ok', plan }`.
   * On failure (model emits malformed JSON or schema-invalid output):
   *   returns `{ kind: 'malformed', error, rawText }`.
   *   `rawText` is null because `generateObject` does not expose the raw
   *   model text on error; the orchestrator should feed the retry prompt
   *   directly to a new `generate()` call.
   *
   * The wrapper catches ALL errors from `generateObject` so T10 never needs
   * to handle Vercel AI SDK internals directly.
   */
  async generate(opts: RouterLlmClientOpts): Promise<RouterLlmResult> {
    const { model, systemPrompt, developerMessage, userMessage } = opts

    try {
      // _resolveModel is inside the try block so that unsupported provider errors
      // are caught and returned as { kind: 'malformed' } rather than thrown.
      const languageModel = this._resolveModel(model)

      const result = await generateObject({
        model: languageModel,
        schema: RouterPlanSchema,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: developerMessage + '\n\n' + userMessage },
        ],
      })

      return { kind: 'ok', plan: result.object }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      return { kind: 'malformed', error, rawText: null }
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Resolves the `ModelChoice` to a Vercel AI SDK `LanguageModel`.
   *
   * Currently only 'openai' provider is supported. The `@ai-sdk/openai`
   * `createOpenAI` factory reads `OPENAI_API_KEY` from `process.env` by
   * default — no explicit key passing required here.
   *
   * Adding a new provider (e.g. 'anthropic') requires adding a new branch
   * and the corresponding `@ai-sdk/anthropic` package (Plan 12 scope).
   */
  private _resolveModel(modelChoice: ModelChoice) {
    switch (modelChoice.provider) {
      case 'openai': {
        const openaiClient = createOpenAI({
          // API key is injected from process.env.OPENAI_API_KEY by default.
          // Explicitly passing undefined ensures the default env-var lookup is used.
          apiKey: process.env['OPENAI_API_KEY'],
        })
        return openaiClient(modelChoice.model)
      }
      case 'anthropic': {
        // Anthropic provider support is deferred to Plan 12.
        throw new Error(
          `RouterLlmClient: provider "anthropic" is not yet supported. ` +
            `Add @ai-sdk/anthropic and wire it here when Plan 12 ships.`,
        )
      }
      default: {
        // Exhaustive check — TypeScript will catch this if ModelChoice gains a new provider.
        const _exhaustive: never = modelChoice.provider
        throw new Error(`RouterLlmClient: unknown model provider "${String(_exhaustive)}"`)
      }
    }
  }
}
