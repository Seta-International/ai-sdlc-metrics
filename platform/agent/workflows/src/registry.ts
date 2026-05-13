import type { BuiltWorkflow } from './create-workflow'
import { WorkflowBuildError } from './errors'
import { setPerTenantConcurrency } from './runner/queue'

class WorkflowRegistry {
  #byId = new Map<string, BuiltWorkflow<unknown, unknown>>()

  register<TIn, TOut>(wf: BuiltWorkflow<TIn, TOut>): void {
    if (this.#byId.has(wf.id)) {
      throw new WorkflowBuildError(`workflow already registered: ${wf.id}`)
    }
    this.#byId.set(wf.id, wf as unknown as BuiltWorkflow<unknown, unknown>)
  }

  get(id: string): BuiltWorkflow<unknown, unknown> | undefined {
    return this.#byId.get(id)
  }

  list(): ReadonlyArray<{ id: string }> {
    return [...this.#byId.values()].map((w) => ({ id: w.id }))
  }

  configure(opts: { perTenantConcurrency?: number }): void {
    if (opts.perTenantConcurrency !== undefined) {
      setPerTenantConcurrency(opts.perTenantConcurrency)
    }
  }

  __resetForTests(): void {
    this.#byId.clear()
  }
}

export const workflowRegistry = new WorkflowRegistry()
