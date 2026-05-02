import { describe, it, expect, vi } from 'vitest'
import { KernelTenantLister } from './kernel-tenant-lister'
import type { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'

describe('KernelTenantLister', () => {
  it('delegates to KernelQueryFacade.listActiveTenantIds', async () => {
    const facade = { listActiveTenantIds: vi.fn().mockResolvedValue(['t1', 't2']) }
    const lister = new KernelTenantLister(facade as unknown as KernelQueryFacade)
    expect(await lister.listActiveTenantIds()).toEqual(['t1', 't2'])
    expect(facade.listActiveTenantIds).toHaveBeenCalledTimes(1)
  })
})
