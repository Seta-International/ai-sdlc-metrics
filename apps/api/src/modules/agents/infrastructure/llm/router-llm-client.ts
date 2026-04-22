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

/**
 * LLM token usage, mapped from Vercel AI SDK v6's `LanguageModelUsage`
 * (`inputTokens`/`outputTokens`/`totalTokens`) to our wrapper's canonical names.
 * Downstream code uses these names; they are stable regardless of SDK naming.
 * Values are `undefined` if the provider did not report usage.
 */
export interface RouterLlmUsage {
  promptTokens: number | undefined
  completionTokens: number | undefined
  totalTokens: number | undefined
}

export type RouterLlmResult =
  | { kind: 'ok'; plan: RouterPlan; usage: RouterLlmUsage }
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
        // systemPrompt is the router's top-level policy/persona prompt (high trust).
        // developerMessage is the constraints/format section (developer-level trust).
        // userMessage is the raw user utterance (user-level trust).
        // Vercel AI SDK v6 supports `system` + `messages` simultaneously.
        system: systemPrompt,
        messages: [
          // A second system-role message carries developer-level instructions.
          // OpenAI accepts multiple system messages in the array; the SDK v6
          // `ModelMessage` type includes `{ role: 'system', content: string }`.
          { role: 'system', content: developerMessage },
          { role: 'user', content: userMessage },
        ],
      })

      // SDK v6 `LanguageModelUsage` uses `inputTokens`/`outputTokens`/`totalTokens`.
      // We map to our canonical names so downstream code is SDK-agnostic.
      const usage: RouterLlmUsage = {
        promptTokens: result.usage.inputTokens,
        completionTokens: result.usage.outputTokens,
        totalTokens: result.usage.totalTokens,
      }

      return { kind: 'ok', plan: result.object, usage }
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
