export const CRYPTO_PROVIDER = Symbol('ICryptoProvider')

export interface ICryptoProvider {
  generateApiKey(): { plaintext: string; hash: string; lastFour: string }
  hashApiKey(plaintext: string): string
}
