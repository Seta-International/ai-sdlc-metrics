import { createHash } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import {
  type NewWorkflowStep,
  type SerializedError,
  type WorkflowStepRow,
  workflowSteps,
} from '../schema'

export function hashStepInput(value: unknown): string {
  let json: string
  try {
    json = JSON.stringify(value) ?? 'undefined'
  } catch {
    json = '<unserializable>'
  }
  return createHash('sha256').update(json).digest('hex')
}

export interface StepStoreTx {
  insert(table: typeof workflowSteps): {
    values(row: NewWorkflowStep): {
      onConflictDoUpdate(args: { target: unknown; set: Partial<NewWorkflowStep> }): Promise<unknown>
    }
  }
  update(table: typeof workflowSteps): {
    set(patch: Partial<NewWorkflowStep>): {
      where(cond: unknown): Promise<unknown>
    }
  }
}

export interface UpsertStepStartArgs {
  runId: string
  stepId: string
  tenantId: string
  workflowId: string
  inputHash: string
}

export async function upsertStepStart(tx: StepStoreTx, args: UpsertStepStartArgs): Promise<void> {
  await tx
    .insert(workflowSteps)
    .values({
      ...args,
      status: 'running',
      output: null,
      error: null,
      finishedAt: null,
    } as NewWorkflowStep)
    .onConflictDoUpdate({
      target: [workflowSteps.runId, workflowSteps.stepId],
      set: {
        status: 'running',
        inputHash: args.inputHash,
        startedAt: sql`now()` as never,
        output: null,
        error: null,
        finishedAt: null,
      },
    })
}

export type StepTerminalPatch =
  | { status: 'completed'; output: unknown }
  | { status: 'failed'; error: SerializedError }
  | { status: 'suspended' }

export async function updateStepTerminal(
  tx: StepStoreTx,
  runId: string,
  stepId: string,
  patch: StepTerminalPatch,
): Promise<void> {
  const base: Partial<NewWorkflowStep> = { finishedAt: sql`now()` as never }
  const set: Partial<NewWorkflowStep> =
    patch.status === 'completed'
      ? { ...base, status: 'completed', output: patch.output as never }
      : patch.status === 'failed'
        ? { ...base, status: 'failed', error: patch.error }
        : { ...base, status: 'suspended' }
  await tx
    .update(workflowSteps)
    .set(set)
    .where(and(eq(workflowSteps.runId, runId), eq(workflowSteps.stepId, stepId)))
}

export type { WorkflowStepRow }
