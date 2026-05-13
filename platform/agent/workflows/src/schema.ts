import { tenantUser } from '@seta/db'
import { sql } from 'drizzle-orm'
import {
  index,
  jsonb,
  pgPolicy,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

export type SerializedStepGraph = Array<
  { kind: 'single'; stepId: string } | { kind: 'parallel'; branches: string[] }
>

export type SerializedError = {
  name: string
  message: string
  stack?: string
  cause?: SerializedError
}

export type StepResultRow =
  | { status: 'completed'; output: unknown; finishedAt: string }
  | { status: 'failed'; error: SerializedError; finishedAt: string }
  | { status: 'suspended'; finishedAt: string }
  | { status: 'running'; startedAt: string }

export type ResumeLabelRef = { stepId: string; executionPath: number[] }

export const agentWorkflowsSchema = pgSchema('agent_workflows')

export const workflowSnapshots = agentWorkflowsSchema.table(
  'workflow_snapshots',
  {
    runId: uuid('run_id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    workflowId: text('workflow_id').notNull(),
    serializedStepGraph: jsonb('serialized_step_graph').$type<SerializedStepGraph>().notNull(),
    activePaths: jsonb('active_paths').$type<number[]>().notNull(),
    suspendedPaths: jsonb('suspended_paths').$type<Record<string, number[]>>().notNull(),
    stepResults: jsonb('step_results').$type<Record<string, StepResultRow>>().notNull(),
    resumeLabels: jsonb('resume_labels')
      .$type<Record<string, ResumeLabelRef>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: text('status', {
      enum: ['running', 'suspended', 'completed', 'failed', 'bailed'],
    }).notNull(),
    error: jsonb('error').$type<SerializedError | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('wf_snapshots_tenant_status_updated_idx').on(t.tenantId, t.status, t.updatedAt.desc()),
    index('wf_snapshots_workflow_status_idx').on(t.tenantId, t.workflowId, t.status),
    pgPolicy('tenant_isolation_wf_snapshots', {
      as: 'permissive',
      to: tenantUser,
      for: 'all',
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
      withCheck: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ],
)

export const workflowSteps = agentWorkflowsSchema.table(
  'workflow_steps',
  {
    runId: uuid('run_id').notNull(),
    stepId: text('step_id').notNull(),
    tenantId: uuid('tenant_id').notNull(),
    workflowId: text('workflow_id').notNull(),
    status: text('status', { enum: ['running', 'completed', 'failed', 'suspended'] }).notNull(),
    inputHash: text('input_hash').notNull(),
    output: jsonb('output'),
    error: jsonb('error').$type<SerializedError | null>(),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.runId, t.stepId] }),
    index('wf_steps_tenant_run_idx').on(t.tenantId, t.runId),
    pgPolicy('tenant_isolation_wf_steps', {
      as: 'permissive',
      to: tenantUser,
      for: 'all',
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
      withCheck: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ],
)

export type WorkflowSnapshotRow = typeof workflowSnapshots.$inferSelect
export type NewWorkflowSnapshot = typeof workflowSnapshots.$inferInsert
export type WorkflowStepRow = typeof workflowSteps.$inferSelect
export type NewWorkflowStep = typeof workflowSteps.$inferInsert
