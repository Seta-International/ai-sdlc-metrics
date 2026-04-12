export interface StorageConfig {
  bucket: string
  region: string
}

export interface UploadOpts {
  contentType: string
  maxSizeBytes: number
  /** Presigned URL TTL in seconds. Default 900. */
  expiresIn?: number
}

export interface PresignedUrl {
  url: string
  expiresAt: Date
}

export interface ObjectMeta {
  key: string
  size: number
  contentType: string
  lastModified: Date
}

export interface StorageClient {
  getUploadUrl(key: string, opts: UploadOpts): Promise<PresignedUrl>
  getDownloadUrl(key: string, expiresIn?: number): Promise<PresignedUrl>
  deleteObject(key: string): Promise<void>
  headObject(key: string): Promise<ObjectMeta | null>
}
