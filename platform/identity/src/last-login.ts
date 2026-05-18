import { z } from 'zod'
import { signCookie, verifyCookie } from './cookie'

export const LAST_LOGIN_COOKIE_NAME = 'seta_last_login'

export const LastLoginHint = z.object({
  email: z.string().email(),
  provider: z.literal('entra'),
  tenantDisplayName: z.string().min(1),
  ts: z.number().int(),
})
export type LastLoginHint = z.infer<typeof LastLoginHint>

export function signLastLoginHint(payload: unknown, hexKey: string): string {
  return signCookie(JSON.stringify(payload), hexKey)
}

export function readLastLoginHint(
  signed: string | undefined,
  hexKey: string,
): LastLoginHint | null {
  if (!signed) return null
  const raw = verifyCookie(signed, hexKey)
  if (!raw) return null
  try {
    const parsed = LastLoginHint.safeParse(JSON.parse(raw))
    if (!parsed.success) return null
    return parsed.data
  } catch {
    return null
  }
}
