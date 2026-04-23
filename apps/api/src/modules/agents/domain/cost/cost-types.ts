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
