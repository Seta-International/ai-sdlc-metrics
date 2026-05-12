import type { ErrorHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { ZodError } from 'zod'

const ERROR_TYPE_BASE = 'https://os.seta-international.com/errors'

export type Problem = {
  type: string
  title: string
  status: number
  detail?: string
  instance?: string
}

export class DomainError extends HTTPException {
  problem: Problem
  constructor(
    status: number,
    message: string,
    opts: { type?: string; detail?: string; cause?: unknown } = {},
  ) {
    super(status as 400 | 401 | 403 | 404 | 409 | 410 | 422, { message, cause: opts.cause })
    this.problem = {
      type: opts.type ?? `${ERROR_TYPE_BASE}/${status}`,
      title: message,
      status,
      ...(opts.detail !== undefined ? { detail: opts.detail } : {}),
    }
  }
}

export class NotFound extends DomainError {
  constructor(what: string) {
    super(404, `${what} not found`)
  }
}
export class Forbidden extends DomainError {
  constructor(reason: string) {
    super(403, 'forbidden', { detail: reason })
  }
}
export class ConflictError extends DomainError {
  constructor(reason: string) {
    super(409, 'conflict', { detail: reason })
  }
}
export class Unprocessable extends DomainError {
  constructor(detail: string) {
    super(422, 'unprocessable', { detail })
  }
}
export class Unauthorized extends DomainError {
  constructor(reason: string) {
    super(401, reason)
  }
}
export class BadRequest extends DomainError {
  constructor(detail: string) {
    super(400, 'bad request', { detail })
  }
}
export class Gone extends DomainError {
  constructor(detail: string) {
    super(410, 'gone', { detail })
  }
}
export class ServiceUnavailable extends DomainError {
  constructor(detail: string) {
    super(503, 'service unavailable', { detail })
  }
}

export const onError: ErrorHandler = (err, c) => {
  if (err instanceof DomainError) {
    return c.json({ ...err.problem, instance: c.req.path }, err.problem.status as 400, {
      'Content-Type': 'application/problem+json',
    })
  }
  if (err instanceof ZodError) {
    return c.json(
      {
        type: `${ERROR_TYPE_BASE}/validation`,
        title: 'Validation failed',
        status: 400,
        detail: 'Request did not match schema',
        errors: err.flatten().fieldErrors,
        instance: c.req.path,
      },
      400,
      { 'Content-Type': 'application/problem+json' },
    )
  }
  if (err instanceof HTTPException) {
    return c.json(
      {
        type: `${ERROR_TYPE_BASE}/http`,
        title: err.message,
        status: err.status,
        instance: c.req.path,
      },
      err.status,
      { 'Content-Type': 'application/problem+json' },
    )
  }
  // Unknown — never leak internals
  return c.json(
    {
      type: `${ERROR_TYPE_BASE}/internal`,
      title: 'Internal Server Error',
      status: 500,
      instance: c.req.path,
    },
    500,
    { 'Content-Type': 'application/problem+json' },
  )
}
