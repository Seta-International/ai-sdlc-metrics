import { Injectable } from '@nestjs/common'
import type { CiStatePort } from '../../domain/ports/ci-state.port'

/**
 * Explicit-disabled stub for CiStatePort.
 * The CI state backend is not yet deployed — Phase 2 will replace this with
 * a real GitHub Actions / CI API adapter.
 *
 * Consumers MUST call isEnabled() before invoking query methods.
 *
 * DEFERRED: emit `ci_state_disabled_invocation_total` counter on blocked
 * calls. Skipped today because the metrics backend that would receive the
 * counter is itself disabled (see StubMetricsQuery). Wire the counter when
 * the metrics adapter ships.
 */
@Injectable()
export class StubCiState implements CiStatePort {
  isEnabled(): boolean {
    return false
  }

  async checkPassed(): Promise<boolean | null> {
    throw new Error('CiStatePort is disabled — backend not yet deployed')
  }
}
