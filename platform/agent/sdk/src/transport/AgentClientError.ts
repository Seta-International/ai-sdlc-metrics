type Init =
  | { kind: 'http'; status: number; body: unknown }
  | { kind: 'network'; cause: unknown }
  | { kind: 'parse'; cause: unknown }
  | { kind: 'abort' }

export class AgentClientError extends Error {
  readonly kind: Init['kind']
  readonly status?: number
  readonly body?: unknown

  constructor(init: Init) {
    super(messageFor(init), 'cause' in init ? { cause: init.cause } : undefined)
    this.name = 'AgentClientError'
    this.kind = init.kind
    if (init.kind === 'http') {
      this.status = init.status
      this.body = init.body
    }
  }
}

function messageFor(i: Init): string {
  switch (i.kind) {
    case 'http':
      return `HTTP ${i.status}`
    case 'network':
      return 'Network error'
    case 'parse':
      return 'Response parse error'
    case 'abort':
      return 'Request aborted'
  }
}
