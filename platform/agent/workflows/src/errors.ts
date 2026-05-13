import { DomainError } from '@seta/middleware'

const ERROR_TYPE_BASE = 'https://os.seta-international.com/errors/workflow'

export class WorkflowError extends DomainError {
  constructor(
    status: number,
    message: string,
    opts?: { type?: string; detail?: unknown; cause?: unknown },
  ) {
    const superOpts: { type?: string; detail?: string; cause?: unknown } = {
      type: opts?.type ?? `${ERROR_TYPE_BASE}/workflow-error`,
    }
    if (opts?.detail !== undefined) superOpts.detail = JSON.stringify(opts.detail)
    if (opts?.cause !== undefined) superOpts.cause = opts.cause
    super(status, message, superOpts)
  }

  get detail(): unknown {
    const raw = this.problem.detail
    if (raw === undefined) return undefined
    try {
      return JSON.parse(raw)
    } catch {
      return raw
    }
  }
}

export class WorkflowBuildError extends WorkflowError {
  constructor(message: string) {
    super(500, message, { type: `${ERROR_TYPE_BASE}/build-error` })
  }
}

export interface StepErrorArgs {
  runId: string
  stepId: string
  cause: unknown
  message?: string
}

export class StepInputValidationError extends WorkflowError {
  constructor(args: StepErrorArgs) {
    super(400, args.message ?? `step ${args.stepId}: input validation failed`, {
      type: `${ERROR_TYPE_BASE}/step-input-validation`,
      detail: { runId: args.runId, stepId: args.stepId },
      cause: args.cause,
    })
  }
}

export class StepOutputValidationError extends WorkflowError {
  constructor(args: StepErrorArgs) {
    super(500, args.message ?? `step ${args.stepId}: output validation failed`, {
      type: `${ERROR_TYPE_BASE}/step-output-validation`,
      detail: { runId: args.runId, stepId: args.stepId },
      cause: args.cause,
    })
  }
}

export class StepExecutionError extends WorkflowError {
  constructor(args: StepErrorArgs) {
    super(500, args.message ?? `step ${args.stepId}: execution failed`, {
      type: `${ERROR_TYPE_BASE}/step-execution`,
      detail: { runId: args.runId, stepId: args.stepId },
      cause: args.cause,
    })
  }
}

export class WorkflowBailed extends WorkflowError {
  constructor(message: string) {
    super(500, message, { type: `${ERROR_TYPE_BASE}/bailed` })
  }
}
