import { Injectable, Inject } from '@nestjs/common'
import {
  L3_PREFERENCE_ALLOWLIST,
  type L3PreferenceKey,
} from '../../domain/entities/l3-preference.entity'
import {
  L3_PREFERENCE_REPOSITORY,
  type L3PreferenceRepository,
} from '../../domain/repositories/l3-preference.repository'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'

/**
 * L3PreferenceService — application boundary for user L3 preferences.
 *
 * Enforces the allowlist before delegating to the repository.
 * tRPC mutations MUST NOT use `.meta({ agent })` — they call this service
 * only from user-facing procedures, keeping agents structurally unable to
 * write preferences.
 */
@Injectable()
export class L3PreferenceService {
  constructor(
    @Inject(L3_PREFERENCE_REPOSITORY)
    private readonly repo: L3PreferenceRepository,
    private readonly audit: KernelAuditFacade,
  ) {}

  /**
   * Set a user preference. Throws if `key` is not in `L3_PREFERENCE_ALLOWLIST`.
   */
  async set(opts: {
    tenantId: string
    userId: string
    key: string
    value: unknown
    updatedBy: string
  }): Promise<void> {
    this.assertAllowlisted(opts.key)

    await this.repo.set({
      tenantId: opts.tenantId,
      userId: opts.userId,
      key: opts.key,
      value: opts.value,
      updatedBy: opts.updatedBy,
    })

    await this.audit.recordEvent({
      tenantId: opts.tenantId,
      actorId: opts.updatedBy,
      eventType: 'agent.l3_preference_set',
      module: 'agents',
      subjectId: opts.userId,
      payload: { key: opts.key },
    })
  }

  async get(opts: { tenantId: string; userId: string; key: string }): Promise<unknown | null> {
    return this.repo.get(opts)
  }

  async getAll(opts: { tenantId: string; userId: string }): Promise<Record<string, unknown>> {
    return this.repo.getAll(opts)
  }

  async delete(opts: { tenantId: string; userId: string; key?: string }): Promise<void> {
    await this.repo.delete(opts)
  }

  private assertAllowlisted(key: string): asserts key is L3PreferenceKey {
    if (!(L3_PREFERENCE_ALLOWLIST as readonly string[]).includes(key)) {
      throw new Error(
        `Unknown preference key "${key}" — not in allowlist. Valid keys: ${L3_PREFERENCE_ALLOWLIST.join(', ')}`,
      )
    }
  }
}
