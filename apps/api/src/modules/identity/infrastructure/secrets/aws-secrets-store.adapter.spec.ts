import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CreateSecretCommand,
  DeleteSecretCommand,
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager'
import { AwsSecretsStoreAdapter } from './aws-secrets-store.adapter'

vi.mock('@aws-sdk/client-secrets-manager')

describe('AwsSecretsStoreAdapter', () => {
  let send: ReturnType<typeof vi.fn>

  beforeEach(() => {
    send = vi.fn()
    vi.mocked(SecretsManagerClient).mockImplementation(function () {
      return { send }
    } as never)
  })

  it('putSecret returns ARN as ref', async () => {
    send.mockResolvedValue({ ARN: 'arn:aws:secretsmanager:ap-southeast-1:123:secret:abc' })
    const store = new AwsSecretsStoreAdapter({ region: 'ap-southeast-1' })

    const result = await store.putSecret({ name: 'n', value: 'v' })

    expect(result.ref).toBe('arn:aws:secretsmanager:ap-southeast-1:123:secret:abc')
    expect(send).toHaveBeenCalledWith(expect.any(CreateSecretCommand))
  })

  it('getSecret returns stored string', async () => {
    send.mockResolvedValue({ SecretString: 'plaintext-value' })
    const store = new AwsSecretsStoreAdapter({ region: 'ap-southeast-1' })

    await expect(store.getSecret('arn:xxx')).resolves.toBe('plaintext-value')
    expect(send).toHaveBeenCalledWith(expect.any(GetSecretValueCommand))
  })

  it('deleteSecret forces immediate removal', async () => {
    send.mockResolvedValue({})
    const store = new AwsSecretsStoreAdapter({ region: 'ap-southeast-1' })

    await store.deleteSecret('arn:xxx')

    expect(send).toHaveBeenCalledWith(expect.any(DeleteSecretCommand))
  })
})
