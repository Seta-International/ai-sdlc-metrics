import { Injectable, Inject } from '@nestjs/common'
import { IdentityQueryFacade } from '../../../identity/application/facades/identity-query.facade'
import {
  MS_GRAPH_TOKEN_ACQUIRER,
  type IMsGraphTokenAcquirer,
} from '../../domain/ports/ms-graph-token-acquirer.port'

const GRAPH_V1 = 'https://graph.microsoft.com/v1.0'

@Injectable()
export class MsSharePointClient {
  constructor(
    private readonly identityFacade: IdentityQueryFacade,
    @Inject(MS_GRAPH_TOKEN_ACQUIRER)
    private readonly tokenAcquirer: IMsGraphTokenAcquirer,
  ) {}

  async getGroupDefaultDriveId(
    tenantId: string,
    msGroupId: string,
  ): Promise<{ siteId: string; driveId: string }> {
    const site = await this.graphGet<{ id: string }>(
      tenantId,
      `/groups/${encodeURIComponent(msGroupId)}/sites/root`,
    )
    const drive = await this.graphGet<{ id: string }>(
      tenantId,
      `/sites/${encodeURIComponent(site.id)}/drive`,
    )
    return { siteId: site.id, driveId: drive.id }
  }

  async ensureFolder(
    tenantId: string,
    driveId: string,
    folderPath: string,
  ): Promise<{ itemId: string }> {
    const segments = folderPath.split('/').filter(Boolean)
    const encoded = segments.map(encodeURIComponent).join('/')
    const token = await this.acquireToken(tenantId)

    // Try to get the full nested path in one request
    const checkUrl = `${GRAPH_V1}/drives/${driveId}/root:/${encoded}`
    const checkRes = await fetch(checkUrl, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    if (checkRes.ok) {
      const item = (await checkRes.json()) as { id: string }
      return { itemId: item.id }
    }
    if (checkRes.status !== 404) {
      throw new Error(`ensureFolder check ${checkRes.status}: ${await checkRes.text()}`)
    }

    // 404 — create the final segment under the parent path
    const parentSegments = segments.slice(0, -1)
    const leafName = segments[segments.length - 1]!
    const parentPath =
      parentSegments.length > 0
        ? `root:/${parentSegments.map(encodeURIComponent).join('/')}`
        : 'root'
    const createUrl = `${GRAPH_V1}/drives/${driveId}/${parentPath}/children`
    const createRes = await fetch(createUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        name: leafName,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'replace',
      }),
    })
    if (!createRes.ok) {
      throw new Error(`ensureFolder create ${createRes.status}: ${await createRes.text()}`)
    }
    const created = (await createRes.json()) as { id: string }
    return { itemId: created.id }
  }

  async uploadSmall(
    tenantId: string,
    driveId: string,
    path: string,
    body: Uint8Array | Buffer,
    mimeType: string,
  ): Promise<{ itemId: string; webUrl: string; driveId: string }> {
    const encoded = path.split('/').filter(Boolean).map(encodeURIComponent).join('/')
    const url = `${GRAPH_V1}/drives/${driveId}/root:/${encoded}:/content`
    const token = await this.acquireToken(tenantId)
    const response = await fetch(url, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': mimeType },
      body,
    })
    if (!response.ok) throw new Error(`uploadSmall ${response.status}: ${await response.text()}`)
    const json = (await response.json()) as {
      id: string
      webUrl: string
      parentReference?: { driveId?: string }
    }
    return {
      itemId: json.id,
      webUrl: json.webUrl,
      driveId: json.parentReference?.driveId ?? driveId,
    }
  }

  async createUploadSession(
    tenantId: string,
    driveId: string,
    path: string,
  ): Promise<{ uploadUrl: string }> {
    const encoded = path.split('/').filter(Boolean).map(encodeURIComponent).join('/')
    const token = await this.acquireToken(tenantId)
    const response = await fetch(
      `${GRAPH_V1}/drives/${driveId}/root:/${encoded}:/createUploadSession`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'replace' } }),
      },
    )
    if (!response.ok) {
      throw new Error(`createUploadSession ${response.status}: ${await response.text()}`)
    }
    const json = (await response.json()) as { uploadUrl: string }
    return { uploadUrl: json.uploadUrl }
  }

  async uploadChunk(
    uploadUrl: string,
    bytes: Uint8Array | Buffer,
    rangeStart: number,
    totalSize: number,
  ): Promise<{ status: number; itemId?: string; webUrl?: string; driveId?: string }> {
    const rangeEnd = rangeStart + bytes.length - 1
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': String(bytes.length),
        'Content-Range': `bytes ${rangeStart}-${rangeEnd}/${totalSize}`,
      },
      body: bytes,
    })
    if (response.status === 201 || response.status === 200) {
      const json = (await response.json()) as {
        id?: string
        webUrl?: string
        parentReference?: { driveId?: string }
      }
      return {
        status: response.status,
        itemId: json.id,
        webUrl: json.webUrl,
        driveId: json.parentReference?.driveId,
      }
    }
    if (response.status === 202) return { status: 202 }
    throw new Error(`uploadChunk ${response.status}: ${await response.text()}`)
  }

  async downloadContent(
    tenantId: string,
    driveId: string,
    itemId: string,
  ): Promise<{ stream: ReadableStream; size: number; contentType: string }> {
    const token = await this.acquireToken(tenantId)
    const response = await fetch(
      `${GRAPH_V1}/drives/${driveId}/items/${encodeURIComponent(itemId)}/content`,
      { headers: { Authorization: `Bearer ${token}` }, redirect: 'follow' },
    )
    if (!response.ok)
      throw new Error(`downloadContent ${response.status}: ${await response.text()}`)
    return {
      stream: response.body!,
      size: parseInt(response.headers.get('content-length') ?? '0', 10),
      contentType: response.headers.get('content-type') ?? 'application/octet-stream',
    }
  }

  async getItemMetadata(
    tenantId: string,
    driveId: string,
    itemId: string,
  ): Promise<{ name: string; size: number; mimeType: string }> {
    const item = await this.graphGet<{
      name: string
      size?: number
      file?: { mimeType?: string }
    }>(tenantId, `/drives/${driveId}/items/${encodeURIComponent(itemId)}`)
    return {
      name: item.name,
      size: item.size ?? 0,
      mimeType: item.file?.mimeType ?? 'application/octet-stream',
    }
  }

  private async acquireToken(tenantId: string): Promise<string> {
    const cred = await this.identityFacade.getGraphCredential(tenantId)
    if (!cred) throw new Error(`No Graph credential for tenant ${tenantId}`)
    return this.tokenAcquirer.acquire(cred)
  }

  private async graphGet<T>(tenantId: string, path: string): Promise<T> {
    const token = await this.acquireToken(tenantId)
    const response = await fetch(`${GRAPH_V1}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    if (!response.ok) throw new Error(`Graph GET ${response.status}: ${await response.text()}`)
    return (await response.json()) as T
  }
}
