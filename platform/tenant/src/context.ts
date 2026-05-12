import { AsyncLocalStorage } from 'node:async_hooks'
import { Unauthorized } from '@seta/middleware'

export type TenantContextStore = {
  tenantId: string
  userId?: string
}

const als = new AsyncLocalStorage<TenantContextStore>()

export const tenantContext = {
  /** Run `fn` with the given store as the active tenant context. */
  run<T>(store: TenantContextStore, fn: () => Promise<T>): Promise<T> {
    return als.run(store, fn)
  },

  /** Read the current tenant id. Throws if no active context (deny-by-default). */
  getTenantId(): string {
    const store = als.getStore()
    if (!store) throw new Unauthorized('no tenant context')
    return store.tenantId
  },

  /** Read the current user id, if any. */
  getUserId(): string | undefined {
    return als.getStore()?.userId
  },
}
