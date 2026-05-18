export interface LastLoginHint {
  email: string
  provider: 'entra'
  tenantDisplayName: string
  ts: number
}

const COOKIE_NAME = 'seta_last_login'

function readCookieRaw(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null
  const parts = cookieHeader.split(';')
  for (const part of parts) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    const k = part.slice(0, eq).trim()
    if (k === COOKIE_NAME) return part.slice(eq + 1).trim()
  }
  return null
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '==='.slice((b64.length + 3) % 4)
  if (typeof atob === 'function') {
    const bin = atob(padded)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return new TextDecoder('utf-8').decode(bytes)
  }
  // Browser without atob is unreachable in practice; tests run under Node where atob exists since v16.
  throw new Error('base64 decoding is not supported in this environment')
}

export function readLastLoginHintCookie(cookieHeader?: string): LastLoginHint | null {
  const raw = readCookieRaw(
    cookieHeader ?? (typeof document !== 'undefined' ? document.cookie : undefined),
  )
  if (!raw) return null
  const dot = raw.indexOf('.')
  if (dot < 1) return null
  const payloadB64 = raw.slice(0, dot)
  try {
    const json = JSON.parse(fromBase64Url(payloadB64)) as Partial<LastLoginHint>
    if (
      typeof json.email !== 'string' ||
      json.provider !== 'entra' ||
      typeof json.tenantDisplayName !== 'string' ||
      typeof json.ts !== 'number'
    ) {
      return null
    }
    return json as LastLoginHint
  } catch {
    return null
  }
}

export function clearLastLoginHintCookie(): void {
  if (typeof document === 'undefined') return
  // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API not yet available cross-browser.
  document.cookie = `${COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`
}
