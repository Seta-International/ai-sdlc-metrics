/**
 * Local-dev-only secrets store. The ref stored in the DB IS the plaintext
 * secret (never an ARN). Used when LOCAL_DEV=1 so the OAuth flow works
 * without AWS credentials.
 */
export class LocalDevSecretsStoreAdapter {
  async getSecret(ref: string): Promise<string> {
    return ref
  }

  async putSecret(input: { name: string; value: string }): Promise<{ ref: string }> {
    return { ref: input.value }
  }

  async deleteSecret(_ref: string): Promise<void> {
    // no-op in local dev
  }
}
