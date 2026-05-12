import { DecryptCommand, GenerateDataKeyCommand, KMSClient } from '@aws-sdk/client-kms'
import { ServiceUnavailable } from '@seta/middleware'

export type DataKey = {
  keyId: string
  plaintext: Uint8Array
  ciphertextBlob: Uint8Array
}

export interface KmsClient {
  generateDataKey(): Promise<DataKey>
  decrypt(ciphertextBlob: Uint8Array, keyId: string): Promise<Uint8Array>
}

export class AwsKmsClient implements KmsClient {
  private client: KMSClient
  constructor(private opts: { region: string; keyArn: string }) {
    this.client = new KMSClient({ region: opts.region })
  }

  async generateDataKey(): Promise<DataKey> {
    const res = await this.client.send(
      new GenerateDataKeyCommand({
        KeyId: this.opts.keyArn,
        KeySpec: 'AES_256',
      }),
    )
    if (!res.Plaintext || !res.CiphertextBlob || !res.KeyId) {
      throw new ServiceUnavailable('KMS generateDataKey returned incomplete response')
    }
    return { keyId: res.KeyId, plaintext: res.Plaintext, ciphertextBlob: res.CiphertextBlob }
  }

  async decrypt(ciphertextBlob: Uint8Array, keyId: string): Promise<Uint8Array> {
    const res = await this.client.send(
      new DecryptCommand({ CiphertextBlob: ciphertextBlob, KeyId: keyId }),
    )
    if (!res.Plaintext) throw new ServiceUnavailable('KMS decrypt returned no plaintext')
    return res.Plaintext
  }
}

/**
 * Local-dev KMS provider — does NOT call AWS. The "ciphertext blob" is a tiny
 * framed envelope `[1B version][32B plaintext]` so decrypt round-trips. NOT secure;
 * never enable in production. Selected when `KMS_PROVIDER=env`.
 */
export class EnvDekProvider implements KmsClient {
  constructor(private opts: { keyId: string; plaintextKey: Uint8Array }) {
    if (opts.plaintextKey.byteLength !== 32) {
      throw new Error('EnvDekProvider key must be 32 bytes')
    }
  }

  async generateDataKey(): Promise<DataKey> {
    const blob = Buffer.concat([Buffer.from([1]), Buffer.from(this.opts.plaintextKey)])
    return { keyId: this.opts.keyId, plaintext: this.opts.plaintextKey, ciphertextBlob: blob }
  }

  async decrypt(blob: Uint8Array, _keyId: string): Promise<Uint8Array> {
    if (blob[0] !== 1) throw new ServiceUnavailable('EnvDekProvider: bad envelope version')
    return blob.subarray(1)
  }
}

export function createKmsClient(env: {
  KMS_PROVIDER?: 'aws' | 'env'
  AWS_REGION?: string
  KMS_KEY_ARN?: string
  DEV_DEK_BASE64?: string
}): KmsClient {
  if (env.KMS_PROVIDER === 'env') {
    if (!env.DEV_DEK_BASE64) throw new Error('DEV_DEK_BASE64 required when KMS_PROVIDER=env')
    return new EnvDekProvider({
      keyId: 'local',
      plaintextKey: Buffer.from(env.DEV_DEK_BASE64, 'base64'),
    })
  }
  if (!env.AWS_REGION || !env.KMS_KEY_ARN) {
    throw new Error('AWS_REGION + KMS_KEY_ARN required for AWS KMS')
  }
  return new AwsKmsClient({ region: env.AWS_REGION, keyArn: env.KMS_KEY_ARN })
}
