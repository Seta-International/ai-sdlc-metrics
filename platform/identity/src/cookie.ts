import { createHmac, timingSafeEqual } from 'node:crypto'

export function signCookie(payload: string, hexKey: string): string {
  const key = Buffer.from(hexKey, 'hex')
  const payloadB64 = Buffer.from(payload, 'utf8').toString('base64url')
  const mac = createHmac('sha256', key).update(payloadB64).digest('base64url')
  return `${payloadB64}.${mac}`
}

export function verifyCookie(signed: string, hexKey: string): string | null {
  if (!signed) return null
  const dot = signed.indexOf('.')
  if (dot < 1 || dot === signed.length - 1) return null
  const payloadB64 = signed.slice(0, dot)
  const macGiven = signed.slice(dot + 1)
  const key = Buffer.from(hexKey, 'hex')
  const macExpected = createHmac('sha256', key).update(payloadB64).digest('base64url')
  const a = Buffer.from(macGiven)
  const b = Buffer.from(macExpected)
  if (a.length !== b.length) return null
  if (!timingSafeEqual(a, b)) return null
  try {
    return Buffer.from(payloadB64, 'base64url').toString('utf8')
  } catch {
    return null
  }
}
