'use client'

import type { TaskDetailSnapshot } from '../board-types'
import type { TaskPatch } from './useTaskDetail'

interface UseConflictResolverInput {
  conflict: TaskDetailSnapshot | null
  localPatch: TaskPatch | null
  update: (patch: TaskPatch) => void
  clearConflict: () => void
}

interface UseConflictResolverResult {
  conflictingField: keyof TaskPatch | null
  myValue: unknown
  theirValue: unknown
  keepMine: () => void
  keepTheirs: () => void
  isActive: boolean
}

export function useConflictResolver({
  conflict,
  localPatch,
  update,
  clearConflict,
}: UseConflictResolverInput): UseConflictResolverResult {
  const isActive = conflict !== null

  function findConflictingField(): keyof TaskPatch | null {
    if (!conflict || !localPatch) return null
    const keys = Object.keys(localPatch) as (keyof TaskPatch)[]
    for (const key of keys) {
      const mine = localPatch[key]
      const theirs = conflict[key]
      if (mine instanceof Date && theirs instanceof Date) {
        if (mine.toISOString() !== theirs.toISOString()) return key
      } else if (mine !== theirs) {
        return key
      }
    }
    return null
  }

  const conflictingField = findConflictingField()
  const myValue = conflictingField != null ? localPatch?.[conflictingField] : undefined
  const theirValue = conflictingField != null ? conflict?.[conflictingField] : undefined

  function keepMine(): void {
    if (localPatch) update(localPatch)
    clearConflict()
  }

  function keepTheirs(): void {
    clearConflict()
  }

  return {
    conflictingField,
    myValue,
    theirValue,
    keepMine,
    keepTheirs,
    isActive,
  }
}
