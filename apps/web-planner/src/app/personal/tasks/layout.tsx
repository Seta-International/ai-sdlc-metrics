'use client'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbPage } from '@future/ui'
import { ViewPicker } from '@/components/view-picker/ViewPicker'
import { FilterBar } from '@/components/filter-bar/FilterBar'
import { GroupByPicker } from '@/components/group-by/GroupByPicker'
import type { GroupKey } from '@/lib/view-state'
import type { PlanContext } from '@/components/filter-bar/types'
import { PersonalTasksContext } from './personal-tasks-context'

const EMPTY_CONTEXT: PlanContext = { labels: [], members: [], buckets: [] }
const PERSONAL_GROUP_KEYS: GroupKey[] = ['plan', 'progress', 'due', 'priority', 'assignee', 'label']

export default function PersonalTasksLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [includeCompleted, setIncludeCompleted] = useState(false)

  const segment = pathname.split('/')[3] ?? 'board'
  const VIEWS = ['board', 'grid', 'schedule', 'charts'] as const
  type View = (typeof VIEWS)[number]
  const currentView: View = (VIEWS as ReadonlyArray<string>).includes(segment)
    ? (segment as View)
    : 'board'

  return (
    <div className="flex flex-col min-h-0">
      <header className="border-b border-overlay/5 bg-panel">
        <div className="flex items-center gap-1 px-6 py-2">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>My Tasks</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        <div className="flex items-center justify-between gap-4 px-6 py-2">
          <ViewPicker scope="personal" currentView={currentView} basePath="/personal/tasks" />
          <div className="flex items-center gap-3">
            <FilterBar
              context={EMPTY_CONTEXT}
              mode="personal"
              includeCompleted={includeCompleted}
              onIncludeCompletedChange={setIncludeCompleted}
            />
            <GroupByPicker planId="personal" availableKeys={PERSONAL_GROUP_KEYS} />
          </div>
        </div>
      </header>

      <PersonalTasksContext.Provider value={{ includeCompleted }}>
        <div className="flex-1 min-h-0">{children}</div>
      </PersonalTasksContext.Provider>
    </div>
  )
}
