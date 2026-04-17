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
    return new SignJWT({ ...payload, iat: now, exp: now + this.ttlSeconds })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setExpirationTime(now + this.ttlSeconds)
      .sign(this.secret)
  }

  async verify(token: string): Promise<SessionPayload | null> {
    try {
      const { payload } = await jwtVerify(token, this.secret, { algorithms: ['HS256'] })
      return {
        sub: payload.sub as string,
        tid: payload['tid'] as string,
        tenantName: payload['tenantName'] as string,
        displayName: payload['displayName'] as string,
        email: payload['email'] as string,
        roles: payload['roles'] as string[],
        provider: payload['provider'] as string,
        iat: payload.iat as number,
        exp: payload.exp as number,
      }
    } catch {
      return null
    }
  }
}
