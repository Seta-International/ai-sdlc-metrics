import { createHmac } from 'node:crypto'

export function deriveCsrfToken(sessionId: string, hexKey: string): string {
  const key = Buffer.from(hexKey, 'hex')
  return createHmac('sha256', key).update(`csrf:${sessionId}`).digest('base64url')
}
