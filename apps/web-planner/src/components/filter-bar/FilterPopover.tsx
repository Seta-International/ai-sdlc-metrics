'use client'
import { Popover, PopoverContent, PopoverTrigger } from '@future/ui'
import type { ReactNode } from 'react'
import type { PlanContext } from './types'
import type { FilterField } from './types'
import type { ViewStateOptions } from '@/lib/hooks/useViewState'
import { DueFilter } from './filters/DueFilter'
import { PriorityFilter } from './filters/PriorityFilter'
import { LabelsFilter } from './filters/LabelsFilter'
import { BucketsFilter } from './filters/BucketsFilter'
import { AssigneesFilter } from './filters/AssigneesFilter'

export function FilterPopover({
  viewStateOpts,
  field,
  context,
  children,
}: {
  viewStateOpts: ViewStateOptions
  field: FilterField
  context: PlanContext
  children: ReactNode
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        {field === 'due' && <DueFilter viewStateOpts={viewStateOpts} />}
        {field === 'priority' && <PriorityFilter viewStateOpts={viewStateOpts} />}
        {field === 'labels' && <LabelsFilter viewStateOpts={viewStateOpts} context={context} />}
        {field === 'buckets' && <BucketsFilter viewStateOpts={viewStateOpts} context={context} />}
        {field === 'assignees' && (
          <AssigneesFilter viewStateOpts={viewStateOpts} context={context} />
        )}
      </PopoverContent>
    </Popover>
  )
}
