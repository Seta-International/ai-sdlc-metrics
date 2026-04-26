/**
 * FlowIdPropagation — formal contract for minting and inheriting per-user-intent
 * flow IDs. Per Plan 07 §4.
 *
 * A `flow_id` groups multiple turns of a conversation into one logical flow
 * (e.g. draft → approval → execute). It is DISTINCT from `trace_id`, which is
 * per-turn. Multiple `trace_id`s in a multi-turn flow all share the same `flow_id`.
 */

import { Injectable } from '@nestjs/common'
import { uuidv7 } from 'uuidv7'
import type { RequestContext } from './tool-gateway-contracts'

// ─── Branded types ─────────────────────────────────────────────────────────────

declare const _flowId: unique symbol
/** Opaque UUIDv7 that identifies a logical multi-turn flow. */
export type FlowId = string & { readonly [_flowId]: true }

declare const _intentSlug: unique symbol
/** Opaque slug that identifies a user's intent at router entry. */
export type IntentSlug = string & { readonly [_intentSlug]: true }

// ─── FlowIdPropagation ─────────────────────────────────────────────────────────

@Injectable()
export class FlowIdPropagation {
  /**
   * Mint a new FlowId — called **exactly once** at router entry of the FIRST
   * turn of a flow. Never call this on subsequent turns.
   */
  mint(opts: { requestContext: RequestContext; intentSlug: IntentSlug }): FlowId {
    // requestContext is present for future logging / tracing correlation.
    void opts.requestContext
    void opts.intentSlug
    return uuidv7() as FlowId
  }

  /**
   * Inherit a FlowId for subsequent turns in the same flow
   * (draft resume, approval decision, scheduled execute).
   *
   * The `flow_id` MUST NOT change across turns — it is returned unchanged.
   */
  inheritFrom(opts: { priorFlowId: FlowId; requestContext: RequestContext }): FlowId {
    if (!opts.priorFlowId) {
      throw new Error('FlowIdPropagation.inheritFrom: priorFlowId must be non-empty')
    }
    void opts.requestContext
    return opts.priorFlowId
  }
}
