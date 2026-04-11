import { Injectable } from '@nestjs/common'
import { SignJWT, jwtVerify } from 'jose'
import type { SessionPayload } from './session-payload'
import { SESSION_MAX_AGE_SECONDS } from './session-payload'

@Injectable()
export class JwtService {
  private readonly secret: Uint8Array

  constructor(
    secretString: string,
    private readonly ttlSeconds: number = SESSION_MAX_AGE_SECONDS,
  ) {
    this.secret = new TextEncoder().encode(secretString)
  }

  async sign(payload: Omit<SessionPayload, 'iat' | 'exp'>): Promise<string> {
    const now = Math.floor(Date.now() / 1000)
    return new SignJWT({ ...payload })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setExpirationTime(now + this.ttlSeconds)
      .sign(this.secret)
  }

  async verify(token: string): Promise<SessionPayload | null> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        algorithms: ['HS256'],
      })
      const p = payload as Record<string, unknown>
      if (
        typeof p['sub'] !== 'string' ||
        typeof p['tid'] !== 'string' ||
        !Array.isArray(p['roles']) ||
        typeof p['provider'] !== 'string'
      ) {
        return null
      }
      return {
        sub: p['sub'],
        tid: p['tid'] as string,
        roles: p['roles'] as string[],
        provider: p['provider'] as string,
        iat: payload.iat as number,
        exp: payload.exp as number,
      }
    } catch {
      return null
    }
  }
}
