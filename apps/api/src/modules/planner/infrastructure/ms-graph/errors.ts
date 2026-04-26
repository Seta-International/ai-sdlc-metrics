export class GraphError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message)
    this.name = this.constructor.name
  }
}

export class GraphPreconditionFailedError extends GraphError {}
export class GraphThrottledError extends GraphError {
  constructor(
    message: string,
    body: unknown,
    public readonly retryAfterSeconds: number,
  ) {
    super(message, 429, body)
    this.name = 'GraphThrottledError'
  }
}
export class GraphAuthError extends GraphError {}
export class GraphQuotaError extends GraphError {
  constructor(
    message: string,
    body: unknown,
    public readonly limitCode: string,
  ) {
    super(message, 403, body)
    this.name = 'GraphQuotaError'
  }
}
export class GraphNotFoundError extends GraphError {}
export class GraphServerError extends GraphError {}
export class GraphUnknownError extends GraphError {}
