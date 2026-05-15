import { WorkflowBuildError } from './errors'
import type { Step } from './types/step'

export interface SingleNode {
  kind: 'single'
  step: Step<unknown, unknown, string>
}

export interface ParallelNode {
  kind: 'parallel'
  branches: ReadonlyArray<Step<unknown, unknown, string>>
}

export type GraphNode = SingleNode | ParallelNode

export function single<TIn, TOut, TId extends string>(step: Step<TIn, TOut, TId>): SingleNode {
  return { kind: 'single', step: step as unknown as Step<unknown, unknown, string> }
}

export function parallel(branches: ReadonlyArray<Step<unknown, unknown, string>>): ParallelNode {
  if (branches.length === 0) {
    throw new WorkflowBuildError('parallel() requires at least one branch')
  }
  const seen = new Set<string>()
  for (const b of branches) {
    if (seen.has(b.id)) {
      throw new WorkflowBuildError(`duplicate step id in parallel branches: ${b.id}`)
    }
    seen.add(b.id)
  }
  return { kind: 'parallel', branches }
}
