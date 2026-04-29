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

export interface GraphUserProfile {
  id: string
  displayName: string | null
  mail: string | null
  officeLocation: string | null
  mobilePhone: string | null
  businessPhones: string[]
}

interface GraphDeltaUser {
  id: string
  mail?: string | null
  userPrincipalName?: string
  displayName?: string
  accountEnabled?: boolean
  jobTitle?: string | null
  department?: string | null
  officeLocation?: string | null
  mobilePhone?: string | null
  businessPhones?: string[]
  '@removed'?: { reason: string }
}

interface GraphDeltaResponse {
  value: GraphDeltaUser[]
  '@odata.nextLink'?: string
  '@odata.deltaLink'?: string
}

export interface IdpUserWithProfile {
  externalId: string
  email: string
  displayName: string
  isActive: boolean
  jobTitle: string | null
  department: string | null
  officeLocation: string | null
  mobilePhone: string | null
  businessPhone: string | null
  managerMsId: string | null
}

export interface UsersDeltaResult {
  users: IdpUserWithProfile[]
  deletedIds: string[]
  nextDeltaToken: string
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

  async getUserWithProfile(
    msUserId: string,
  ): Promise<{ user: GraphUserProfile; photo: Buffer | null }> {
    const user = await this.graphFetch<GraphUserProfile>(
      `/users/${encodeURIComponent(msUserId)}?$select=id,displayName,mail,officeLocation,mobilePhone,businessPhones`,
    )
    const photo = await this.fetchUserPhoto(msUserId)
    return { user, photo }
  }

  async listUsersDelta(deltaToken?: string): Promise<UsersDeltaResult> {
    const $select =
      'id,displayName,mail,accountEnabled,jobTitle,department,officeLocation,mobilePhone,businessPhones,userPrincipalName'
    const initialUrl = deltaToken ?? `${this.baseUrl}/users/delta?$select=${$select}&$top=999`

    const collected: GraphDeltaUser[] = []
    let finalDeltaToken: string | undefined
    let url: string | undefined = initialUrl

    while (url) {
      const page: GraphDeltaResponse = await this.graphFetchAbsolute<GraphDeltaResponse>(url)
      collected.push(...page.value)
      if (page['@odata.deltaLink']) {
        finalDeltaToken = page['@odata.deltaLink']
        break
      }
      url = page['@odata.nextLink']
    }

    if (!finalDeltaToken) throw new Error('MS Graph delta query completed without a deltaLink')

    const deletedIds: string[] = []
    const changedUsers: GraphDeltaUser[] = []
    for (const u of collected) {
      if (u['@removed']) {
        deletedIds.push(u.id)
      } else {
        changedUsers.push(u)
      }
    }

    const users: IdpUserWithProfile[] = []
    for (const u of changedUsers) {
      const managerMsId = await this.fetchManagerId(u.id)
      users.push({
        externalId: u.id,
        email: u.mail ?? u.userPrincipalName ?? '',
        displayName: u.displayName ?? '',
        isActive: u.accountEnabled !== false,
        jobTitle: u.jobTitle ?? null,
        department: u.department ?? null,
        officeLocation: u.officeLocation ?? null,
        mobilePhone: u.mobilePhone ?? null,
        businessPhone: u.businessPhones?.[0] ?? null,
        managerMsId,
      })
    }

    return { users, deletedIds, nextDeltaToken: finalDeltaToken }
  }

  private async fetchManagerId(msUserId: string): Promise<string | null> {
    const token = await this.tokenAcquirer.acquire({
      tenantAdId: this.credential.tenantAdId,
      clientId: this.credential.clientId,
      clientSecretRef: this.credential.clientSecretRef,
      scopes: this.credential.scopes,
    })
    const response = await fetch(
      `${this.baseUrl}/users/${encodeURIComponent(msUserId)}/manager?$select=id`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
    )
    if (!response.ok) return null
    const data = (await response.json()) as { id?: string }
    return data.id ?? null
  }

  private async fetchUserPhoto(msUserId: string): Promise<Buffer | null> {
    const token = await this.tokenAcquirer.acquire({
      tenantAdId: this.credential.tenantAdId,
      clientId: this.credential.clientId,
      clientSecretRef: this.credential.clientSecretRef,
      scopes: this.credential.scopes,
    })
    const response = await fetch(
      `${this.baseUrl}/users/${encodeURIComponent(msUserId)}/photo/$value`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'image/jpeg' } },
    )
    if (!response.ok) return null
    return Buffer.from(await response.arrayBuffer())
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
