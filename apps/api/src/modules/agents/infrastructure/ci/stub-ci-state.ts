import { Injectable } from '@nestjs/common'
import type { CiStatePort } from '../../domain/ports/ci-state.port'

/**
 * MVP stub for CiStatePort.
 * Returns null (unknown) for all CI checks.
 * Replace with a real GitHub Actions / CI API adapter post-MVP.
 */
@Injectable()
export class StubCiState implements CiStatePort {
  async checkPassed(): Promise<boolean | null> {
    return null
  }
}
