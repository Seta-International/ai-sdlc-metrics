'use client'

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@future/ui'
import { UserX } from '@future/ui/icons'

export function AssigneeBlockedIndicator() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="inline-flex items-center text-warning"
            data-testid="assignee-blocked-indicator"
            aria-label="Assignee not in Microsoft 365"
          >
            <UserX className="size-3" aria-hidden />
          </span>
        </TooltipTrigger>
        <TooltipContent>
          This assignee isn&apos;t in Microsoft 365 yet. Sync is paused on this task.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
