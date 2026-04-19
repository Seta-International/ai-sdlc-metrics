'use client'
import { Popover, PopoverContent, PopoverTrigger } from '@future/ui'
import type { ReactNode } from 'react'
import type { PlanContext } from './types'
import type { FilterField } from './types'
import { DueFilter } from './filters/DueFilter'
import { PriorityFilter } from './filters/PriorityFilter'
import { LabelsFilter } from './filters/LabelsFilter'
import { BucketsFilter } from './filters/BucketsFilter'
import { AssigneesFilter } from './filters/AssigneesFilter'

export function FilterPopover({
  planId,
  field,
  context,
  children,
}: {
  planId: string
  field: FilterField
  context: PlanContext
  children: ReactNode
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        {field === 'due' && <DueFilter planId={planId} />}
        {field === 'priority' && <PriorityFilter planId={planId} />}
        {field === 'labels' && <LabelsFilter planId={planId} context={context} />}
        {field === 'buckets' && <BucketsFilter planId={planId} context={context} />}
        {field === 'assignees' && <AssigneesFilter planId={planId} context={context} />}
      </PopoverContent>
    </Popover>
  )
}
