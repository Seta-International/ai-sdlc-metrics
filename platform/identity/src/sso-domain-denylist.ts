export const SSO_EMAIL_DOMAIN_DENYLIST = new Set<string>([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'yahoo.co.uk',
  'ymail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'proton.me',
  'protonmail.com',
  'aol.com',
  'gmx.com',
  'mail.com',
  'qq.com',
  '163.com',
])

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/

export function normalizeEmailDomain(input: string): string | null {
  if (typeof input !== 'string') return null
  let d = input.trim().toLowerCase()
  if (d.endsWith('.')) d = d.slice(0, -1)
  if (!DOMAIN_RE.test(d)) return null
  return d
}

export function isDeniedSsoEmailDomain(input: string): boolean {
  const d = normalizeEmailDomain(input)
  if (!d) return true
  return SSO_EMAIL_DOMAIN_DENYLIST.has(d)
}
