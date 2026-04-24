export type CancellationReason =
  | 'user'
  | 'timeout'
  | 'budget'
  | 'provider_outage'
  | 'quality_canary'

export type UsageSnapshot = {
  input_tokens: number
  output_tokens: number
  input_cached_read: number
  input_cached_write: number
  output_reasoning: number
}

export const ZERO_USAGE: UsageSnapshot = {
  input_tokens: 0,
  output_tokens: 0,
  input_cached_read: 0,
  input_cached_write: 0,
  output_reasoning: 0,
}

export function composeTurnAbortSignal(opts: { wallclockMs: number }): {
  signal: AbortSignal
  userCancelController: AbortController
  systemAbortController: AbortController
  captureReason(): CancellationReason | undefined
} {
  const userCancelController = new AbortController()
  const systemAbortController = new AbortController()
  const timeoutSignal = AbortSignal.timeout(opts.wallclockMs)

  const signal = AbortSignal.any([
    userCancelController.signal,
    systemAbortController.signal,
    timeoutSignal,
  ])

  let capturedReason: CancellationReason | undefined

  userCancelController.signal.addEventListener(
    'abort',
    () => {
      if (!capturedReason) capturedReason = 'user'
    },
    { once: true },
  )

  timeoutSignal.addEventListener(
    'abort',
    () => {
      if (!capturedReason) capturedReason = 'timeout'
    },
    { once: true },
  )

  systemAbortController.signal.addEventListener(
    'abort',
    () => {
      if (!capturedReason) {
        const r = systemAbortController.signal.reason as string
        capturedReason = r as CancellationReason
      }
    },
    { once: true },
  )

  return {
    signal,
    userCancelController,
    systemAbortController,
    captureReason: () => capturedReason,
  }
}

const REASON_MAP: Record<CancellationReason, string> = {
  user: 'cancelled',
  timeout: 'timeout',
  budget: 'budget',
  provider_outage: 'provider_outage',
  quality_canary: 'quality_canary',
}

export const AbortPayloadBuilder = {
  buildPayload(opts: {
    reason: CancellationReason
    usageAccumulator: UsageSnapshot
    cancelledBy?: string
  }): {
    reason: string
    usage: UsageSnapshot
    cancelled_by?: string
  } {
    const payload: { reason: string; usage: UsageSnapshot; cancelled_by?: string } = {
      reason: REASON_MAP[opts.reason],
      usage: opts.usageAccumulator,
    }

    if (opts.cancelledBy !== undefined) {
      payload.cancelled_by = opts.cancelledBy
    }

    return payload
  },
}
