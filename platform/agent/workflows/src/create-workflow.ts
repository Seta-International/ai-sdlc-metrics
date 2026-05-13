import type { ZodType } from 'zod'
import { WorkflowBuildError } from './errors'
import { type GraphNode, parallel as parallelNode, single } from './graph'
import { type RunInvocationOptions, runWorkflow } from './runner/in-memory'
import type { ParallelOutput } from './types/parallel-output'
import type { Step } from './types/step'

export interface CreateWorkflowOptions<TIn, TOut> {
  id: string
  inputSchema: ZodType<TIn>
  outputSchema: ZodType<TOut>
}

export interface Workflow<TInit, TCurrent, TFinal> {
  then<TNext, TId extends string>(step: Step<TCurrent, TNext, TId>): Workflow<TInit, TNext, TFinal>

  parallel<S extends ReadonlyArray<Step<TCurrent, unknown, string>>>(
    steps: S,
  ): Workflow<TInit, ParallelOutput<S>, TFinal>

  commit(
    this: TCurrent extends TFinal ? Workflow<TInit, TCurrent, TFinal> : never,
  ): BuiltWorkflow<TInit, TFinal>
}

export interface BuiltWorkflow<TInit, TFinal> {
  readonly id: string
  run(input: TInit, opts?: { signal?: AbortSignal }): Promise<TFinal>
  // biome-ignore lint/suspicious/noThenProperty: DSL — typed-never to forbid post-commit chaining
  then(_: never): never
  parallel(_: never): never
  commit(_: never): never
}

interface BuilderState {
  readonly workflowId: string
  readonly inputSchema: ZodType<unknown>
  readonly outputSchema: ZodType<unknown>
  readonly nodes: ReadonlyArray<GraphNode>
}

function collectIds(nodes: ReadonlyArray<GraphNode>): string[] {
  const ids: string[] = []
  for (const n of nodes) {
    if (n.kind === 'single') ids.push(n.step.id)
    else for (const b of n.branches) ids.push(b.id)
  }
  return ids
}

function guardDuplicate(workflowId: string, existing: string[], adding: string[]): void {
  const seen = new Set(existing)
  for (const id of adding) {
    if (seen.has(id)) {
      throw new WorkflowBuildError(`duplicate step id in workflow ${workflowId}: ${id}`)
    }
    seen.add(id)
  }
}

function builderFromState<TInit, TCurrent, TFinal>(
  state: BuilderState,
): Workflow<TInit, TCurrent, TFinal> {
  return {
    // biome-ignore lint/suspicious/noThenProperty: DSL — .then() is the chained-step operator, never awaited
    then(step) {
      guardDuplicate(state.workflowId, collectIds(state.nodes), [step.id])
      return builderFromState({ ...state, nodes: [...state.nodes, single(step)] })
    },
    parallel(steps) {
      const branchIds = steps.map((s) => s.id)
      guardDuplicate(state.workflowId, collectIds(state.nodes), branchIds)
      const node = parallelNode(steps as unknown as ReadonlyArray<Step<unknown, unknown, string>>)
      return builderFromState({ ...state, nodes: [...state.nodes, node] })
    },
    commit() {
      if (state.nodes.length === 0) {
        throw new WorkflowBuildError(`workflow ${state.workflowId}: at least one step required`)
      }
      return buildFinal(state)
    },
  } as Workflow<TInit, TCurrent, TFinal>
}

function buildFinal<TInit, TFinal>(state: BuilderState): BuiltWorkflow<TInit, TFinal> {
  const built: BuiltWorkflow<TInit, TFinal> = {
    id: state.workflowId,
    async run(input: TInit, opts?: RunInvocationOptions): Promise<TFinal> {
      return await runWorkflow<TInit, TFinal>(
        { workflowId: state.workflowId, nodes: state.nodes },
        input,
        opts,
      )
    },
    // biome-ignore lint/suspicious/noThenProperty: DSL — .then() is the chained-step operator
    then() {
      throw new WorkflowBuildError(`workflow ${state.workflowId}: cannot .then() after .commit()`)
    },
    parallel() {
      throw new WorkflowBuildError(
        `workflow ${state.workflowId}: cannot .parallel() after .commit()`,
      )
    },
    commit(_: never) {
      throw new WorkflowBuildError(`workflow ${state.workflowId}: already committed`)
    },
  }
  return built
}

export function createWorkflow<TIn, TOut>(
  opts: CreateWorkflowOptions<TIn, TOut>,
): Workflow<TIn, TIn, TOut> {
  return builderFromState<TIn, TIn, TOut>({
    workflowId: opts.id,
    inputSchema: opts.inputSchema as ZodType<unknown>,
    outputSchema: opts.outputSchema as ZodType<unknown>,
    nodes: [],
  })
}
