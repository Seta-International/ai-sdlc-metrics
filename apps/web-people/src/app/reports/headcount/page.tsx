'use client'

import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import {
  DataTable,
  Card,
  Button,
  type FutureTableState,
  defaultTableState,
  Skeleton,
} from '@future/ui'
import { SummaryCardsRow } from '../../../components/reports/SummaryCards'
import type { HeadcountSummary } from '../../../lib/types-workflows'
import { trpc } from '../../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

export default function HeadcountReportPage() {
  const [data, setData] = React.useState<HeadcountSummary | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [breakdownView, setBreakdownView] = React.useState<'department' | 'country' | 'type'>(
    'department',
  )
  const [tableState, setTableState] = React.useState<FutureTableState>(defaultTableState)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await (anyTrpc.people.reports.headcount.query() as Promise<HeadcountSummary>)
        setData(result)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [])

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-4">
          {(['kpi-a', 'kpi-b', 'kpi-c', 'kpi-d'] as const).map((k) => (
            <Skeleton key={k} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  const breakdownData = {
    department: data.byDepartment.map((d) => ({ name: d.name, count: d.count })),
    country: data.byCountry.map((d) => ({ name: `${d.name} (${d.code})`, count: d.count })),
    type: data.byType.map((d) => ({ name: d.type, count: d.count })),
  }

  const breakdownColumns: ColumnDef<{ name: string; count: number }>[] = [
    { accessorKey: 'name', header: 'Name', enableSorting: true },
    { accessorKey: 'count', header: 'Count', enableSorting: true },
  ]

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-510 text-foreground">Headcount</h2>
      <SummaryCardsRow
        cards={[
          { label: 'Total Active', value: data.totalActive },
          {
            label: 'New Hires (month)',
            value: data.newHiresThisMonth,
            trend: 'up',
            trendValue: `+${data.newHiresThisMonth}`,
          },
          {
            label: 'Terminations (month)',
            value: data.terminationsThisMonth,
            trend: data.terminationsThisMonth > 0 ? 'down' : 'flat',
            trendValue: `-${data.terminationsThisMonth}`,
          },
          {
            label: 'Net Change',
            value: data.netChange > 0 ? `+${data.netChange}` : String(data.netChange),
            trend: data.netChange > 0 ? 'up' : data.netChange < 0 ? 'down' : 'flat',
            trendValue: '',
          },
        ]}
      />
      <Card className="border-border bg-card p-5">
        <h3 className="text-sm font-590 text-foreground mb-4">12-Month Trend</h3>
        <div className="h-48 flex items-end gap-1">
          {data.trend.map((point) => {
            const maxCount = Math.max(...data.trend.map((p) => p.count), 1)
            const height = (point.count / maxCount) * 100
            return (
              <div key={point.month} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full rounded-t bg-primary/60" style={{ height: `${height}%` }} />
                <span className="text-tiny text-secondary-foreground/60">
                  {point.month.slice(5)}
                </span>
              </div>
            )
          })}
        </div>
      </Card>
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-510 text-foreground">Breakdown by</span>
          {(['department', 'country', 'type'] as const).map((view) => (
            <Button
              key={view}
              variant="outline"
              size="sm"
              onClick={() => setBreakdownView(view)}
              className={breakdownView === view ? 'bg-secondary text-foreground font-510' : ''}
            >
              {view.charAt(0).toUpperCase() + view.slice(1)}
            </Button>
          ))}
        </div>
        <DataTable
          columns={breakdownColumns}
          rows={breakdownData[breakdownView]}
          state={tableState}
          totalCount={breakdownData[breakdownView].length}
          onStateChange={setTableState}
          isLoading={false}
        />
      </div>
    </div>
  )
}
