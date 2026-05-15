export class ContinuationBadHmac extends Error {
  constructor() {
    super('invalid continuation token')
  }
}

export class ContinuationConsumed extends Error {
  cachedResultCard: Record<string, unknown> | undefined
  constructor(cachedResultCard?: Record<string, unknown>) {
    super('continuation already consumed')
    this.cachedResultCard = cachedResultCard
  }
}

export class ContinuationExpired extends Error {
  constructor() {
    super('continuation expired')
  }
}

export class ContinuationUserMismatch extends Error {
  constructor() {
    super('continuation belongs to a different user')
  }
}
