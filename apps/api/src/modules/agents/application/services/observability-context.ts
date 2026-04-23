/**
 * ObservabilityContext and ObservabilityContextFactory.
 *
 * Every agent turn gets one ObservabilityContext. It threads the traceId,
 * flowId, and intentSlug through all child spans, and auto-stamps identity
 * attributes (tenant_id, user_id, etc.) on every span at creation.
 *
 * Application layer — may import from domain. Zero NestJS decorators.
 */

import { trace, context } from '@opentelemetry/api'
import { NoOpSpan, OtelSpan, IDENTITY_KEY_DENYLIST } from '../../domain/observability/span'
import type { Span } from '../../domain/observability/span'
import type { SpanType, EntityType } from '../../domain/observability/span-types'
import type { RequestContext } from './tool-gateway-contracts'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ObservabilityContext = {
  readonly currentSpan: Span
  readonly traceId: string
  readonly flowId: string
  readonly intentSlug: string
  createChildSpan(opts: {
    type: SpanType
    entity: EntityType
    name: string
    attrs?: Record<string, unknown>
  }): Span
}

// ─── Factory ──────────────────────────────────────────────────────────────────

const tracer = trace.getTracer('agents.observability')

export class ObservabilityContextFactory {
  create(opts: {
    requestContext: RequestContext
    parentSpan?: Span
    flowId: string
    intentSlug: string
    capture: boolean
  }): ObservabilityContext {
    const { requestContext, flowId, intentSlug, capture } = opts

    if (!capture) {
      return this._makeNoOpContext(requestContext.traceId, flowId, intentSlug)
    }

    // Create a root span for this context backed by OTel
    const otelRoot = tracer.startSpan('agents.context.root')
    const rootSpan = new OtelSpan(otelRoot, requestContext.traceId)

    // Stamp identity attributes on the root span (same as child spans, minus span_type/entity_type)
    const rootAttrs: Record<string, unknown> = {
      tenant_id: requestContext.tenantId,
      user_id: requestContext.userId,
      trace_id: requestContext.traceId,
      surface: requestContext.surface,
      flow_id: flowId,
      intent_slug: intentSlug,
    }
    if (requestContext.delegationId) {
      rootAttrs['delegation_id'] = requestContext.delegationId
    }
    otelRoot.setAttributes(rootAttrs as Parameters<typeof otelRoot.setAttributes>[0])

    return this._makeRealContext(rootSpan, requestContext, flowId, intentSlug)
  }

  private _makeNoOpContext(
    traceId: string,
    flowId: string,
    intentSlug: string,
  ): ObservabilityContext {
    const noOpSpan = new NoOpSpan(traceId)
    return {
      currentSpan: noOpSpan,
      traceId,
      flowId,
      intentSlug,
      createChildSpan: (_opts) => new NoOpSpan(traceId),
    }
  }

  private _makeRealContext(
    currentSpan: OtelSpan,
    requestContext: RequestContext,
    flowId: string,
    intentSlug: string,
  ): ObservabilityContext {
    return {
      currentSpan,
      traceId: requestContext.traceId,
      flowId,
      intentSlug,
      createChildSpan: (childOpts) => {
        // Mark the parent as non-leaf
        currentSpan.markHasChildren()

        // Strip any denylist keys from caller-supplied attrs (defense in depth)
        const denySet = new Set<string>(IDENTITY_KEY_DENYLIST)
        const safeCallerAttrs = Object.fromEntries(
          Object.entries(childOpts.attrs ?? {}).filter(([k]) => !denySet.has(k)),
        )

        // Build the identity + classification attributes; identity keys always win
        const autoAttrs: Record<string, unknown> = {
          ...safeCallerAttrs,
          tenant_id: requestContext.tenantId,
          user_id: requestContext.userId,
          trace_id: requestContext.traceId,
          surface: requestContext.surface,
          flow_id: flowId,
          intent_slug: intentSlug,
          span_type: childOpts.type,
          entity_type: childOpts.entity,
        }

        if (requestContext.delegationId) {
          autoAttrs['delegation_id'] = requestContext.delegationId
        }

        // Start an OTel child span under the current active context
        const otelCtx = currentSpan.asOtelContext()
        let childOtelSpan: ReturnType<typeof tracer.startSpan>
        context.with(otelCtx, () => {
          childOtelSpan = tracer.startSpan(childOpts.name)
        })
        // context.with callback is synchronous so childOtelSpan is assigned
        childOtelSpan!.setAttributes(autoAttrs as Parameters<typeof childOtelSpan.setAttributes>[0])

        return new OtelSpan(childOtelSpan!, requestContext.traceId)
      },
    }
  }
}
