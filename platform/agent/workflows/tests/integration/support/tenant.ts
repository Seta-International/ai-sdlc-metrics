import { tenantContext } from '@seta/tenancy'

export const TENANT_A = '00000000-0000-0000-0000-00000000000a'
export const TENANT_B = '00000000-0000-0000-0000-00000000000b'

export async function asTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return tenantContext.run({ tenantId }, fn)
}
