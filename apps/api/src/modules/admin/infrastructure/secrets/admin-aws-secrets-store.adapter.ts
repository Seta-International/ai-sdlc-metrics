import { Injectable } from '@nestjs/common'
import {
  CreateSecretCommand,
  DeleteSecretCommand,
  GetSecretValueCommand,
  PutSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager'
import type { ISecretsStore } from '../../domain/ports/secrets-store.port'

@Injectable()
export class AdminAwsSecretsStoreAdapter implements ISecretsStore {
  private readonly client: SecretsManagerClient

  constructor(opts: { region: string }) {
    this.client = new SecretsManagerClient({ region: opts.region })
  }

  async putSecret(input: { name: string; value: string }): Promise<{ ref: string }> {
    try {
      const response = await this.client.send(
        new CreateSecretCommand({ Name: input.name, SecretString: input.value }),
      )
      if (!response.ARN) throw new Error('Secrets Manager did not return ARN')
      return { ref: input.name }
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'ResourceExistsException') {
        await this.client.send(
          new PutSecretValueCommand({ SecretId: input.name, SecretString: input.value }),
        )
        return { ref: input.name }
      }
      throw err
    }
  }

  async getSecret(ref: string): Promise<string> {
    const response = await this.client.send(new GetSecretValueCommand({ SecretId: ref }))
    if (!response.SecretString) throw new Error(`Secret ${ref} has no SecretString`)
    return response.SecretString
  }

  async deleteSecret(ref: string): Promise<void> {
    await this.client.send(
      new DeleteSecretCommand({ SecretId: ref, ForceDeleteWithoutRecovery: true }),
    )
  }
}
