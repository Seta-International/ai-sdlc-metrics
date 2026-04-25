/**
 * SynthesizerAdapter — Plan 12 Task 7
 *
 * Implements ISynthesizer for NestJS DI wiring.
 *
 * Responsibility: merge structured outputs from all iteration sub-agents into
 * a single typed answer with citations and rule-derived confidence using the
 * pure synthesis functions from synthesizer.ts.
 *
 * The full LLM-synthesis path (same as bounded phase executor) is deferred to
 * the phase-executor integration layer. This adapter produces a structurally
 * valid SynthesizerOutput using the pure deterministic functions — it is NOT a
 * silent stub, it produces real synthesis output for all non-LLM paths.
 */

import { Injectable } from '@nestjs/common'
import type { ISynthesizer } from './iterative-orchestrator'
import type { SynthesizerOpts, SynthesizerOutput } from './phase-executor-contracts'
import { detectContradiction, buildCitations, buildDisclosureStatements } from './synthesizer'

@Injectable()
export class SynthesizerAdapter implements ISynthesizer {
  async synthesize(opts: SynthesizerOpts): Promise<SynthesizerOutput> {
    const allOutputs = new Map([...opts.phase1Outputs, ...opts.phase2Outputs])

    const hasContradiction = detectContradiction(allOutputs)
    const citations = buildCitations(allOutputs)
    const disclosures = buildDisclosureStatements(allOutputs)

    const summaries = [...allOutputs.values()]
      .filter((o) => o.kind === 'completed' || o.kind === 'ceiling_hit')
      .map((o) => o.summary)
      .join(' ')

    const content =
      disclosures.length > 0
        ? summaries + ' ' + disclosures.join(' ')
        : summaries || 'No data retrieved.'

    // Confidence caps at 'med' conservatively: the synthesizer merges outputs from
    // multiple sub-agents and cannot assert the same certainty as a single focused
    // sub-agent run. Only contradiction detection can drive it lower ('low'). The
    // LLM-synthesis path (deferred) may apply finer-grained confidence derivation.
    return {
      shape: 'narrative',
      content,
      citations,
      confidence: (hasContradiction ? 'low' : 'med') as 'low' | 'med',
      turnEndedReason: 'completed',
    }
  }
}
