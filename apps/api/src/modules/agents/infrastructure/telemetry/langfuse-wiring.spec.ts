import { describe, it, expect, vi } from 'vitest'
import { initLangfuseOTel } from './langfuse-wiring'

describe('initLangfuseOTel', () => {
  it('throws when LANGFUSE_SECRET_KEY is absent', () => {
    vi.stubEnv('LANGFUSE_SECRET_KEY', '')
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', 'pk_test')
    vi.stubEnv('LANGFUSE_BASE_URL', 'https://langfuse.local')
    expect(() => initLangfuseOTel()).toThrow(/LANGFUSE_SECRET_KEY/)
    vi.unstubAllEnvs()
  })

  it('throws when LANGFUSE_PUBLIC_KEY is absent', () => {
    vi.stubEnv('LANGFUSE_SECRET_KEY', 'sk_test')
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', '')
    vi.stubEnv('LANGFUSE_BASE_URL', 'https://langfuse.local')
    expect(() => initLangfuseOTel()).toThrow(/LANGFUSE_PUBLIC_KEY/)
    vi.unstubAllEnvs()
  })

  it('throws when LANGFUSE_BASE_URL is absent', () => {
    vi.stubEnv('LANGFUSE_SECRET_KEY', 'sk_test')
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', 'pk_test')
    vi.stubEnv('LANGFUSE_BASE_URL', '')
    expect(() => initLangfuseOTel()).toThrow(/LANGFUSE_BASE_URL/)
    vi.unstubAllEnvs()
  })

  it('registers OTel and returns a shutdown handle with all three envs present', () => {
    vi.stubEnv('LANGFUSE_SECRET_KEY', 'sk_test')
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', 'pk_test')
    vi.stubEnv('LANGFUSE_BASE_URL', 'https://langfuse.local')
    const handle = initLangfuseOTel()
    expect(handle).toHaveProperty('shutdown')
    expect(typeof handle.shutdown).toBe('function')
    vi.unstubAllEnvs()
  })
})
