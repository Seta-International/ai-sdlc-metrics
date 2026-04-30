import { Injectable, Logger } from '@nestjs/common'
import type { AgentToolDescriptor, AgentToolMeta } from '../../../../common/trpc/agent-tool-meta'
import { permissionMatchesAnyPrefix } from './permission-match'
import { isZodObject, resolveRootSchema } from './zod-schema-utils'

/**
 * DI token for `ToolRegistry`. Used by services that depend on the registry
 * via constructor injection (e.g. `SubAgentRunnerAdapter`).
 */
export const TOOL_REGISTRY = Symbol('TOOL_REGISTRY')

/**
 * Thrown by `loadFromRouter` when one or more agent tool procedures fail
 * boot-time validation. Boot must fail loud.
 */
export class ToolRegistryValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ToolRegistryValidationError'
  }
}

/**
 * tRPC v11 procedure definition as accessed via `router._def.procedures[name]._def`.
 * Typed minimally; we only read the fields we actually use.
 */
interface ProcedureDef {
  type: 'query' | 'mutation' | 'subscription'
  meta?: {
    permission?: string
    agent?: AgentToolMeta
  }
  inputs: unknown[]
}

interface ProcedureLike {
  _def: ProcedureDef
}

interface RouterDef {
  procedures: Record<string, ProcedureLike>
}

interface RouterLike {
  _def: RouterDef
}

export interface ResolveMenuOptions {
  /** Permission-key prefixes scoped to the sub-agent, e.g. ['planner:task', 'people:profile:read'] */
  subAgentScope: ReadonlyArray<string>
  /** User's role-derived permission set assembled by the caller via KernelQueryFacade.getRolePermissions */
  roleAllowedPermissions: ReadonlySet<string>
  surfaceContext: { screen: string; selection?: unknown }
}

/**
 * ToolRegistry — harvests tRPC procedures carrying `.meta({ agent: {...} })` from
 * the app router at boot and exposes lookup + scoped menu resolution for sub-agents.
 *
 * Usage:
 *   const registry = new ToolRegistry()
 *   registry.loadFromRouter(getAppRouter())  // called in AgentsModule.onModuleInit
 *
 * Wiring note: AgentsModule should inject ToolRegistry, then in onModuleInit call
 *   this.toolRegistry.loadFromRouter(getAppRouter())
 * after the permission-enforcing routers have been swapped in (i.e. after TrpcModule.onModuleInit).
 * NestJS module init order must be: TrpcModule first, AgentsModule second.
 */
@Injectable()
export class ToolRegistry {
  private readonly logger = new Logger(ToolRegistry.name)
  private readonly _descriptors = new Map<string, AgentToolDescriptor>()
  private _loaded = false

  // ─── Boot-time loader ──────────────────────────────────────────────────────

  /**
   * Walks the tRPC app router, harvests procedures with `.meta.agent` set,
   * validates required fields, and builds the in-memory descriptor table.
   *
   * Idempotence policy: calling `loadFromRouter` a second time with the same
   * router is a no-op (returns immediately). This prevents accidental accumulation
   * when the method is called more than once in tests or during hot-reload.
   *
   * @throws {ToolRegistryValidationError} if any agent tool has invalid metadata
   */
  loadFromRouter(router: unknown): void {
    if (this._loaded) {
      this.logger.warn(
        `loadFromRouter called more than once; ignoring subsequent calls (first-wins). Tool count: ${this._descriptors.size}.`,
      )
      return
    }

    const trpcRouter = router as RouterLike
    if (!trpcRouter?._def?.procedures) {
      throw new ToolRegistryValidationError(
        'ToolRegistry.loadFromRouter: router does not expose _def.procedures. ' +
          'Expected a tRPC v11 AnyRouter.',
      )
    }

    const violations: string[] = []
    const procedures = trpcRouter._def.procedures

    for (const [name, proc] of Object.entries(procedures)) {
      const def = proc._def
      const meta = def.meta

      // Only register procedures that have agent metadata
      if (!meta?.agent) {
        continue
      }

      const agent = meta.agent
      const procViolations: string[] = []

      // ── R-01.12: required fields ───────────────────────────────────────────

      if (!meta.permission || meta.permission.trim() === '') {
        procViolations.push('meta.permission is missing or empty')
      }

      if (!agent.whenToUse || agent.whenToUse.trim() === '') {
        procViolations.push('meta.agent.whenToUse is missing or empty')
      }

      if (!agent.whenNotToUse || agent.whenNotToUse.trim() === '') {
        procViolations.push('meta.agent.whenNotToUse is missing or empty')
      }

      if (!Array.isArray(agent.examples) || agent.examples.length === 0) {
        procViolations.push('meta.agent.examples must be an array with at least 1 entry')
      } else {
        agent.examples.forEach((ex, idx) => {
          if (!ex.input || ex.input.trim() === '') {
            procViolations.push(`meta.agent.examples[${idx}].input is empty`)
          }
          if (
            typeof ex.callArgs !== 'object' ||
            ex.callArgs === null ||
            Array.isArray(ex.callArgs)
          ) {
            procViolations.push(`meta.agent.examples[${idx}].callArgs must be a plain object`)
          }
        })
      }

      // ── R-01.18: mutations must declare approvalFreshness ──────────────────

      if (def.type === 'mutation' && agent.approvalFreshness === undefined) {
        procViolations.push(
          'mutation procedures must declare meta.agent.approvalFreshness ' +
            "('revalidate' | 'accept-stale')",
        )
      }

      // ── R-01.30: tenant_id ban — shallow check on root zod object ──────────

      const inputs = def.inputs
      if (Array.isArray(inputs) && inputs.length > 0) {
        const rootSchema = resolveRootSchema(inputs[0])
        if (isZodObject(rootSchema)) {
          if ('tenant_id' in rootSchema._def.shape) {
            procViolations.push(
              'input schema must not contain tenant_id — tenant context is injected via RLS, not args',
            )
          }
        }
      }

      if (procViolations.length > 0) {
        violations.push(`[${name}]: ${procViolations.join('; ')}`)
        continue
      }

      // ── Build descriptor ───────────────────────────────────────────────────

      const descriptor: AgentToolDescriptor = {
        name,
        procedure: def.type === 'mutation' ? 'mutation' : 'query',
        permission: meta.permission as string,
        inputSchema: inputs.length > 0 ? inputs[0] : undefined,
        outputSchema: undefined, // tRPC v11 does not expose output schema at runtime
        meta: agent,
      }

      this._descriptors.set(name, descriptor)
    }

    if (violations.length > 0) {
      throw new ToolRegistryValidationError(
        `ToolRegistry boot validation failed for ${violations.length} tool(s):\n` +
          violations.join('\n'),
      )
    }

    this._loaded = true
  }

  // ─── Public surface ────────────────────────────────────────────────────────

  listAgentTools(): ReadonlyArray<AgentToolDescriptor> {
    return Array.from(this._descriptors.values())
  }

  getDescriptor(toolName: string): AgentToolDescriptor | undefined {
    return this._descriptors.get(toolName)
  }

  /**
   * Deterministic pre-LLM menu scoping.
   *
   * Returns descriptors satisfying ALL THREE filters:
   * 1. Sub-agent scope  — permission starts with one of the `subAgentScope` prefixes
   *    (segment-boundary match: split on ':', check every prefix segment matches)
   * 2. Role-allowed     — permission is in `roleAllowedPermissions`
   * 3. Screen-relevant  — at least one ':'-separated segment of the permission key
   *    appears as a '/'-separated segment of the screen path
   *
   * Result is sorted by `name` ascending for stable ordering.
   */
  resolveMenuFor(opts: ResolveMenuOptions): ReadonlyArray<AgentToolDescriptor> {
    const { subAgentScope, roleAllowedPermissions, surfaceContext } = opts
    // TODO plan-02: refine screen-relevance heuristic once router stubs exist
    const screenSegments = new Set(surfaceContext.screen.split('/').filter(Boolean))

    const results: AgentToolDescriptor[] = []

    for (const descriptor of this._descriptors.values()) {
      const perm = descriptor.permission

      // Filter 1: sub-agent scope — segment-boundary prefix match
      const inScope = permissionMatchesAnyPrefix(perm, subAgentScope)
      if (!inScope) continue

      // Filter 2: role-allowed
      if (!roleAllowedPermissions.has(perm)) continue

      // Filter 3: screen-relevant — at least one permission segment in screen segments
      const permSegments = perm.split(':')
      const screenRelevant = permSegments.some((seg) => screenSegments.has(seg))
      if (!screenRelevant) continue

      results.push(descriptor)
    }

    // Stable sort by name ascending
    return results.sort((a, b) => a.name.localeCompare(b.name))
  }
}

// isPermissionInScope logic lives in permission-match.ts (shared with pipeline steps).
