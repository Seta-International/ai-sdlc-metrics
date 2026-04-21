import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const registerOTel = vi.fn()
const forceFlush = vi.fn(async () => {})
const shutdown = vi.fn(async () => {})
const LangfuseExporter = vi.fn(
  class {
    forceFlush = forceFlush
    shutdown = shutdown
  },
)

vi.mock('@vercel/otel', () => ({ registerOTel }))
vi.mock('langfuse-vercel', () => ({ LangfuseExporter }))

describe('initLangfuseOTel', () => {
  beforeEach(() => {
    registerOTel.mockClear()
    forceFlush.mockClear()
    shutdown.mockClear()
    LangfuseExporter.mockClear()
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('throws when LANGFUSE_SECRET_KEY is absent', async () => {
    vi.stubEnv('LANGFUSE_SECRET_KEY', '')
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', 'pk_test')
    vi.stubEnv('LANGFUSE_BASE_URL', 'https://langfuse.local')
    const { initLangfuseOTel } = await import('./langfuse-wiring')
    expect(() => initLangfuseOTel()).toThrow(/LANGFUSE_SECRET_KEY/)
    expect(registerOTel).not.toHaveBeenCalled()
  })

  it('throws when LANGFUSE_PUBLIC_KEY is absent', async () => {
    vi.stubEnv('LANGFUSE_SECRET_KEY', 'sk_test')
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', '')
    vi.stubEnv('LANGFUSE_BASE_URL', 'https://langfuse.local')
    const { initLangfuseOTel } = await import('./langfuse-wiring')
    expect(() => initLangfuseOTel()).toThrow(/LANGFUSE_PUBLIC_KEY/)
    expect(registerOTel).not.toHaveBeenCalled()
  })

  it('throws when LANGFUSE_BASE_URL is absent', async () => {
    vi.stubEnv('LANGFUSE_SECRET_KEY', 'sk_test')
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', 'pk_test')
    vi.stubEnv('LANGFUSE_BASE_URL', '')
    const { initLangfuseOTel } = await import('./langfuse-wiring')
    expect(() => initLangfuseOTel()).toThrow(/LANGFUSE_BASE_URL/)
    expect(registerOTel).not.toHaveBeenCalled()
  })

  it('registers OTel and returns a shutdown handle with all three envs present', async () => {
    vi.stubEnv('LANGFUSE_SECRET_KEY', 'sk_test')
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', 'pk_test')
    vi.stubEnv('LANGFUSE_BASE_URL', 'https://langfuse.local')
    const { initLangfuseOTel } = await import('./langfuse-wiring')

    const handle = initLangfuseOTel()

    expect(LangfuseExporter).toHaveBeenCalledWith({
      secretKey: 'sk_test',
      publicKey: 'pk_test',
      baseUrl: 'https://langfuse.local',
    })
    expect(registerOTel).toHaveBeenCalledWith({
      serviceName: 'future-agents',
      traceExporter: expect.anything(),
    })
    expect(typeof handle.shutdown).toBe('function')

    await handle.shutdown()
    expect(forceFlush).toHaveBeenCalledOnce()
    expect(shutdown).toHaveBeenCalledOnce()
  })

  it('is idempotent: repeated calls return the same handle without re-registering OTel', async () => {
    vi.stubEnv('LANGFUSE_SECRET_KEY', 'sk_test')
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', 'pk_test')
    vi.stubEnv('LANGFUSE_BASE_URL', 'https://langfuse.local')
    const { initLangfuseOTel } = await import('./langfuse-wiring')

    const first = initLangfuseOTel()
    const second = initLangfuseOTel()

    expect(second).toBe(first)
    expect(registerOTel).toHaveBeenCalledOnce()
    expect(LangfuseExporter).toHaveBeenCalledOnce()
  })
})
