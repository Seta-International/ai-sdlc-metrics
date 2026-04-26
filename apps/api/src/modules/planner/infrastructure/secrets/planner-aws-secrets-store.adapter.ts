import { Injectable } from '@nestjs/common'
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager'
import type { ISecretsStore } from '../../domain/ports/secrets-store.port'

@Injectable()
export class PlannerAwsSecretsStoreAdapter implements ISecretsStore {
  private readonly client: SecretsManagerClient

  constructor(opts: { region: string }) {
    this.client = new SecretsManagerClient({ region: opts.region })
  }

  async getSecret(ref: string): Promise<string> {
    const response = await this.client.send(new GetSecretValueCommand({ SecretId: ref }))
    if (!response.SecretString) throw new Error(`Secret ${ref} has no SecretString`)
    return response.SecretString
  }
}
