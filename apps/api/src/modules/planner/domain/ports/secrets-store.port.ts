export const PLANNER_SECRETS_STORE = Symbol('ISecretsStore')

export interface ISecretsStore {
  getSecret(ref: string): Promise<string>
}
