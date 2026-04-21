/**
 * SubAgentRegistry — aggregates, validates, and freezes sub-agent declarations
 * at module boot time (Plan 02 §4).
 *
 * Descriptor aggregation convention (R-02.6 — registry built from module-scoped
 * barrel files, aggregated by agents.module.ts):
 *   Each domain module owns an `agent/sub-agents/` directory with a barrel
 *   `index.ts` that re-exports all `defineSubAgent(...)` results. The
 *   `agents.module.ts` imports from every module barrel and concatenates the
 *   arrays into the `descriptors` list passed to `boot()`. Adding a new
 *   sub-agent to an existing module requires only:
 *     1. Add a new file in `modules/<domain>/agent/sub-agents/<name>.ts`.
 *     2. Re-export it from `modules/<domain>/agent/sub-agents/index.ts`.
 *   Adding sub-agents for a new domain module additionally requires a new
 *   import and descriptor entry in `agents.module.ts`.
 *
 * Lives in `infrastructure/` because it is NestJS-injectable; it has zero
 * domain logic — it is purely a lookup/validation container.
 */

import { Injectable, Logger } from '@nestjs/common'
import type { ValidatedSubAgentConfig } from '../../domain/services/sub-agent-factory'
import type { ToolRegistry } from '../tool-registry/tool-registry'

// ─── DI token ─────────────────────────────────────────────────────────────────

export const SUB_AGENT_REGISTRY = Symbol('SUB_AGENT_REGISTRY')

// ─── Validation error ──────────────────────────────────────────────────────────

/**
 * Thrown by `SubAgentRegistry.boot` when any invariant (R-02.6..R-02.9) is
 * violated. Boot must fail loud — a misconfigured registry must never serve
 * a production request.
 */
export class SubAgentRegistryValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SubAgentRegistryValidationError'
  }
}

// ─── SubAgentRegistry ─────────────────────────────────────────────────────────

@Injectable()
export class SubAgentRegistry {
  private readonly logger = new Logger(SubAgentRegistry.name)
  private readonly _map = new Map<string, ValidatedSubAgentConfig>()
  private _frozen = false

  // ─── Boot ────────────────────────────────────────────────────────────────────

  /**
   * Aggregates, validates, and freezes the sub-agent registry.
   *
   * Must be called exactly once after `ToolRegistry.loadFromRouter` has run,
   * because the tool-resolvability check (R-02.9) queries the tool registry.
   *
   * Invariants enforced (any violation throws `SubAgentRegistryValidationError`):
   *   R-02.7  — Duplicate keys across modules are not allowed.
   *   R-02.9  — Each sub-agent must declare a non-empty `toolScope` and every
   *              tool name in it must exist in the ToolRegistry.
   *
   * Calling `boot` a second time throws immediately — double-boot is a bug.
   *
   * @throws {SubAgentRegistryValidationError} on any invariant violation.
   */
  boot(descriptors: ReadonlyArray<ValidatedSubAgentConfig>, toolRegistry: ToolRegistry): void {
    if (this._frozen) {
      throw new SubAgentRegistryValidationError(
        'SubAgentRegistry.boot called more than once. Double-boot is not allowed.',
      )
    }

    // Guard against an empty-deploy: at least one sub-agent must be registered.
    if (descriptors.length === 0) {
      throw new SubAgentRegistryValidationError(
        'SubAgentRegistry.boot: no sub-agents provided. ' +
          'At least one sub-agent declaration is required to prevent an empty-deploy footgun.',
      )
    }

    const violations: string[] = []

    for (const descriptor of descriptors) {
      const key = descriptor.key as string

      // R-02.7: key collision across modules is not allowed.
      if (this._map.has(key)) {
        violations.push(
          `Duplicate sub-agent key "${key}": each sub-agent key must be unique across all modules.`,
        )
        continue
      }

      // R-02.9: toolScope must be non-empty and every tool must be resolvable.
      if (descriptor.toolScope.length === 0) {
        violations.push(
          `Sub-agent "${key}" has an empty toolScope. Each sub-agent must declare at least one tool.`,
        )
      }

      for (const toolName of descriptor.toolScope) {
        if (!toolRegistry.getDescriptor(toolName)) {
          violations.push(
            `Sub-agent "${key}" toolScope references unknown tool: "${toolName}". ` +
              'Register the tool via .meta({ agent: {...} }) on the tRPC procedure.',
          )
        }
      }

      this._map.set(key, descriptor)
    }

    if (violations.length > 0) {
      throw new SubAgentRegistryValidationError(
        `SubAgentRegistry boot validation failed (${violations.length} violation(s)):\n` +
          violations.join('\n'),
      )
    }

    Object.freeze(this._map)
    this._frozen = true

    this.logger.log(
      `SubAgentRegistry booted successfully. ${this._map.size} sub-agent(s) registered: ` +
        [...this._map.keys()].join(', '),
    )
  }

  // ─── Public surface ───────────────────────────────────────────────────────────

  /**
   * Returns a frozen snapshot of all registered sub-agent configs.
   * The returned array is new on each call but its contents are frozen configs.
   */
  list(): ReadonlyArray<ValidatedSubAgentConfig> {
    return Object.freeze([...this._map.values()])
  }

  /**
   * Looks up a sub-agent by key. Returns `undefined` if not found.
   */
  get(key: string): ValidatedSubAgentConfig | undefined {
    return this._map.get(key)
  }

  /**
   * Returns true if a sub-agent with the given key is registered.
   */
  has(key: string): boolean {
    return this._map.has(key)
  }
}
