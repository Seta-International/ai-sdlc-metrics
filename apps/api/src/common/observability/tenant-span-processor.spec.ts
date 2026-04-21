import { describe, expect, it, vi } from 'vitest'
import type { ClsService } from 'nestjs-cls'
import type { Span } from '@opentelemetry/sdk-trace-base'
import { ROOT_CONTEXT } from '@opentelemetry/api'
import { TenantSpanProcessor } from './tenant-span-processor'

describe('TenantSpanProcessor', () => {
  it('stamps tenant_id from CLS onto every span at start', () => {
    const cls = {
      isActive: () => true,
      get: vi.fn().mockReturnValue('tenant-123'),
    } as unknown as ClsService
    const setAttribute = vi.fn()
    const span = { setAttribute } as unknown as Span

    const processor = new TenantSpanProcessor(cls)
    processor.onStart(span, ROOT_CONTEXT)

    expect(setAttribute).toHaveBeenCalledWith('tenant_id', 'tenant-123')
  })

  it('skips stamping when CLS is inactive', () => {
    const cls = { isActive: () => false, get: vi.fn() } as unknown as ClsService
    const setAttribute = vi.fn()
    const span = { setAttribute } as unknown as Span

    new TenantSpanProcessor(cls).onStart(span, ROOT_CONTEXT)

    expect(setAttribute).not.toHaveBeenCalled()
  })

  it('skips stamping when tenantId is missing from CLS', () => {
    const cls = {
      isActive: () => true,
      get: vi.fn().mockReturnValue(undefined),
    } as unknown as ClsService
    const setAttribute = vi.fn()
    const span = { setAttribute } as unknown as Span

    new TenantSpanProcessor(cls).onStart(span, ROOT_CONTEXT)

    expect(setAttribute).not.toHaveBeenCalled()
  })
})
