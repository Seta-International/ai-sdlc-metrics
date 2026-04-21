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
import { trace } from '@opentelemetry/api'
import type { ValidatedSubAgentConfig } from '../../domain/services/sub-agent-factory'
import type { ModelChoice, SubAgentKey, TenantContext } from '../../domain/services/sub-agent-types'
import { canonicalize } from '../cache/canonical-args'
import { recordSubAgentHidden } from '../observability/gateway-metrics'
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

// ─── resolveForSession types ──────────────────────────────────────────────────

/**
 * Options accepted by `SubAgentRegistry.resolveForSession` (Plan 02 §4).
 *
 * `surface` is required — the caller (Task 10 orchestrator) knows the originating
 * surface and must pass it explicitly. No default is applied here.
 */
export interface ResolveForSessionOpts {
  readonly tenantId: string
  readonly userId: string
  readonly surface: TenantContext['surface']
  /** Tenant-enabled module names. Source: admin module config. */
  readonly enabledModules: ReadonlySet<string>
  /**
   * Full set of permission keys the role is allowed to call.
   * Each tool's `.meta.permission` is checked against this set.
   */
  readonly roleAllowedPermissions: ReadonlySet<string>
  /**
   * Per-sub-agent prompt variables, keyed by sub-agent key.
   * If a key is absent the sub-agent receives an empty variable map `{}`.
   */
  readonly promptVariables: ReadonlyMap<SubAgentKey, Record<string, unknown>>
}

/**
 * A single entry in the array returned by `resolveForSession`.
 *
 * Narrowing contract (stage b filtering):
 *   The `config` field is the ORIGINAL, UNMODIFIED `ValidatedSubAgentConfig`.
 *   Stage (b) narrows the EFFECTIVE scope internally to determine whether the
 *   sub-agent survives stage (c), but does NOT mutate the config object and does
 *   NOT expose a separate `effectiveToolScope` field — narrowing is visible only
 *   via stage (c)'s empty-scope drop. Callers that need the effective scope can
 *   intersect `config.toolScope` with `roleAllowedPermissions` themselves.
 */
export interface ResolvedSubAgent {
  readonly config: ValidatedSubAgentConfig
  /** Static model value, or the result of calling a function-valued model with TenantContext. */
  readonly resolvedModel: ModelChoice
  /** `promptTemplate.body` with `{{varName}}` tokens replaced by validated variables. */
  readonly resolvedPromptBody: string
  /**
   * SHA-256 hex hash of `{ key, resolvedPromptBody, toolScope }`.
   * Deterministic — same inputs always produce the same hash (R-02.15, R-02.16).
   */
  readonly subAgentPromptHash: string
}

// ─── SubAgentRegistry ─────────────────────────────────────────────────────────

@Injectable()
export class SubAgentRegistry {
  private readonly logger = new Logger(SubAgentRegistry.name)
  private readonly _map = new Map<string, ValidatedSubAgentConfig>()
  private _frozen = false
  private _toolRegistry: ToolRegistry | undefined

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
    this._toolRegistry = toolRegistry

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

  // ─── resolveForSession ────────────────────────────────────────────────────────

  /**
   * Returns the tenant-resolved subset of sub-agents for a given session context.
   *
   * Applies a 3-stage filter (R-02.9a) to each registered sub-agent:
   *
   *   Stage (a) — Module toggle: if EVERY tool in the sub-agent's `toolScope`
   *     belongs to a tenant-disabled module, the sub-agent is dropped entirely.
   *     Module membership is derived from the tool name's first dot-separated
   *     segment (e.g. `planner.personal.listTasks` → module `'planner'`).
   *     Sub-agents with mixed scopes (tools in both enabled and disabled modules)
   *     survive this stage.
   *
   *   Stage (b) — Role permission filter: the effective tool scope is the subset
   *     of `toolScope` whose `.meta.permission` key is in `roleAllowedPermissions`.
   *     The ORIGINAL `config` is NOT mutated — narrowing is internal only.
   *
   *   Stage (c) — Empty-scope drop: if the effective scope after stages (a)+(b)
   *     has zero tools, the sub-agent is dropped.
   *
   * For each surviving sub-agent, the method resolves the model (evaluating
   * function-valued models with the provided `TenantContext`), renders the prompt
   * body by substituting `{{varName}}` tokens after Zod-validating the variables,
   * and computes a deterministic per-sub-agent prompt hash.
   *
   * Observability: emits OTel span attributes on the active span (if any) and
   * increments `agent_sub_agent_hidden_total` for each hidden sub-agent.
   *
   * @throws {Error} if prompt variable validation fails for any surviving sub-agent.
   */
  resolveForSession(opts: ResolveForSessionOpts): ReadonlyArray<ResolvedSubAgent> {
    if (!this._frozen || !this._toolRegistry) {
      throw new SubAgentRegistryValidationError(
        'SubAgentRegistry.resolveForSession called before boot(). Call boot() first.',
      )
    }

    const { tenantId, surface, enabledModules, roleAllowedPermissions, promptVariables } = opts
    const toolRegistry = this._toolRegistry

    const totalAvailable = this._map.size
    const hiddenByModule: Array<{ module: string; sub_agent_key: string }> = []
    const hiddenByPermission: string[] = []
    const resolved: ResolvedSubAgent[] = []

    for (const config of this._map.values()) {
      const key = config.key as string

      // ── Stage (a): Module toggle filter ─────────────────────────────────────
      // A sub-agent is dropped if EVERY tool in its toolScope belongs to a
      // disabled module. Mixed scopes (tools spanning enabled + disabled modules)
      // survive; only those tools in disabled modules are excluded in stage (b).
      const allToolsDisabled = config.toolScope.every((toolName) => {
        const toolModule = toolName.split('.')[0] ?? ''
        return !enabledModules.has(toolModule)
      })

      if (allToolsDisabled) {
        // Collect the distinct modules that caused the drop (for span attrs)
        const disabledModules = [...new Set(config.toolScope.map((t) => t.split('.')[0] ?? ''))]
        for (const mod of disabledModules) {
          hiddenByModule.push({ module: mod, sub_agent_key: key })
        }
        recordSubAgentHidden(tenantId, key, 'module_disabled')
        this.logger.debug(
          `resolveForSession: sub-agent "${key}" dropped — all tools in disabled module(s): ${disabledModules.join(', ')}`,
        )
        continue
      }

      // ── Stage (b): Role permission filter ────────────────────────────────────
      // Build the effective tool scope: only tools whose permission key is in
      // roleAllowedPermissions. The original config is NOT mutated.
      const effectiveToolScope = config.toolScope.filter((toolName) => {
        const descriptor = toolRegistry.getDescriptor(toolName)
        if (!descriptor) return false
        return roleAllowedPermissions.has(descriptor.permission)
      })

      // ── Stage (c): Empty-scope drop ───────────────────────────────────────────
      if (effectiveToolScope.length === 0) {
        hiddenByPermission.push(key)
        recordSubAgentHidden(tenantId, key, 'permission_empty_scope')
        this.logger.debug(
          `resolveForSession: sub-agent "${key}" dropped — no tools permitted by role`,
        )
        continue
      }

      // ── Model resolution ──────────────────────────────────────────────────────
      const tenantContext: TenantContext = { tenantId, surface }
      const resolvedModel: ModelChoice =
        typeof config.model === 'function' ? config.model(tenantContext) : config.model

      // ── Prompt body rendering ─────────────────────────────────────────────────
      const rawVars = promptVariables.get(config.key as SubAgentKey) ?? {}
      const parseResult = config.promptTemplate.variables.safeParse(rawVars)
      if (!parseResult.success) {
        throw new Error(
          `resolveForSession: prompt variable validation failed for sub-agent "${key}": ` +
            parseResult.error.message,
        )
      }
      const validatedVars = parseResult.data as Record<string, unknown>

      const resolvedPromptBody = config.promptTemplate.body.replace(
        /\{\{(\w+)\}\}/g,
        (match, varName: string) => {
          if (Object.prototype.hasOwnProperty.call(validatedVars, varName)) {
            return String(validatedVars[varName])
          }
          // Unknown tokens are left as-is (Zod schema is the authority)
          return match
        },
      )

      // ── Sub-agent prompt hash ─────────────────────────────────────────────────
      // Input: { key, resolvedPromptBody, toolScope: [...config.toolScope] }
      // Uses the full config.toolScope (not the filtered effectiveToolScope) so
      // the hash is stable across role changes — per-sub-agent hash pins the
      // content contract, not the role-narrowed scope.
      const hashInput = {
        key,
        resolvedPromptBody,
        toolScope: [...config.toolScope],
      }
      const { hash: subAgentPromptHash } = canonicalize(hashInput)

      resolved.push({ config, resolvedModel, resolvedPromptBody, subAgentPromptHash })
    }

    // ── Observability: span attributes ────────────────────────────────────────
    const activeSpan = trace.getActiveSpan()
    if (activeSpan) {
      activeSpan.setAttributes({
        'agent.sub_agent_count_available': totalAvailable,
        'agent.sub_agent_count_selected': resolved.length,
        'agent.router.sub_agent_hidden_by_module': JSON.stringify(hiddenByModule),
        'agent.router.sub_agent_hidden_by_permission': JSON.stringify(hiddenByPermission),
      })
    }

    return Object.freeze(resolved)
  }
}
