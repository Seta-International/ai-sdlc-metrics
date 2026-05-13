import { createHash } from 'node:crypto'
import type { TransactionSql } from 'postgres'
import type { SerializedError, WorkflowStepRow } from '../schema'

export function hashStepInput(value: unknown): string {
  let json: string
  try {
    json = JSON.stringify(value) ?? 'undefined'
  } catch {
    json = '<unserializable>'
  }
  return createHash('sha256').update(json).digest('hex')
}

export interface UpsertStepStartArgs {
  runId: string
  stepId: string
  tenantId: string
  workflowId: string
  inputHash: string
}

export async function upsertStepStart(
  tx: TransactionSql,
  args: UpsertStepStartArgs,
): Promise<void> {
  await tx`
    INSERT INTO agent_workflows.workflow_steps
      (run_id, step_id, tenant_id, workflow_id, status, input_hash, output, error, started_at, finished_at)
    VALUES (
      ${args.runId},
      ${args.stepId},
      ${args.tenantId},
      ${args.workflowId},
      'running',
      ${args.inputHash},
      NULL,
      NULL,
      now(),
      NULL
    )
    ON CONFLICT (run_id, step_id) DO UPDATE SET
      status = 'running',
      input_hash = EXCLUDED.input_hash,
      started_at = now(),
      output = NULL,
      error = NULL,
      finished_at = NULL
  `
}

export type StepTerminalPatch =
  | { status: 'completed'; output: unknown }
  | { status: 'failed'; error: SerializedError }
  | { status: 'suspended' }

export async function updateStepTerminal(
  tx: TransactionSql,
  runId: string,
  stepId: string,
  patch: StepTerminalPatch,
): Promise<void> {
  if (patch.status === 'completed') {
    await tx`
      UPDATE agent_workflows.workflow_steps
      SET status = 'completed',
          output = ${tx.json(patch.output as never)},
          finished_at = now()
      WHERE run_id = ${runId} AND step_id = ${stepId}
    `
    return
  }
  if (patch.status === 'failed') {
    await tx`
      UPDATE agent_workflows.workflow_steps
      SET status = 'failed',
          error = ${tx.json(patch.error as never)},
          finished_at = now()
      WHERE run_id = ${runId} AND step_id = ${stepId}
    `
    return
  }
  await tx`
    UPDATE agent_workflows.workflow_steps
    SET status = 'suspended',
        finished_at = now()
    WHERE run_id = ${runId} AND step_id = ${stepId}
  `
}

export type { WorkflowStepRow }
