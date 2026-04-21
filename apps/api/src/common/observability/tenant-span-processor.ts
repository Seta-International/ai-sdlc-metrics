import type { ClsService } from 'nestjs-cls'
import type { Context } from '@opentelemetry/api'
import type { Span, SpanProcessor } from '@opentelemetry/sdk-trace-base'

const TENANT_ID_KEY = 'tenantId'

/**
 * Auto-stamps `tenant_id` from the request-scoped CLS store onto every span
 * at creation. Plan 07 expands this to the full identity-key set; here we
 * seat the seam so no downstream code needs to call setAttribute manually.
 */
export class TenantSpanProcessor implements SpanProcessor {
  constructor(private readonly cls: ClsService) {}

  onStart(span: Span, _parentContext: Context): void {
    if (!this.cls.isActive()) {
      return
    }
    const tenantId = this.cls.get<string | undefined>(TENANT_ID_KEY)
    if (tenantId) {
      span.setAttribute('tenant_id', tenantId)
    }
  }

  onEnd(): void {}
  async forceFlush(): Promise<void> {}
  async shutdown(): Promise<void> {}
}
