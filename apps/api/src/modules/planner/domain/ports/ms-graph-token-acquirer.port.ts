export const MS_GRAPH_TOKEN_ACQUIRER = Symbol('IMsGraphTokenAcquirer')

export interface IMsGraphTokenAcquirer {
  acquire(cred: {
    tenantAdId: string
    clientId: string
    clientSecretRef: string
    scopes: readonly string[]
  }): Promise<string>
}
