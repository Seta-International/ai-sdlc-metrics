import type { ScratchpadValue } from '../entities/scratchpad.entity'

export interface ScratchpadRepository {
  read(tenantId: string, userId: string, field: string): Promise<ScratchpadValue | null>

  write(
    tenantId: string,
    userId: string,
    field: string,
    value: unknown,
    opts: { tainted: boolean },
  ): Promise<void>

  deleteForUser(tenantId: string, userId: string): Promise<{ count: number }>
}

export const SCRATCHPAD_REPOSITORY = Symbol('SCRATCHPAD_REPOSITORY')
