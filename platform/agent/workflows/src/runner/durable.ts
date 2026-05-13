import { type Span, SpanStatusCode, trace } from '@opentelemetry/api'
import { recordAudit } from '@seta/audit'
import { type DbSql, withTenant } from '@seta/db'
import { logger as baseLogger, type Logger } from '@seta/observability'
import { tenantContext } from '@seta/tenant'
import { drizzle } from 'drizzle-orm/postgres-js'
import type { Sql, TransactionSql } from 'postgres'
import { v7 as uuidv7 } from 'uuid'
import { actorFromContext } from '../audit/actor'
import {
  WorkflowBailed,
  WorkflowError,
  WorkflowMismatch,
  WorkflowNotSuspended,
  WorkflowResumeContended,
  WorkflowResumeLabelUnknown,
  WorkflowSnapshotNotFound,
  WorkflowSuspended,
} from '../errors'
import type { GraphNode } from '../graph'
import { tryAcquireRunLock } from '../persistence/advisory-lock'
import {
  insertSnapshot,
  readSnapshot,
  type DrizzleTx as SnapshotTx,
  updateSnapshot,
} from '../persistence/snapshot-store'
import {
  hashStepInput,
  type StepStoreTx,
  updateStepTerminal,
  upsertStepStart,
} from '../persistence/step-store'
import { executeWithRetry } from '../retry/apply-retry'
import type { SerializedStepGraph, StepResultRow, WorkflowSnapshotRow } from '../schema'
import { type RunResult, serializeError } from '../types/result'
import type { Step } from '../types/step'
import { awaitRun, registerAwaiter, settleRun } from './awaiter'
import { enqueueRun } from './queue'
import { executeStep, type RunContext } from './step-execution'

const tracer = trace.getTracer('@seta/agent-workflows')

let sqlRef: DbSql | null = null

/** Caller injects the shared pool at boot. */
export function setDurableSql(sql: DbSql | null): void {
  sqlRef = sql
}

function getSql(): DbSql {
  if (!sqlRef) {
    throw new WorkflowError(500, 'durable runner not configured: call setDurableSql() at boot')
  }
  return sqlRef
}

export interface DurableWorkflowDef {
  readonly id: string
  readonly nodes: ReadonlyArray<GraphNode>
}

export interface DurableRunOpts {
  signal?: AbortSignal
  await: boolean
}

export interface ResumeArgs {
  runId: string
  label: string
  payload?: unknown
}

function serializeGraph(nodes: ReadonlyArray<GraphNode>): SerializedStepGraph {
  return nodes.map((n) =>
    n.kind === 'single'
      ? ({ kind: 'single', stepId: n.step.id } as const)
      : ({ kind: 'parallel', branches: n.branches.map((b) => b.id) } as const),
  )
}

function combinedTx(tx: TransactionSql): SnapshotTx & StepStoreTx {
  const db = drizzle(tx as never)
  return db as unknown as SnapshotTx & StepStoreTx
}

function chainSignal(parent: AbortSignal | undefined): AbortController {
  const c = new AbortController()
  if (parent) {
    if (parent.aborted) c.abort(parent.reason)
    else
      parent.addEventListener('abort', () => c.abort(parent.reason), {
        once: true,
      })
  }
  return c
}

// ---------------------------------------------------------------------------
// runDurable — fresh run
// ---------------------------------------------------------------------------

export async function runDurable<TOut>(
  def: DurableWorkflowDef,
  input: unknown,
  opts: DurableRunOpts,
): Promise<RunResult<TOut> | { runId: string }> {
  const sql = getSql()
  const tenantId = tenantContext.getTenantId()
  const runId = uuidv7()
  const logger = baseLogger.child({ workflowId: def.id, runId, tenantId })

  if (opts.await) registerAwaiter(runId)

  await withTenant(sql, tenantId, async (tx) => {
    const acquired = await tryAcquireRunLock(tx, runId)
    if (!acquired) throw new WorkflowResumeContended(runId)

    const cx = combinedTx(tx)
    await insertSnapshot(cx, {
      runId,
      tenantId,
      workflowId: def.id,
      runInput: input as never,
      serializedStepGraph: serializeGraph(def.nodes),
      activePaths: [0],
      suspendedPaths: {},
      stepResults: {},
      resumeLabels: {},
      status: 'running',
      error: null,
    })
    await recordAudit(tx as unknown as Sql, {
      tenantId,
      actor: actorFromContext(),
      operation: 'workflow.started',
      resource: { type: 'workflow_run', ids: [runId] },
      result: 'ok',
      metadata: { workflowId: def.id, inputHash: hashStepInput(input) },
    })
  })

  const controller = chainSignal(opts.signal)
  enqueue(tenantId, def, runId, input, 0, null, undefined, logger, controller, sql)

  if (opts.await) {
    return (await awaitRun(runId)) as RunResult<TOut>
  }
  return { runId }
}

// ---------------------------------------------------------------------------
// resumeDurable — wake a suspended run
// ---------------------------------------------------------------------------

export async function resumeDurable<TOut>(
  def: DurableWorkflowDef,
  args: ResumeArgs,
  opts: DurableRunOpts,
): Promise<RunResult<TOut> | { runId: string }> {
  const sql = getSql()
  const tenantId = tenantContext.getTenantId()
  const logger = baseLogger.child({ workflowId: def.id, runId: args.runId, tenantId })

  if (opts.await) registerAwaiter(args.runId)

  let resumeStepId: string
  let startAtNodeIndex: number
  let stepInput: unknown

  try {
    ;({ resumeStepId, startAtNodeIndex, stepInput } = await withTenant(
      sql,
      tenantId,
      async (tx) => {
        const acquired = await tryAcquireRunLock(tx, args.runId)
        if (!acquired) throw new WorkflowResumeContended(args.runId)

        const cx = combinedTx(tx)
        const snap = await readSnapshot(cx, args.runId)
        if (!snap) throw new WorkflowSnapshotNotFound(args.runId)
        if (snap.workflowId !== def.id) throw new WorkflowMismatch(def.id, snap.workflowId)
        if (snap.status !== 'suspended') throw new WorkflowNotSuspended(args.runId, snap.status)
        const ref = snap.resumeLabels[args.label]
        if (!ref) throw new WorkflowResumeLabelUnknown(args.label)

        const nodeIndex = ref.executionPath[0] ?? 0
        const input = deriveStepInput(snap, nodeIndex)

        const nextSuspended = { ...snap.suspendedPaths }
        delete nextSuspended[ref.stepId]
        const nextResumeLabels = { ...snap.resumeLabels }
        delete nextResumeLabels[args.label]

        await updateSnapshot(cx, args.runId, {
          status: 'running',
          suspendedPaths: nextSuspended,
          resumeLabels: nextResumeLabels,
          activePaths: [nodeIndex],
        })

        await recordAudit(tx as unknown as Sql, {
          tenantId,
          actor: actorFromContext(),
          operation: 'workflow.resumed',
          resource: { type: 'workflow_run', ids: [args.runId] },
          result: 'ok',
          metadata: {
            workflowId: def.id,
            label: args.label,
            payloadHash: hashStepInput(args.payload ?? null).slice(0, 32),
          },
        })

        return {
          resumeStepId: ref.stepId,
          startAtNodeIndex: nodeIndex,
          stepInput: input,
        }
      },
    ))
  } catch (err) {
    if (opts.await) settleRun(args.runId, mapErrorToResult(args.runId, err))
    throw err
  }

  const controller = chainSignal(opts.signal)
  enqueue(
    tenantId,
    def,
    args.runId,
    stepInput,
    startAtNodeIndex,
    resumeStepId,
    args.payload,
    logger,
    controller,
    sql,
  )

  if (opts.await) {
    return (await awaitRun(args.runId)) as RunResult<TOut>
  }
  return { runId: args.runId }
}

function mapErrorToResult(runId: string, err: unknown): RunResult<unknown> {
  return { status: 'failed', runId, error: serializeError(err) }
}

function deriveStepInput(snap: WorkflowSnapshotRow, nodeIndex: number): unknown {
  if (nodeIndex === 0) return snap.runInput
  const prev = snap.serializedStepGraph[nodeIndex - 1]
  if (!prev) return null
  if (prev.kind === 'single') {
    const r = snap.stepResults[prev.stepId]
    return r && r.status === 'completed' ? r.output : null
  }
  const out: Record<string, unknown> = {}
  for (const b of prev.branches) {
    const r = snap.stepResults[b]
    if (r && r.status === 'completed') out[b] = r.output
  }
  return out
}

// ---------------------------------------------------------------------------
// Worker enqueue helper
// ---------------------------------------------------------------------------

function enqueue(
  tenantId: string,
  def: DurableWorkflowDef,
  runId: string,
  input: unknown,
  startAtNodeIndex: number,
  resumeStepId: string | null,
  resumePayload: unknown,
  logger: Logger,
  controller: AbortController,
  sql: DbSql,
): void {
  void enqueueRun(tenantId, () =>
    tenantContext.run({ tenantId }, () =>
      executeRunForward({
        runId,
        tenantId,
        workflowId: def.id,
        nodes: def.nodes,
        input,
        startAtNodeIndex,
        resumeStepId,
        resumePayload,
        logger,
        signal: controller.signal,
        sql,
      }).catch((err) => {
        logger.error({ err }, 'workflow.run.unhandled')
      }),
    ),
  ).catch((err) => logger.error({ err }, 'workflow.enqueue.failed'))
}

// ---------------------------------------------------------------------------
// executeRunForward — the main step-walker
// ---------------------------------------------------------------------------

interface ExecuteRunForwardArgs {
  runId: string
  tenantId: string
  workflowId: string
  nodes: ReadonlyArray<GraphNode>
  input: unknown
  startAtNodeIndex: number
  resumeStepId: string | null
  resumePayload: unknown
  logger: Logger
  signal: AbortSignal
  sql: DbSql
}

async function executeRunForward(args: ExecuteRunForwardArgs): Promise<void> {
  const { runId, tenantId, workflowId, nodes, sql } = args

  await tracer.startActiveSpan(`workflow.${workflowId}`, async (span: Span) => {
    span.setAttribute('workflow.id', workflowId)
    span.setAttribute('workflow.run.id', runId)
    span.setAttribute('tenant.id', tenantId)

    let current: unknown = args.input
    let i = args.startAtNodeIndex

    try {
      while (i < nodes.length) {
        const node = nodes[i]
        if (!node) break
        if (node.kind === 'single') {
          const isResumed = i === args.startAtNodeIndex && node.step.id === args.resumeStepId
          current = await executeSingleNode(
            args,
            node.step,
            i,
            current,
            isResumed ? args.resumePayload : undefined,
          )
        } else {
          current = await executeParallelNode(args, node.branches, i, current)
        }
        i++
      }

      await withTenant(sql, tenantId, async (tx) => {
        const ok = await tryAcquireRunLock(tx, runId)
        if (!ok) throw new WorkflowResumeContended(runId)
        await updateSnapshot(combinedTx(tx), runId, { status: 'completed' })
        await recordAudit(tx as unknown as Sql, {
          tenantId,
          actor: actorFromContext(),
          operation: 'workflow.completed',
          resource: { type: 'workflow_run', ids: [runId] },
          result: 'ok',
          metadata: { workflowId, stepCount: nodes.length },
        })
      })
      span.setStatus({ code: SpanStatusCode.OK })
      span.end()
      settleRun(runId, { status: 'completed', runId, output: current as never })
    } catch (err) {
      span.recordException(err as Error)
      span.setStatus({ code: SpanStatusCode.ERROR })
      span.end()
      await handleTerminalError(args, err)
    }
  })
}

async function handleTerminalError(args: ExecuteRunForwardArgs, err: unknown): Promise<void> {
  const { runId, tenantId, workflowId, sql } = args

  if (err instanceof WorkflowSuspended) {
    // Suspension was persisted by executeSingleNode.
    settleRun(runId, {
      status: 'suspended',
      runId,
      resumeLabel: err.resumeLabel,
      stepId: err.stepId ?? '<unknown>',
    })
    return
  }

  if (err instanceof WorkflowBailed) {
    await withTenant(sql, tenantId, async (tx) => {
      const ok = await tryAcquireRunLock(tx, runId)
      if (!ok) throw new WorkflowResumeContended(runId)
      await updateSnapshot(combinedTx(tx), runId, { status: 'bailed' })
      await recordAudit(tx as unknown as Sql, {
        tenantId,
        actor: actorFromContext(),
        operation: 'workflow.bailed',
        resource: { type: 'workflow_run', ids: [runId] },
        result: 'ok',
        metadata: { workflowId, reason: err.message },
      })
    })
    settleRun(runId, { status: 'bailed', runId, reason: err.message })
    return
  }

  const serialized = serializeError(err)
  await withTenant(sql, tenantId, async (tx) => {
    const ok = await tryAcquireRunLock(tx, runId)
    if (!ok) throw new WorkflowResumeContended(runId)
    await updateSnapshot(combinedTx(tx), runId, { status: 'failed', error: serialized })
    await recordAudit(tx as unknown as Sql, {
      tenantId,
      actor: actorFromContext(),
      operation: 'workflow.failed',
      resource: { type: 'workflow_run', ids: [runId] },
      result: 'failure',
      metadata: { workflowId, errorType: serialized.name },
    })
  })
  settleRun(runId, { status: 'failed', runId, error: serialized })
}

// ---------------------------------------------------------------------------
// Single-step execution
// ---------------------------------------------------------------------------

async function executeSingleNode(
  args: ExecuteRunForwardArgs,
  step: Step<unknown, unknown, string>,
  nodeIndex: number,
  input: unknown,
  resumePayload: unknown,
): Promise<unknown> {
  const { runId, tenantId, workflowId, sql, signal, logger } = args
  const inputHash = hashStepInput(input)

  await withTenant(sql, tenantId, async (tx) => {
    const ok = await tryAcquireRunLock(tx, runId)
    if (!ok) throw new WorkflowResumeContended(runId)
    await upsertStepStart(combinedTx(tx), {
      runId,
      stepId: step.id,
      tenantId,
      workflowId,
      inputHash,
    })
  })

  const runCtx: RunContext = {
    runId,
    workflowId,
    tenantId,
    logger,
    tracer,
    signal,
    ...(resumePayload !== undefined ? { resumePayload } : {}),
  }

  let output: unknown
  try {
    output = await executeWithRetry(() => executeStep(step, input, runCtx), step.retry, signal)
  } catch (err) {
    if (err instanceof WorkflowSuspended) {
      await persistSuspend({
        sql,
        runId,
        tenantId,
        workflowId,
        stepId: step.id,
        executionPath: [nodeIndex],
        resumeLabel: err.resumeLabel,
        input,
      })
      throw err
    }
    if (err instanceof WorkflowBailed) {
      await withTenant(sql, tenantId, async (tx) => {
        const ok = await tryAcquireRunLock(tx, runId)
        if (!ok) throw new WorkflowResumeContended(runId)
        await updateStepTerminal(combinedTx(tx), runId, step.id, {
          status: 'completed',
          output: null,
        })
      })
      throw err
    }
    await withTenant(sql, tenantId, async (tx) => {
      const ok = await tryAcquireRunLock(tx, runId)
      if (!ok) throw new WorkflowResumeContended(runId)
      await updateStepTerminal(combinedTx(tx), runId, step.id, {
        status: 'failed',
        error: serializeError(err),
      })
    })
    throw err
  }

  await withTenant(sql, tenantId, async (tx) => {
    const ok = await tryAcquireRunLock(tx, runId)
    if (!ok) throw new WorkflowResumeContended(runId)
    const cx = combinedTx(tx)
    await updateStepTerminal(cx, runId, step.id, { status: 'completed', output })
    const snap = await readSnapshot(cx, runId)
    if (snap) {
      const nextStepResults: Record<string, StepResultRow> = {
        ...snap.stepResults,
        [step.id]: {
          status: 'completed',
          output,
          finishedAt: new Date().toISOString(),
        },
      }
      await updateSnapshot(cx, runId, {
        stepResults: nextStepResults,
        activePaths: [nodeIndex + 1],
      })
    }
  })

  return output
}

// ---------------------------------------------------------------------------
// Parallel-step execution
// ---------------------------------------------------------------------------

async function executeParallelNode(
  args: ExecuteRunForwardArgs,
  branches: ReadonlyArray<Step<unknown, unknown, string>>,
  nodeIndex: number,
  input: unknown,
): Promise<Record<string, unknown>> {
  const branchController = chainSignal(args.signal)
  const branchArgs: ExecuteRunForwardArgs = { ...args, signal: branchController.signal }

  const results = await Promise.allSettled(
    branches.map((step) =>
      executeSingleNode(
        branchArgs,
        step,
        nodeIndex,
        input,
        args.resumeStepId === step.id ? args.resumePayload : undefined,
      ).catch((err) => {
        if (!branchController.signal.aborted && !(err instanceof WorkflowSuspended)) {
          branchController.abort(err)
        }
        throw err
      }),
    ),
  )

  const suspended = results.find(
    (r): r is PromiseRejectedResult =>
      r.status === 'rejected' && r.reason instanceof WorkflowSuspended,
  )
  if (suspended) throw suspended.reason

  const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (failed) throw failed.reason

  const keyed: Record<string, unknown> = {}
  for (let i = 0; i < branches.length; i++) {
    const b = branches[i]
    const r = results[i]
    if (b && r?.status === 'fulfilled') keyed[b.id] = r.value
  }
  return keyed
}

// ---------------------------------------------------------------------------
// Suspend persistence
// ---------------------------------------------------------------------------

async function persistSuspend(args: {
  sql: DbSql
  runId: string
  tenantId: string
  workflowId: string
  stepId: string
  executionPath: number[]
  resumeLabel: string
  input: unknown
}): Promise<void> {
  await withTenant(args.sql, args.tenantId, async (tx) => {
    const ok = await tryAcquireRunLock(tx, args.runId)
    if (!ok) throw new WorkflowResumeContended(args.runId)
    const cx = combinedTx(tx)
    await updateStepTerminal(cx, args.runId, args.stepId, { status: 'suspended' })
    const snap = await readSnapshot(cx, args.runId)
    if (!snap) throw new WorkflowSnapshotNotFound(args.runId)
    const nextSuspended = { ...snap.suspendedPaths, [args.stepId]: args.executionPath }
    const nextResumeLabels = {
      ...snap.resumeLabels,
      [args.resumeLabel]: { stepId: args.stepId, executionPath: args.executionPath },
    }
    await updateSnapshot(cx, args.runId, {
      status: 'suspended',
      suspendedPaths: nextSuspended,
      resumeLabels: nextResumeLabels,
    })
    await recordAudit(tx as unknown as Sql, {
      tenantId: args.tenantId,
      actor: actorFromContext(),
      operation: 'workflow.suspended',
      resource: { type: 'workflow_run', ids: [args.runId] },
      result: 'ok',
      metadata: {
        workflowId: args.workflowId,
        stepId: args.stepId,
        resumeLabel: args.resumeLabel,
      },
    })
  })
}
