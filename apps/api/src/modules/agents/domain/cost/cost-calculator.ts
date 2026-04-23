import type { CostBreakdown, Pricing, UsageTokens } from './cost-types'

const MTOK = 1_000_000

export class CostCalculator {
  compute(opts: { usage: UsageTokens; pricing: Pricing }): {
    costUsd: number
    breakdown: CostBreakdown
  } {
    const { usage, pricing } = opts

    const inputUncached = Math.max(0, (usage.inputUncached * pricing.inputUsdPerMtok) / MTOK)
    const inputCachedRead = Math.max(
      0,
      (usage.inputCachedRead * pricing.inputCachedReadUsdPerMtok) / MTOK,
    )
    const inputCachedWrite = Math.max(
      0,
      (usage.inputCachedWrite * pricing.inputCachedWriteUsdPerMtok) / MTOK,
    )
    const output = Math.max(0, (usage.output * pricing.outputUsdPerMtok) / MTOK)
    const outputReasoning = Math.max(
      0,
      (usage.outputReasoning * pricing.outputReasoningUsdPerMtok) / MTOK,
    )

    const total = inputUncached + inputCachedRead + inputCachedWrite + output + outputReasoning
    const costUsd = Math.round(total * 1_000_000) / 1_000_000

    return {
      costUsd,
      breakdown: { inputUncached, inputCachedRead, inputCachedWrite, output, outputReasoning },
    }
  }
}
