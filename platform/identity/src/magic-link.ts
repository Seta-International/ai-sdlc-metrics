import { createHash, randomBytes } from 'node:crypto'

export const MAGIC_LINK_TTL_MS = 10 * 60 * 1000

export function mintToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashToken(raw: string): Buffer {
  return createHash('sha256').update(raw, 'utf8').digest()
}

export function isExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime()
}

export function expiresAtFromNow(now: Date = new Date()): Date {
  return new Date(now.getTime() + MAGIC_LINK_TTL_MS)
}
