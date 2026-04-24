/**
 * request-context-discipline.spec.ts — Plan 06 Task 6
 *
 * Covers:
 *  1.  set('tenant_id', ...) in dev mode throws with correct message
 *  2.  set('user_id', ...) in dev mode throws
 *  3.  set('trace_id', ...) in dev mode throws
 *  4.  set('delegation_id', ...) in dev mode throws
 *  5.  set('surface', ...) in dev mode throws
 *  6.  set('tenant_id', ...) in prod mode — does NOT throw, does NOT call cls.set, logs error
 *  7.  set('some_non_identity_key', value) passes through to cls.set — dev mode
 *  8.  set('some_non_identity_key', value) passes through to cls.set — prod mode
 *  9.  get('tenant_id') delegates to cls.get
 * 10.  setIdentityKey('tenant_id', value) bypasses guard and calls cls.set directly
 * 11.  Multiple non-identity keys set correctly via cls.set
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RequestContextDiscipline, IDENTITY_KEYS } from './request-context-discipline'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMockCls() {
  return {
    set: vi.fn(),
    get: vi.fn(),
  }
}

function makeMockAuditFacade() {
  return {
    recordEvent: vi.fn().mockResolvedValue(undefined),
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RequestContextDiscipline — dev mode (NODE_ENV=development)', () => {
  let cls: ReturnType<typeof makeMockCls>
  let svc: RequestContextDiscipline

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development')
    cls = makeMockCls()
    svc = new RequestContextDiscipline(cls as any, makeMockAuditFacade() as any)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('1. set("tenant_id", ...) throws with the correct message', () => {
    expect(() => svc.set('tenant_id', 'abc')).toThrow(
      `RequestContext identity write blocked: attempt to set 'tenant_id' from non-middleware code`,
    )
    expect(cls.set).not.toHaveBeenCalled()
  })

  it('2. set("user_id", ...) throws', () => {
    expect(() => svc.set('user_id', 'u-1')).toThrow(
      `RequestContext identity write blocked: attempt to set 'user_id' from non-middleware code`,
    )
    expect(cls.set).not.toHaveBeenCalled()
  })

  it('3. set("trace_id", ...) throws', () => {
    expect(() => svc.set('trace_id', 'tr-1')).toThrow(
      `RequestContext identity write blocked: attempt to set 'trace_id' from non-middleware code`,
    )
    expect(cls.set).not.toHaveBeenCalled()
  })

  it('4. set("delegation_id", ...) throws', () => {
    expect(() => svc.set('delegation_id', 'del-1')).toThrow(
      `RequestContext identity write blocked: attempt to set 'delegation_id' from non-middleware code`,
    )
    expect(cls.set).not.toHaveBeenCalled()
  })

  it('5. set("surface", ...) throws', () => {
    expect(() => svc.set('surface', 'web')).toThrow(
      `RequestContext identity write blocked: attempt to set 'surface' from non-middleware code`,
    )
    expect(cls.set).not.toHaveBeenCalled()
  })

  it('7. set(non-identity key, value) passes through to cls.set in dev mode', () => {
    svc.set('some_non_identity_key', 'hello')
    expect(cls.set).toHaveBeenCalledWith('some_non_identity_key', 'hello')
  })
})

describe('RequestContextDiscipline — prod mode (NODE_ENV=production)', () => {
  let cls: ReturnType<typeof makeMockCls>
  let mockAuditFacade: ReturnType<typeof makeMockAuditFacade>
  let svc: RequestContextDiscipline
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production')
    cls = makeMockCls()
    mockAuditFacade = makeMockAuditFacade()
    svc = new RequestContextDiscipline(cls as any, mockAuditFacade as any)
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('6. set("tenant_id", ...) in prod — does NOT throw, does NOT call cls.set, logs error, emits audit event', () => {
    expect(() => svc.set('tenant_id', 'abc')).not.toThrow()
    expect(cls.set).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('identity_key_write_attempted'))
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('tenant_id'))
    expect(mockAuditFacade.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'identity_key_write_attempted',
        payload: expect.objectContaining({ key: 'tenant_id' }),
      }),
    )
  })

  it('8. set(non-identity key, value) passes through to cls.set in prod mode', () => {
    svc.set('some_non_identity_key', 42)
    expect(cls.set).toHaveBeenCalledWith('some_non_identity_key', 42)
  })
})

describe('RequestContextDiscipline — get', () => {
  let cls: ReturnType<typeof makeMockCls>
  let svc: RequestContextDiscipline

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development')
    cls = makeMockCls()
    svc = new RequestContextDiscipline(cls as any, makeMockAuditFacade() as any)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('9. get("tenant_id") delegates to cls.get', () => {
    cls.get.mockReturnValue('tenant-42')
    const result = svc.get('tenant_id')
    expect(cls.get).toHaveBeenCalledWith('tenant_id')
    expect(result).toBe('tenant-42')
  })
})

describe('RequestContextDiscipline — setIdentityKey (middleware bypass)', () => {
  let cls: ReturnType<typeof makeMockCls>
  let svc: RequestContextDiscipline

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development')
    cls = makeMockCls()
    svc = new RequestContextDiscipline(cls as any, makeMockAuditFacade() as any)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('10. setIdentityKey("tenant_id", value) bypasses the guard and calls cls.set directly', () => {
    svc.setIdentityKey('tenant_id', 'tenant-xyz')
    expect(cls.set).toHaveBeenCalledWith('tenant_id', 'tenant-xyz')
  })

  it('setIdentityKey works for all identity keys', () => {
    for (const key of IDENTITY_KEYS) {
      cls.set.mockClear()
      svc.setIdentityKey(key, `value-for-${key}`)
      expect(cls.set).toHaveBeenCalledWith(key, `value-for-${key}`)
    }
  })
})

describe('RequestContextDiscipline — multiple non-identity keys', () => {
  let cls: ReturnType<typeof makeMockCls>
  let svc: RequestContextDiscipline

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development')
    cls = makeMockCls()
    svc = new RequestContextDiscipline(cls as any, makeMockAuditFacade() as any)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('11. multiple non-identity keys are all forwarded correctly via cls.set', () => {
    const entries: [string, unknown][] = [
      ['tool_call_id', 'tc-1'],
      ['step_index', 3],
      ['model_id', 'gpt-5.4'],
    ]

    for (const [key, value] of entries) {
      svc.set(key, value)
    }

    expect(cls.set).toHaveBeenCalledTimes(3)
    expect(cls.set).toHaveBeenNthCalledWith(1, 'tool_call_id', 'tc-1')
    expect(cls.set).toHaveBeenNthCalledWith(2, 'step_index', 3)
    expect(cls.set).toHaveBeenNthCalledWith(3, 'model_id', 'gpt-5.4')
  })
})
