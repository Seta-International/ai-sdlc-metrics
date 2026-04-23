import { Inject, Injectable } from '@nestjs/common'
import { SECRETS_STORE, type ISecretsStore } from '../../../domain/ports/secrets-store.port'

interface CacheEntry {
  token: string
  expiresAt: Date
}

@Injectable()
export class MsGraphTokenAcquirer {
  private readonly cache = new Map<string, CacheEntry>()
  private readonly expirySkewMs = 5 * 60 * 1000

  constructor(
    @Inject(SECRETS_STORE)
    private readonly secrets: ISecretsStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async acquire(cred: {
    tenantAdId: string
    clientId: string
    clientSecretRef: string
    scopes: readonly string[]
  }): Promise<string> {
    const key = `${cred.tenantAdId}:${cred.clientId}`
    const now = this.clock()
    const cached = this.cache.get(key)
    if (cached && cached.expiresAt.getTime() - now.getTime() > this.expirySkewMs) {
      return cached.token
    }

    const secret = await this.secrets.getSecret(cred.clientSecretRef)
    const scope =
      cred.scopes.length > 0 ? cred.scopes.join(' ') : 'https://graph.microsoft.com/.default'
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: cred.clientId,
      client_secret: secret,
      scope,
    })

    const response = await fetch(
      `https://login.microsoftonline.com/${cred.tenantAdId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      },
    )

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Token acquisition failed (${response.status}): ${text}`)
    }

    const json = (await response.json()) as { access_token: string; expires_in: number }
    const expiresAt = new Date(now.getTime() + json.expires_in * 1000)
    this.cache.set(key, { token: json.access_token, expiresAt })
    return json.access_token
  }

  invalidate(tenantAdId: string, clientId: string): void {
    this.cache.delete(`${tenantAdId}:${clientId}`)
  }
}
