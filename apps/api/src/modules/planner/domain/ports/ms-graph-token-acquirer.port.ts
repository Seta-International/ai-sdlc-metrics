export interface IMsGraphTokenAcquirer {
  acquire(cred: {
    tenantAdId: string
    clientId: string
    clientSecretRef: string
    scopes: readonly string[]
  }): Promise<string>
}
