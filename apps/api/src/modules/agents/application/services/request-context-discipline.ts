import { Injectable } from '@nestjs/common'
import { ClsService } from 'nestjs-cls'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'

export const IDENTITY_KEYS = [
  'tenant_id',
  'user_id',
  'trace_id',
  'delegation_id',
  'surface',
] as const

export type IdentityKey = (typeof IDENTITY_KEYS)[number]

@Injectable()
export class RequestContextDiscipline {
  constructor(
    private readonly cls: ClsService,
    private readonly kernelAuditFacade: KernelAuditFacade,
  ) {}

  /**
   * Safe set — blocks writes to identity keys.
   * Dev: throws. Prod: logs + drops + records audit.
   */
  set<T>(key: string, value: T): void {
    if ((IDENTITY_KEYS as readonly string[]).includes(key)) {
      const isDev = (process.env['NODE_ENV'] ?? 'development') === 'development'
      if (isDev) {
        throw new Error(
          `RequestContext identity write blocked: attempt to set '${key}' from non-middleware code`,
        )
      }
      // Prod: drop write, log warning, persist security audit event
      console.error(`[SECURITY] identity_key_write_attempted: key="${key}" dropped`)
      const tenantId = this.cls.get<string>('tenantId') ?? 'unknown'
      const actorId = this.cls.get<string>('actorId') ?? 'unknown'
      void this.kernelAuditFacade.recordEvent({
        tenantId,
        actorId,
        eventType: 'identity_key_write_attempted',
        module: 'agents',
        subjectId: actorId,
        payload: { key, attempted_value: String(value) },
      })
      return
    }
    this.cls.set(key as Parameters<ClsService['set']>[0], value)
  }

  get<T>(key: string): T | undefined {
    return this.cls.get<T>(key as Parameters<ClsService['get']>[0]) as T | undefined
  }

  /**
   * Middleware-only set — bypasses the identity-key guard.
   * Only call from RlsMiddleware / JWT verifier / pg-boss worker bootstrap.
   */
  setIdentityKey<T>(key: IdentityKey, value: T): void {
    this.cls.set(key as Parameters<ClsService['set']>[0], value)
  }
}
