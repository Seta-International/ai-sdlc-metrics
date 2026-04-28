import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MsSharePointClient } from './ms-sharepoint-client'

const mockIdentityFacade = {
  getGraphCredential: vi.fn().mockResolvedValue({
    tenantAdId: 'aad-tenant',
    clientId: 'client-1',
    clientSecretRef: 'ref-1',
    scopes: [],
  }),
}

const mockTokenAcquirer = {
  acquire: vi.fn().mockResolvedValue('test-token'),
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  global.fetch = fetchMock
  vi.clearAllMocks()
  // Reset default mocks
  mockIdentityFacade.getGraphCredential.mockResolvedValue({
    tenantAdId: 'aad-tenant',
    clientId: 'client-1',
    clientSecretRef: 'ref-1',
    scopes: [],
  })
  mockTokenAcquirer.acquire.mockResolvedValue('test-token')
})

function makeClient(): MsSharePointClient {
  return new MsSharePointClient(mockIdentityFacade as any, mockTokenAcquirer as any)
}

describe('MsSharePointClient', () => {
  it('getGroupDefaultDriveId: calls /groups/{id}/sites/root then /sites/{id}/drive', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'site-1' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'drive-1' }) })
    const c = makeClient()
    const r = await c.getGroupDefaultDriveId('t1', 'group-xyz')
    expect(r).toEqual({ siteId: 'site-1', driveId: 'drive-1' })
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/groups/group-xyz/sites/root'),
      expect.any(Object),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/sites/site-1/drive'),
      expect.any(Object),
    )
  })

  it('ensureFolder: 404 on GET → PUT to create', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 404, text: async () => '' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'folder-id' }) })
    const c = makeClient()
    const r = await c.ensureFolder('t1', 'drive-1', '/Planner/MyPlan')
    expect(r.itemId).toBe('folder-id')
  })

  it('uploadSmall: PUT /drives/{id}/root:/path:/content with body', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'item-1',
        webUrl: 'https://sp/x',
        parentReference: { driveId: 'drive-1' },
      }),
    })
    const c = makeClient()
    const r = await c.uploadSmall(
      't1',
      'drive-1',
      '/Planner/MyPlan/file.pdf',
      Buffer.from('hello'),
      'application/pdf',
    )
    expect(r).toEqual({ itemId: 'item-1', webUrl: 'https://sp/x', driveId: 'drive-1' })
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/drives/drive-1/root:/Planner/MyPlan/file.pdf:/content'),
      expect.objectContaining({ method: 'PUT' }),
    )
  })

  it('createUploadSession: returns uploadUrl for large files', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ uploadUrl: 'https://sp/session', expirationDateTime: '...' }),
    })
    const c = makeClient()
    const { uploadUrl } = await c.createUploadSession('t1', 'drive-1', '/Planner/MyPlan/big.pdf')
    expect(uploadUrl).toBe('https://sp/session')
  })

  it('downloadContent: returns stream, size, contentType', async () => {
    const mockStream = new ReadableStream()
    fetchMock.mockResolvedValue({
      ok: true,
      body: mockStream,
      headers: {
        get: (h: string) => {
          if (h === 'content-length') return '1234'
          if (h === 'content-type') return 'application/pdf'
          return null
        },
      },
    })
    const c = makeClient()
    const r = await c.downloadContent('t1', 'drive-1', 'item-1')
    expect(r.stream).toBe(mockStream)
    expect(r.size).toBe(1234)
    expect(r.contentType).toBe('application/pdf')
  })

  it('getItemMetadata: returns name, size, mimeType', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        name: 'report.pdf',
        size: 50000,
        file: { mimeType: 'application/pdf' },
      }),
    })
    const c = makeClient()
    const r = await c.getItemMetadata('t1', 'drive-1', 'item-1')
    expect(r).toEqual({ name: 'report.pdf', size: 50000, mimeType: 'application/pdf' })
  })

  it('throws if credential is missing', async () => {
    mockIdentityFacade.getGraphCredential.mockResolvedValue(null)
    const c = makeClient()
    await expect(c.getGroupDefaultDriveId('t1', 'group-xyz')).rejects.toThrow()
  })
})
