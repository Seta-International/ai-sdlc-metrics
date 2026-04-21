import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ClsService } from 'nestjs-cls'
import { startOtel } from './otel'

const stubCls = {
  isActive: () => false,
  get: () => undefined,
} as unknown as ClsService

describe('startOtel', () => {
  const originalEndpoint = process.env['OTEL_EXPORTER_OTLP_ENDPOINT']

  beforeEach(() => {
    delete process.env['OTEL_EXPORTER_OTLP_ENDPOINT']
  })

  afterEach(() => {
    if (originalEndpoint === undefined) {
      delete process.env['OTEL_EXPORTER_OTLP_ENDPOINT']
    } else {
      process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] = originalEndpoint
    }
  })

  it('returns a no-op handle when OTEL_EXPORTER_OTLP_ENDPOINT is unset', async () => {
    const handle = startOtel({ cls: stubCls })
    await expect(handle.shutdown()).resolves.toBeUndefined()
  })

  it('initializes the SDK when the endpoint is configured', async () => {
    process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] = 'http://localhost:4318'
    const handle = startOtel({ cls: stubCls })
    await expect(handle.shutdown()).resolves.not.toThrow()
  })
})
