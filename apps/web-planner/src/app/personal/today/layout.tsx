'use client'

import { useMemo } from 'react'
import { usePathname } from 'next/navigation'
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbPage } from '@future/ui'
import { ViewPicker } from '@/components/view-picker/ViewPicker'
import { useTenantTimezone } from '@/lib/hooks/useTenantTimezone'
import { MyDayContext } from './my-day-context'

function todayInTz(tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

function humanHeader(date: string, tz: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date(`${date}T12:00:00Z`))
}

export default function MyDayLayout({ children }: { children: React.ReactNode }) {
  const { timezone } = useTenantTimezone()
  const pathname = usePathname()

  const segment = pathname.split('/')[3] ?? 'board'
  const VIEWS = ['board', 'grid', 'schedule', 'charts'] as const
  type View = (typeof VIEWS)[number]
  const currentView: View = (VIEWS as ReadonlyArray<string>).includes(segment)
    ? (segment as View)
    : 'board'

  const date = todayInTz(timezone)
  const value = useMemo(() => ({ date, timezone }), [date, timezone])

  return (
    <MyDayContext.Provider value={value}>
      <div className="flex flex-col min-h-0">
        <header className="border-b border-overlay/5 bg-panel">
          <div className="flex items-center gap-1 px-6 py-2">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage>My Day</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          <div className="flex items-center justify-between gap-4 px-6 py-2">
            <div>
              <h1 className="text-xl font-semibold">My Day</h1>
              <p className="text-sm text-muted-foreground">Today · {humanHeader(date, timezone)}</p>
            </div>
            <ViewPicker scope="my-day" currentView={currentView} basePath="/personal/today" />
          </div>
        </header>

        <div className="flex-1 min-h-0">{children}</div>
      </div>
    </MyDayContext.Provider>
  )
}
