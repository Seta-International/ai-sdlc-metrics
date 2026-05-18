import type { FusedItem, RankedItem } from './types.js'

/**
 * Stub implementation. Plan B replaces this with the real RRF fusion.
 */
export function fuseByRRF(_rankings: RankedItem[][], _k = 60): FusedItem[] {
  throw new Error('fuseByRRF: not implemented yet (see Plan B)')
}
