import { Injectable } from '@nestjs/common'
import type { CanaryStateChange, TenantLadderState } from '../../domain/cost/cost-types'

@Injectable()
export class QualityCanarySubscription {
  private state: TenantLadderState = { severity: 'nominal' }
  private readonly handlers: Array<(event: CanaryStateChange) => void> = []

  subscribe(handler: (event: CanaryStateChange) => void): () => void {
    this.handlers.push(handler)
    return () => {
      const idx = this.handlers.indexOf(handler)
      if (idx !== -1) this.handlers.splice(idx, 1)
    }
  }

  publish(event: CanaryStateChange): void {
    this.state = { severity: event.severity, canaryWindowId: event.windowId }
    this.handlers.forEach((h) => h(event))
  }

  getCurrentState(): TenantLadderState {
    return { ...this.state }
  }
}
