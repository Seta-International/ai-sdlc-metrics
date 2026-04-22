/**
 * preferences.router.spec.ts — Plan 04 L3 preferences tRPC router
 *
 * Per plan 04 §4: tRPC mutations have permission meta only — NO agent meta —
 * so the plan 01 registry cannot discover them as agent tools (R-04.16).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { preferencesRouter, setPreferencesService } from './preferences.router'
import type { L3PreferenceService } from '../../application/services/l3-preferences'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const USER_ID = '01900000-0000-7000-8000-000000000002'

function makeCtx() {
  return {
    req: { headers: {} as Record<string, string | undefined> },
    tenantId: TENANT_ID,
    actorId: USER_ID,
  }
}

function makeService(): L3PreferenceService {
  return {
    set: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    getAll: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  } as unknown as L3PreferenceService
}

describe('preferencesRouter', () => {
  let svc: L3PreferenceService

  beforeEach(() => {
    svc = makeService()
    setPreferencesService(svc)
  })

  // ── set ──────────────────────────────────────────────────────────────────────

  it('set — calls service.set with tenantId, userId, key, value from context + input', async () => {
    const caller = preferencesRouter.createCaller(makeCtx())
    await caller.set({ key: 'display_format', value: 'table' })

    expect(svc.set).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      userId: USER_ID,
      key: 'display_format',
      value: 'table',
      updatedBy: USER_ID,
    })
  })

  it('set — throws if service throws (unknown key)', async () => {
    ;(svc.set as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Unknown L3 preference key: skip_confirmations'),
    )
    const caller = preferencesRouter.createCaller(makeCtx())
    await expect(caller.set({ key: 'skip_confirmations', value: true })).rejects.toThrow(
      /Unknown L3 preference key/,
    )
  })

  // ── get ──────────────────────────────────────────────────────────────────────

  it('get — returns value from service.get', async () => {
    ;(svc.get as ReturnType<typeof vi.fn>).mockResolvedValue('compact')
    const caller = preferencesRouter.createCaller(makeCtx())
    const result = await caller.get({ key: 'display_format' })
    expect(result).toBe('compact')
  })

  it('get — returns null when preference is not set', async () => {
    ;(svc.get as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    const caller = preferencesRouter.createCaller(makeCtx())
    const result = await caller.get({ key: 'display_format' })
    expect(result).toBeNull()
  })

  // ── getAll ───────────────────────────────────────────────────────────────────

  it('getAll — returns all preferences as a record', async () => {
    const prefs = { display_format: 'table', currency_display: 'USD' }
    ;(svc.getAll as ReturnType<typeof vi.fn>).mockResolvedValue(prefs)
    const caller = preferencesRouter.createCaller(makeCtx())
    const result = await caller.getAll()
    expect(result).toEqual(prefs)
  })

  it('getAll — passes tenantId and userId from context', async () => {
    const caller = preferencesRouter.createCaller(makeCtx())
    await caller.getAll()
    expect(svc.getAll).toHaveBeenCalledWith({ tenantId: TENANT_ID, userId: USER_ID })
  })

  // ── delete ───────────────────────────────────────────────────────────────────

  it('delete — with key calls service.delete with that key', async () => {
    const caller = preferencesRouter.createCaller(makeCtx())
    await caller.delete({ key: 'display_format' })
    expect(svc.delete).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      userId: USER_ID,
      key: 'display_format',
    })
  })

  it('delete — without key calls service.delete for all (GDPR-like clear)', async () => {
    const caller = preferencesRouter.createCaller(makeCtx())
    await caller.delete({})
    expect(svc.delete).toHaveBeenCalledWith({ tenantId: TENANT_ID, userId: USER_ID })
  })

  // ── agent-immunity guard ──────────────────────────────────────────────────────

  it('procedures have no agent meta (R-04.16 — not agent-invokable)', () => {
    const def = preferencesRouter._def
    for (const [name, proc] of Object.entries(def.procedures)) {
      const meta = (proc as { _def?: { meta?: { agent?: unknown } } })._def?.meta
      expect(meta?.agent, `${name} must not have agent meta`).toBeUndefined()
    }
  })
})
