/**
 * Manages SetaScorer instances with registration-time enforcement.
 *
 * Registration rules:
 *   1. kind: 'llm-judge' + role 'iterative-topology-exit-gate' → always rejected
 *   2. kind: 'llm-judge' + scope != 'test' + metaEvalAgreement < 0.95 → rejected
 *   3. Duplicate id → rejected
 *
 * Audit events: agent.scorer_registered on register, agent.scorer_demoted on demote.
 * Persistence: upserts/demotes via ScorerRegistrationRepository.
 */

import { Injectable, Inject } from '@nestjs/common'
import type { SetaScorer, ScorerKind } from '../../domain/scorer-types'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import {
  SCORER_REGISTRATION_REPOSITORY,
  type ScorerRegistrationRepository,
} from '../../domain/repositories/scorer-registration.repository'

export const SCORER_REGISTRY = Symbol('SCORER_REGISTRY')

// Nil-UUID-based stable identifiers for system-level audit events that have
// no real tenant or human actor (e.g. scorer registration at boot time).
const SCORER_SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000001'
const SCORER_SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000'

export class ScorerRegistrationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ScorerRegistrationError'
  }
}

export interface ScorerRegistrationOpts {
  /**
   * Optional target role. If set to 'iterative-topology-exit-gate', any
   * `kind: 'llm-judge'` scorer is rejected at registration time.
   */
  role?: string
  /**
   * Required for `kind: 'llm-judge'` scorers with scope other than 'test'.
   * Must be >= 0.95.
   */
  metaEvalAgreement?: number
}

@Injectable()
export class ScorerRegistry {
  private readonly scorers = new Map<string, SetaScorer>()

  constructor(
    private readonly audit: KernelAuditFacade,
    @Inject(SCORER_REGISTRATION_REPOSITORY)
    private readonly scorerRegistrationRepo: ScorerRegistrationRepository,
  ) {}

  /**
   * Register a scorer with optional role/metaEvalAgreement opts.
   * Persists the registration and emits an audit event.
   *
   * @throws {ScorerRegistrationError} on any registration rule violation.
   */
  async register(scorer: SetaScorer, opts?: ScorerRegistrationOpts): Promise<void> {
    this.enforceRegistrationRules(scorer, opts)
    this.scorers.set(scorer.id, scorer)
    await this.scorerRegistrationRepo.upsert({
      scorerId: scorer.id,
      name: scorer.name,
      kind: scorer.kind,
      scope: scorer.scope,
      metaEvalAgreement: opts?.metaEvalAgreement ?? null,
      status: 'provisional',
    })
    await this.audit.recordEvent({
      tenantId: SCORER_SYSTEM_TENANT_ID,
      actorId: SCORER_SYSTEM_ACTOR_ID,
      eventType: 'agent.scorer_registered',
      module: 'agents',
      subjectId: scorer.id,
      payload: { name: scorer.name, kind: scorer.kind, scope: scorer.scope },
    })
  }

  /**
   * Demote a scorer: removes from in-memory map, persists demotion, emits audit event.
   */
  async demote(scorerId: string): Promise<void> {
    this.scorers.delete(scorerId)
    await this.scorerRegistrationRepo.demote(scorerId)
    await this.audit.recordEvent({
      tenantId: SCORER_SYSTEM_TENANT_ID,
      actorId: SCORER_SYSTEM_ACTOR_ID,
      eventType: 'agent.scorer_demoted',
      module: 'agents',
      subjectId: scorerId,
      payload: {},
    })
  }

  /** All registered scorers, keyed by id. */
  getAll(): ReadonlyMap<string, SetaScorer> {
    return this.scorers
  }

  /** All scorers with kind === 'deterministic'. */
  getDeterministic(): SetaScorer[] {
    return Array.from(this.scorers.values()).filter(
      (s): s is SetaScorer & { kind: Extract<ScorerKind, 'deterministic'> } =>
        s.kind === 'deterministic',
    )
  }

  /** All scorers with kind === 'llm-judge'. */
  getLlmJudge(): SetaScorer[] {
    return Array.from(this.scorers.values()).filter(
      (s): s is SetaScorer & { kind: Extract<ScorerKind, 'llm-judge'> } => s.kind === 'llm-judge',
    )
  }

  /** Look up a scorer by id, or undefined if not found. */
  findById(id: string): SetaScorer | undefined {
    return this.scorers.get(id)
  }

  private enforceRegistrationRules(scorer: SetaScorer, opts?: ScorerRegistrationOpts): void {
    if (this.scorers.has(scorer.id)) {
      throw new ScorerRegistrationError(`Scorer with id ${scorer.id} is already registered`)
    }

    if (scorer.kind === 'llm-judge') {
      if (opts?.role === 'iterative-topology-exit-gate') {
        throw new ScorerRegistrationError(
          'LLM-judge scorers cannot be registered as iterative-topology exit gates (§3.1 invariant 4, plan 12)',
        )
      }

      // llm-judge + scope != 'test' requires metaEvalAgreement >= 0.95.
      if (scorer.scope !== 'test') {
        if (opts?.metaEvalAgreement === undefined || opts.metaEvalAgreement < 0.95) {
          throw new ScorerRegistrationError(
            'LLM-judge scorers with scope other than test require metaEvalAgreement >= 0.95',
          )
        }
      }
    }
  }
}
