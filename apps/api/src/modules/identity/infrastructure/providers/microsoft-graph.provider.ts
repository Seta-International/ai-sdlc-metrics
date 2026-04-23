import { Injectable } from '@nestjs/common'
import type { IdentityProviderEntity } from '../../domain/entities/identity-provider.entity'
import type {
  IDirectoryProvider,
  IdpUser,
  IdpGroup,
} from '../../domain/ports/directory-provider.port'
import type { MsGraphCredentialEntity } from '../../domain/entities/ms-graph-credential.entity'
import type { MsGraphTokenAcquirer } from './microsoft/ms-graph-token-acquirer'

interface GraphList<T> {
  value: T[]
  '@odata.nextLink'?: string
}

interface GraphUser {
  id: string
  mail?: string | null
  userPrincipalName?: string
  displayName?: string
  accountEnabled?: boolean
}

interface GraphGroup {
  id: string
  displayName: string
}

interface GraphDirectoryObject {
  id: string
}

@Injectable()
export class MicrosoftGraphProvider implements IDirectoryProvider {
  private readonly baseUrl = 'https://graph.microsoft.com/v1.0'

  constructor(
    private readonly providerConfig: IdentityProviderEntity,
    private readonly credential: MsGraphCredentialEntity,
    private readonly tokenAcquirer: MsGraphTokenAcquirer,
  ) {}

  async testConnection(): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      await this.graphFetch('/groups?$top=1')
      return { ok: true }
    } catch (error) {
      return { ok: false, error: (error as Error).message }
    }
  }

  async listUsers(): Promise<IdpUser[]> {
    const collected: GraphUser[] = []
    let url: string | undefined =
      `${this.baseUrl}/users?$select=id,mail,userPrincipalName,displayName,accountEnabled&$top=999`

    while (url) {
      const page: GraphList<GraphUser> = await this.graphFetchAbsolute(url)
      collected.push(...page.value)
      url = page['@odata.nextLink']
    }

    return collected.map((user) => ({
      externalId: user.id,
      email: user.mail ?? user.userPrincipalName ?? '',
      displayName: user.displayName ?? '',
      isActive: user.accountEnabled !== false,
    }))
  }

  async listGroupsWithMembers(): Promise<IdpGroup[]> {
    const groups: GraphGroup[] = []
    let url: string | undefined = `${this.baseUrl}/groups?$select=id,displayName&$top=999`

    while (url) {
      const page: GraphList<GraphGroup> = await this.graphFetchAbsolute(url)
      groups.push(...page.value)
      url = page['@odata.nextLink']
    }

    const results: IdpGroup[] = []
    for (const group of groups) {
      const memberExternalIds = await this.listGroupMembers(group.id)
      results.push({
        externalGroupId: group.id,
        displayName: group.displayName,
        memberExternalIds,
      })
    }

    return results
  }

  private async listGroupMembers(externalGroupId: string): Promise<string[]> {
    const ids: string[] = []
    let url: string | undefined =
      `${this.baseUrl}/groups/${encodeURIComponent(externalGroupId)}/members?$select=id&$top=999`

    while (url) {
      const page: GraphList<GraphDirectoryObject> = await this.graphFetchAbsolute(url)
      ids.push(...page.value.map((member) => member.id))
      url = page['@odata.nextLink']
    }

    return ids
  }

  private async graphFetch<T>(path: string): Promise<T> {
    return this.graphFetchAbsolute<T>(`${this.baseUrl}${path}`)
  }

  private async graphFetchAbsolute<T>(url: string): Promise<T> {
    const token = await this.tokenAcquirer.acquire({
      tenantAdId: this.credential.tenantAdId,
      clientId: this.credential.clientId,
      clientSecretRef: this.credential.clientSecretRef,
      scopes: this.credential.scopes,
    })
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Graph ${response.status}: ${text.slice(0, 500)}`)
    }

    return (await response.json()) as T
  }
}
