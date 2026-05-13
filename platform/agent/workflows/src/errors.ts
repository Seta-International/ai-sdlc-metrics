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

export class WorkflowSuspended extends WorkflowError {
  public stepId: string | null = null
  constructor(
    public readonly resumeLabel: string,
    public readonly payload?: unknown,
  ) {
    super(500, `workflow suspended: ${resumeLabel}`, {
      type: `${ERROR_TYPE_BASE}/suspended`,
    })
  }
}

export class WorkflowResumeContended extends WorkflowError {
  constructor(runId: string) {
    super(409, `resume contended: ${runId}`, {
      type: `${ERROR_TYPE_BASE}/resume-contended`,
      detail: { runId },
    })
  }
}

export class WorkflowSnapshotNotFound extends WorkflowError {
  constructor(runId: string) {
    super(404, `snapshot not found: ${runId}`, {
      type: `${ERROR_TYPE_BASE}/snapshot-not-found`,
      detail: { runId },
    })
  }
}

export class WorkflowNotSuspended extends WorkflowError {
  constructor(runId: string, status: string) {
    super(409, `workflow not suspended: ${runId} (status=${status})`, {
      type: `${ERROR_TYPE_BASE}/not-suspended`,
      detail: { runId, status },
    })
  }
}

export class WorkflowMismatch extends WorkflowError {
  constructor(expected: string, actual: string) {
    super(409, `workflow id mismatch: expected ${expected}, got ${actual}`, {
      type: `${ERROR_TYPE_BASE}/mismatch`,
      detail: { expected, actual },
    })
  }
}

export class WorkflowResumeLabelUnknown extends WorkflowError {
  constructor(label: string) {
    super(400, `resume label unknown: ${label}`, {
      type: `${ERROR_TYPE_BASE}/resume-label-unknown`,
      detail: { label },
    })
  }
}

export class WorkflowNotRegistered extends WorkflowError {
  constructor(id: string) {
    super(500, `workflow not registered: ${id}`, {
      type: `${ERROR_TYPE_BASE}/not-registered`,
      detail: { id },
    })
  }
}
