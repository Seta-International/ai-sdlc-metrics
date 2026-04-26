/**
 * SynthesizerLlmClient — Plan 17 PR 3 Task 9 (Plan 18 §1 amendment).
 *
 * Wraps Vercel AI SDK `streamObject` for the synthesizer's discriminated-union
 * output (Task 8 — `SynthesizerOutputSchema`). Returns a streaming primitive
 * that the synthesizer adapter (Task 11) consumes for per-shape token emission:
 *
 *   - `partialObjectStream` — async iterable of progressively-grown partials.
 *     Each emission is the FULL partial-so-far, not a delta. The adapter
 *     computes diffs to emit incremental `answer.token` events for narrative,
 *     short-answer, and list shapes; table/chart hold partials and emit one
 *     atomic JSON token at the end.
 *   - `finalObject` — schema-validated object once the stream completes.
 *     Rejects on schema-validation or stream failure (caller handles fallback).
 *   - `usage` — token totals once the stream completes.
 *
 * Plan 18 §1 reframes Plan 17's original `generateObject` design: the wrapper
 * MUST be streaming so the live turn pipeline can surface incremental tokens.
 *
 * Stream errors propagate via both `partialObjectStream` (next-pull throw) and
 * `finalObject` (rejection); the adapter (Task 11) is responsible for try/catch
 * around both.
 *
 * `OnModuleInit` boot validation + exhaustive provider switch mirror
 * `RouterLlmClient` and `OpenAiSubAgentLlmClient`.
 */

// OPENAI_API_KEY sourcing contract:
//   - In production (ECS Fargate): Terraform defines a Secrets Manager secret;
//     the ECS task definition maps the secret value into the container's
//     environment as OPENAI_API_KEY. The value never touches a committed file,
//     .env, DB, or build artifact.
//   - In local development: developer's shell exports OPENAI_API_KEY from a
//     secure source (1Password, AWS CLI session). NEVER commit a .env file
//     containing this key.

import { Injectable, OnModuleInit } from '@nestjs/common'
import { streamObject } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import type { ZodType } from 'zod'
import type { ModelChoice } from '../../domain/services/sub-agent-types'
import type { SubAgentUsage } from '../../application/services/phase-executor-contracts'
import type { SynthesizerLlmOutput } from '../../domain/value-objects/synthesizer-output-schema'
import { mapLanguageModelUsage, type LanguageModelUsageLike } from './usage'

// ─── DI token ─────────────────────────────────────────────────────────────────

export const SYNTHESIZER_LLM_CLIENT = Symbol('SYNTHESIZER_LLM_CLIENT')

// ─── Input + Result types ─────────────────────────────────────────────────────

export interface SynthesizerLlmClientOpts {
  readonly model: ModelChoice
  readonly system: string
  readonly userContext: string
  readonly schema: ZodType
  readonly abortSignal?: AbortSignal
}

/**
 * Streaming result handed to the synthesizer adapter (Task 11).
 *
 * - `partialObjectStream` yields progressively-grown partial objects. Each
 *   emission is the FULL partial-so-far, not a delta — adapter computes diffs
 *   to emit incremental `answer.token` events for narrative/short-answer/list
 *   shapes; table/chart hold partials and emit one atomic JSON token at the end.
 *
 *   Throws when consumed if the upstream stream errors; consumers must catch
 *   around the `for-await` loop. The same upstream error also rejects
 *   `finalObject`.
 * - `finalObject` resolves once the schema-validated object is complete; rejects
 *   on schema-validation or stream failure (caller handles fallback).
 * - `usage` resolves with token totals once the stream completes.
 */
export interface SynthesizerStreamResult {
  readonly partialObjectStream: AsyncIterable<Partial<SynthesizerLlmOutput>>
  readonly finalObject: Promise<SynthesizerLlmOutput>
  readonly usage: Promise<SubAgentUsage>
}

export interface SynthesizerLlmClient {
  synthesize(opts: SynthesizerLlmClientOpts): SynthesizerStreamResult
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveModel(choice: ModelChoice) {
  switch (choice.provider) {
    case 'openai': {
      const client = createOpenAI({ apiKey: process.env['OPENAI_API_KEY'] })
      return client(choice.model)
    }
    case 'anthropic': {
      // Anthropic provider support is deferred to Plan 12.
      throw new Error(
        `SynthesizerLlmClient: provider "anthropic" is not yet supported. ` +
          `Add @ai-sdk/anthropic and wire it here when Plan 12 ships.`,
      )
    }
    default: {
      // Exhaustive check — TypeScript will catch this if ModelChoice gains a new provider.
      const _exhaustive: never = choice.provider
      throw new Error(`SynthesizerLlmClient: unknown model provider "${String(_exhaustive)}"`)
    }
  }
}

// ─── OpenAiSynthesizerLlmClient ───────────────────────────────────────────────

@Injectable()
export class OpenAiSynthesizerLlmClient implements SynthesizerLlmClient, OnModuleInit {
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

  synthesize(opts: SynthesizerLlmClientOpts): SynthesizerStreamResult {
    const model = resolveModel(opts.model)

    // NOTE: `streamObject` is @deprecated in ai SDK ≥6 in favor of `streamText` with output settings.
    // Plan 18 §1 mandates streamObject for the partialObjectStream semantics; revisit when streamText reaches typed-schema parity.
    //
    // Cast is load-bearing: the SDK's `streamObject` input type is a deeply
    // nested intersection over `FlexibleSchema<unknown>` × output-mode unions,
    // so a generic `ZodType` opts.schema is not assignable without widening.
    // The cast narrows once the SDK exposes a covariant FlexibleSchema helper.
    const stream = streamObject({
      model,
      schema: opts.schema as never,
      system: opts.system,
      prompt: opts.userContext,
      maxRetries: 0,
      abortSignal: opts.abortSignal,
    } as Parameters<typeof streamObject>[0])

    return {
      partialObjectStream: stream.partialObjectStream as AsyncIterable<
        Partial<SynthesizerLlmOutput>
      >,
      finalObject: stream.object as Promise<SynthesizerLlmOutput>,
      usage: stream.usage.then((u) => mapLanguageModelUsage(u as LanguageModelUsageLike)),
    }
  }
}
