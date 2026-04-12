import { Injectable } from '@nestjs/common'
import type { ICryptoProvider } from '../../domain/ports/crypto-provider.port'
import { createHash, randomBytes } from 'node:crypto'

@Injectable()
export class NodeCryptoProvider implements ICryptoProvider {
  generateApiKey(): { plaintext: string; hash: string; lastFour: string } {
    const plaintext = randomBytes(32).toString('hex')
    const hash = this.hashApiKey(plaintext)
    const lastFour = plaintext.slice(-4)
    return { plaintext, hash, lastFour }
  }

  hashApiKey(plaintext: string): string {
    return createHash('sha256').update(plaintext).digest('hex')
  }
}
