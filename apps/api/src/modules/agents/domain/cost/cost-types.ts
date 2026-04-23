export type Pricing = {
  pricingId: string
  modelId: string
  inputUsdPerMtok: number
  inputCachedReadUsdPerMtok: number
  inputCachedWriteUsdPerMtok: number
  outputUsdPerMtok: number
  outputReasoningUsdPerMtok: number
  effectiveFrom: Date
}

export type UsageTokens = {
  inputUncached: number
  inputCachedRead: number
  inputCachedWrite: number
  output: number
  outputReasoning: number
}

export const EMPTY_USAGE: UsageTokens = {
  inputUncached: 0,
  inputCachedRead: 0,
  inputCachedWrite: 0,
  output: 0,
  outputReasoning: 0,
}

export type CostBreakdown = {
  inputUncached: number
  inputCachedRead: number
  inputCachedWrite: number
  output: number
  outputReasoning: number
}

export type VendorErrorClass =
  | 'vendor_rate_limit'
  | 'vendor_overload'
  | 'vendor_server_error'
  | 'vendor_timeout'
  | 'vendor_invalid_response'

export type VendorError = {
  class: VendorErrorClass
  retryAfterMs?: number
  resetAt?: Date
  vendorMessage?: string
}

// Ladder step trace tags
export type LadderTraceTag =
  | 'provider_retry'
  | 'provider_fallback'
  | 'provider_outage'
  | 'tier_shift'
  | 'refused'

// Ladder trigger types
export type LadderTrigger =
  | 'provider_5xx'
  | 'provider_timeout'
  | 'nano_5xx'
  | 'canary_degraded_primary'
  | 'canary_degraded_both'
  | 'canary_collapse'
  | 'budget_exhausted'

// Per-step state shape
export type LadderStepState = {
  step: 1 | 2 | 3 | 4 | 5 | 6 | 7
  trigger: LadderTrigger
  userMessage: string
  traceTag: LadderTraceTag
  cancellationReason?: 'quality_canary' | 'budget'
}

// ProviderFallback discriminator (on cost event trace context)
export type ProviderFallback = {
  kind: 'provider_fallback'
  errorClass: VendorErrorClass
  triggeredAtIteration: number
  fallbackModelId: string
}

// TierShift discriminator (on cost event trace context)
export type TierShift = {
  kind: 'tier_shift'
  origin: 'budget' | 'canary_primary_degraded' | 'canary_both_degraded'
  fromTier: 'full' | 'nano'
  toTier: 'nano' | 'refused'
  crossedThresholdPct?: 80 | 95 | 100
  canaryWindowId?: string
}

// QualityCanarySubscription event
export type CanaryStateChange = {
  windowId: string
  observedAt: Date
  primaryTierHealthy: boolean
  fallbackTierHealthy: boolean
  successRatePct: { primary: number; fallback: number }
  severity: 'nominal' | 'primary_degraded' | 'both_degraded' | 'collapse'
}

// Tenant-wide ladder state (driven by canary subscription)
export type TenantLadderState = {
  severity: 'nominal' | 'primary_degraded' | 'both_degraded' | 'collapse'
  canaryWindowId?: string
}
