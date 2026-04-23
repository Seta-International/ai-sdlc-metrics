export const SECRETS_STORE = Symbol('ISecretsStore')

export interface ISecretsStore {
  putSecret(input: { name: string; value: string }): Promise<{ ref: string }>
  getSecret(ref: string): Promise<string>
  deleteSecret(ref: string): Promise<void>
}
