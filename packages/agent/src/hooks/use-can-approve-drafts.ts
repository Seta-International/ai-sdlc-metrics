'use client'

import { useCanAccess } from '@future/app-layout'

const AGENT_DRAFT_APPROVE_PERMISSION = 'agent:draft:approve'

export function useCanApproveDrafts(): boolean {
  return useCanAccess(AGENT_DRAFT_APPROVE_PERMISSION)
}
