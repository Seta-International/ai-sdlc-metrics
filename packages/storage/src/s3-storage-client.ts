import {
  S3Client,
  S3ServiceException,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { StorageClient, StorageConfig, UploadOpts, PresignedUrl, ObjectMeta } from './types'

const DEFAULT_EXPIRES_IN = 900

export class S3StorageClient implements StorageClient {
  private readonly s3: S3Client
  private readonly bucket: string

  constructor(config: StorageConfig) {
    this.s3 = new S3Client({ region: config.region })
    this.bucket = config.bucket
  }

  async getUploadUrl(key: string, opts: UploadOpts): Promise<PresignedUrl> {
    const expiresIn = opts.expiresIn ?? DEFAULT_EXPIRES_IN
    // Note: maxSizeBytes cannot be enforced via presigned PUT URLs.
    // Enforcement must happen client-side before uploading.
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: opts.contentType,
    })
    const url = await getSignedUrl(this.s3, command, { expiresIn })
    return {
      url,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    }
  }

  async getDownloadUrl(key: string, expiresIn = DEFAULT_EXPIRES_IN): Promise<PresignedUrl> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    })
    const url = await getSignedUrl(this.s3, command, { expiresIn })
    return {
      url,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    }
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    )
  }

  async deleteObject(key: string): Promise<void> {
    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    )
  }

  async headObject(key: string): Promise<ObjectMeta | null> {
    try {
      const result = await this.s3.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      )
      return {
        key,
        size: result.ContentLength ?? 0,
        contentType: result.ContentType ?? 'application/octet-stream',
        lastModified: result.LastModified ?? new Date(),
      }
    } catch (err: unknown) {
      if (err instanceof S3ServiceException && err.$metadata.httpStatusCode === 404) return null
      throw err
    }
  }
}
