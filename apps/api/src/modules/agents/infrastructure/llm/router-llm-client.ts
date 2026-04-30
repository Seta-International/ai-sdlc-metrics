/**
 * Thin wrapper around Vercel AI SDK's `generateObject` that:
 *   1. Accepts a resolved `ModelChoice` + assembled prompt messages.
 *   2. Calls `generateObject` with `RouterPlanSchema` as the Zod schema.
 *   3. Returns either the validated RouterPlan or a `malformed` error so that
 *      the orchestrator can route to `RouterDecisionParser.parseRaw()` for
 *      retry semantics.
 *
 * Model resolution: the wrapper receives a CONCRETE `ModelChoice` (already
 * resolved by `SubAgentRegistry.resolveForSession`). It does NOT evaluate
 * function-valued models. Keeping model resolution outside this wrapper
 * ensures the orchestrator controls tenancy and model selection.
 */

// OPENAI_API_KEY sourcing contract:
//   - In production (ECS Fargate): Terraform defines a Secrets Manager secret;
//     the ECS task definition maps the secret value into the container's
//     environment as OPENAI_API_KEY. The value never touches a committed file,
//     .env, DB, or build artifact.
//   - In local development: developer's shell exports OPENAI_API_KEY from a
//     secure source (1Password, AWS CLI session). NEVER commit a .env file
//     containing this key.
//   - CLAUDE.md rule enforced: no secret in env files, DB, or hardcoded.

import { Injectable, OnModuleInit } from '@nestjs/common'
import { generateObject } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { RouterPlanSchema } from '../../domain/value-objects/router-plan-schema'
import type { RouterPlan } from '../../domain/value-objects/router-plan-schema'
import type { ModelChoice } from '../../domain/services/sub-agent-types'
import { ROUTER_LLM_TIMEOUT_MS } from '../../application/services/router-budget'

export const ROUTER_LLM_CLIENT = Symbol('ROUTER_LLM_CLIENT')

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

@Injectable()
export class RouterLlmClient implements OnModuleInit {
  /**
   * Validates that OPENAI_API_KEY is present in the environment.
   * Called once at module init (NestJS lifecycle hook) so the failure is loud
   * and immediate at boot rather than silently failing on the first request.
   *
   * Per the sourcing contract above: the key originates in AWS Secrets Manager;
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
   * Invokes `generateObject` with the assembled router messages and
   * `RouterPlanSchema` as the schema.
   *
   * On success: returns `{ kind: 'ok', plan }`.
   * On failure (model emits malformed JSON, schema-invalid output, or timeout):
   *   returns `{ kind: 'malformed', error, rawText }`.
   *   `rawText` is null because `generateObject` does not expose the raw
   *   model text on error; the orchestrator should feed the retry prompt
   *   directly to a new `generate()` call.
   *
   * Timeout: an AbortController fires after ROUTER_LLM_TIMEOUT_MS (default 30 s).
   * On abort the error message contains "aborted" / "timeout" so upstream logs
   * can distinguish this from JSON parse failures.
   *
   * The wrapper catches ALL errors from `generateObject` so T10 never needs
   * to handle Vercel AI SDK internals directly.
   */
  async generate(opts: RouterLlmClientOpts): Promise<RouterLlmResult> {
    const { model, systemPrompt, developerMessage, userMessage } = opts

    const controller = new AbortController()
    const timeoutHandle = setTimeout(() => {
      controller.abort(
        new Error(`RouterLlmClient: LLM call timed out after ${ROUTER_LLM_TIMEOUT_MS}ms (aborted)`),
      )
    }, ROUTER_LLM_TIMEOUT_MS)

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
        abortSignal: controller.signal,
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
      // Normalize the error. If the request was aborted (timeout or external abort),
      // ensure the message contains a recognizable "timeout"/"aborted" marker so
      // upstream logs can distinguish this from schema / JSON parse failures.
      let error: Error
      if (err instanceof Error) {
        if (
          controller.signal.aborted &&
          !err.message.includes('aborted') &&
          !err.message.includes('timeout')
        ) {
          error = new Error(
            `RouterLlmClient: LLM call aborted/timeout after ${ROUTER_LLM_TIMEOUT_MS}ms — ${err.message}`,
          )
        } else {
          error = err
        }
      } else {
        error = new Error(String(err))
      }
      return { kind: 'malformed', error, rawText: null }
    } finally {
      clearTimeout(timeoutHandle)
    }
  }

  /**
   * Resolves the `ModelChoice` to a Vercel AI SDK `LanguageModel`.
   *
   * Currently only 'openai' provider is supported. The `@ai-sdk/openai`
   * `createOpenAI` factory reads `OPENAI_API_KEY` from `process.env` by
   * default — no explicit key passing required here.
   *
   * Adding a new provider (e.g. 'anthropic') requires adding a new branch
   * and the corresponding `@ai-sdk/anthropic` package.
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
        // Anthropic provider support is deferred.
        throw new Error(
          `RouterLlmClient: provider "anthropic" is not yet supported. ` +
            `Add @ai-sdk/anthropic and wire it here.`,
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
