import { describe, expect, it } from 'vitest'
import { EnvDekProvider } from './kms.js'

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
})
