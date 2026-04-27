/**
 * synthesizer-prompt-builder — Plan 17 §4.4.
 *
 * Pure helpers used by SynthesizerAdapter to:
 *   - assemble the LLM userContext from per-sub-agent outputs
 *   - extract the expectedOutputShape from the directive (if pinned)
 *   - derive aggregate confidence from per-sub-agent confidences (rule-based, R-03.22)
 */

import type {
  Confidence,
  SubAgentKey,
  SubAgentOutput,
  AnswerShape,
} from './phase-executor-contracts'

export interface BuildSynthesizerPromptOpts {
  readonly allOutputs: ReadonlyMap<SubAgentKey, SubAgentOutput>
  readonly disclosures: ReadonlyArray<string>
  readonly hasContradiction: boolean
  readonly expectedShape: AnswerShape | null
  readonly userUtterance: string
}

export function buildSynthesizerPrompt(opts: BuildSynthesizerPromptOpts): string {
  const blocks: string[] = []
  blocks.push(`User utterance: ${JSON.stringify(opts.userUtterance)}`)

  if (opts.expectedShape) {
    blocks.push(`Expected output shape: "${opts.expectedShape}". Produce ONLY this shape.`)
  }

  for (const [key, output] of opts.allOutputs) {
    if (output.kind !== 'completed' && output.kind !== 'ceiling_hit') continue
    blocks.push(
      JSON.stringify({
        subAgentKey: key,
        summary: output.summary,
        semantics: output.semantics,
        confidence: output.confidence,
        structured: output.structured,
      }),
    )
  }

  if (opts.hasContradiction) {
    blocks.push(
      'NOTE: sub-agent outputs measure DIFFERENT things (different semantics). Use definitional clarity, never disagreement framing.',
    )
  }

  if (opts.disclosures.length > 0) {
    blocks.push('Disclosures (include verbatim in output):')
    for (const d of opts.disclosures) blocks.push(`- ${d}`)
  }

  return blocks.join('\n\n')
}

export function extractExpectedShape(directive: {
  expectedOutputShape?: AnswerShape | null
}): AnswerShape | null {
  return directive.expectedOutputShape ?? null
}

const ORDER: Record<Confidence, number> = { high: 2, med: 1, low: 0 }

export function deriveAggregateConfidence(
  outputs: ReadonlyMap<SubAgentKey, SubAgentOutput>,
): Confidence {
  let min: Confidence = 'high'
  let saw = false
  for (const o of outputs.values()) {
    if (o.kind !== 'completed' && o.kind !== 'ceiling_hit') continue
    saw = true
    if (ORDER[o.confidence] < ORDER[min]) min = o.confidence
  }
  return saw ? min : 'low'
}
