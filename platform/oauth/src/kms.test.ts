import { describe, expect, it } from 'vitest'
import { EnvDekProvider } from './kms'

describe('EnvDekProvider', () => {
  const provider = new EnvDekProvider({
    keyId: 'local',
    plaintextKey: Buffer.alloc(32, 7),
  })

  it('generateDataKey returns 32-byte plaintext + opaque blob', async () => {
    const { keyId, plaintext, ciphertextBlob } = await provider.generateDataKey()
    expect(plaintext.byteLength).toBe(32)
    expect(ciphertextBlob.byteLength).toBeGreaterThan(0)
    expect(keyId).toBe('local')
  })

  it('decrypt round-trips the same plaintext', async () => {
    const { plaintext, ciphertextBlob, keyId } = await provider.generateDataKey()
    const decrypted = await provider.decrypt(ciphertextBlob, keyId)
    expect(Buffer.compare(Buffer.from(plaintext), Buffer.from(decrypted))).toBe(0)
  })

  it('accepts an EncryptionContext argument (dev provider ignores it)', async () => {
    const ctx = { tenant_id: 't', provider_id: 'p', partition_key: 'k' }
    const { plaintext, ciphertextBlob, keyId } = await provider.generateDataKey(ctx)
    expect(plaintext.byteLength).toBe(32)
    const decrypted = await provider.decrypt(ciphertextBlob, keyId, ctx)
    expect(Buffer.compare(Buffer.from(plaintext), Buffer.from(decrypted))).toBe(0)
  })

  it('returns a fresh plaintext copy so zeroization does not wipe the master key', async () => {
    const { plaintext: first } = await provider.generateDataKey()
    first.fill(0)
    const { plaintext: second } = await provider.generateDataKey()
    // Second call must still see the original master key bytes (0x07s).
    expect(second.every((b) => b === 7)).toBe(true)
  })
})
