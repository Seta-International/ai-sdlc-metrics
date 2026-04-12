import { beforeEach, describe, expect, it, vi } from 'vitest'
import { S3StorageClient } from '../s3-storage-client'

const mockSend = vi.fn()

// Mock the AWS SDK modules
vi.mock('@aws-sdk/client-s3', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function MockS3Client(this: any) {
    this.send = mockSend
  }
  return {
    S3Client: MockS3Client,
    PutObjectCommand: vi.fn(),
    GetObjectCommand: vi.fn(),
    DeleteObjectCommand: vi.fn(),
    HeadObjectCommand: vi.fn(),
  }
})

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://signed-url.example.com'),
}))

describe('S3StorageClient', () => {
  let client: S3StorageClient

  beforeEach(() => {
    vi.clearAllMocks()
    client = new S3StorageClient({ bucket: 'test-bucket', region: 'ap-southeast-1' })
  })

  it('getUploadUrl returns a presigned url and expiry', async () => {
    const result = await client.getUploadUrl('tenant/file.pdf', {
      contentType: 'application/pdf',
      maxSizeBytes: 10_000_000,
      expiresIn: 600,
    })

    expect(result.url).toBe('https://signed-url.example.com')
    expect(result.expiresAt).toBeInstanceOf(Date)
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now())
  })

  it('getDownloadUrl returns a presigned url', async () => {
    const result = await client.getDownloadUrl('tenant/file.pdf', 3600)

    expect(result.url).toBe('https://signed-url.example.com')
    expect(result.expiresAt).toBeInstanceOf(Date)
  })

  it('headObject returns null when object does not exist', async () => {
    mockSend.mockRejectedValue(Object.assign(new Error('Not Found'), { name: 'NotFound' }))

    const result = await client.headObject('tenant/missing.pdf')

    expect(result).toBeNull()
  })

  it('headObject returns metadata when object exists', async () => {
    mockSend.mockResolvedValue({
      ContentLength: 12345,
      ContentType: 'application/pdf',
      LastModified: new Date('2026-04-11T00:00:00Z'),
    })

    const result = await client.headObject('tenant/file.pdf')

    expect(result).toEqual({
      key: 'tenant/file.pdf',
      size: 12345,
      contentType: 'application/pdf',
      lastModified: new Date('2026-04-11T00:00:00Z'),
    })
  })
})
