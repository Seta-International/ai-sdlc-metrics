export const TASK_DEPENDENCY_REPOSITORY = Symbol('ITaskDependencyRepository')

export type DependencyKind = 'finish_to_start' | 'start_to_start' | 'finish_to_finish'

export interface DependencyEdge {
  from: string
  to: string
  kind: DependencyKind
}

export interface DependencyRecord {
  fromTaskId: string
  toTaskId: string
  kind: DependencyKind
  tenantId: string
  createdBy: string // actor id of the user who created this dependency
}

export interface ITaskDependencyRepository {
  add(record: DependencyRecord): Promise<void>
  remove(
    fromTaskId: string,
    toTaskId: string,
    kind: DependencyKind,
    tenantId: string,
  ): Promise<void>
  exists(
    fromTaskId: string,
    toTaskId: string,
    kind: DependencyKind,
    tenantId: string,
  ): Promise<boolean>
  listEdgesForPlan(planId: string, tenantId: string): Promise<DependencyEdge[]>
  listForTask(
    taskId: string,
    tenantId: string,
  ): Promise<{ predecessors: DependencyRecord[]; successors: DependencyRecord[] }>
}
