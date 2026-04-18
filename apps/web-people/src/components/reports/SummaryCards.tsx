'use client'
import { Card } from '@future/ui'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface SummaryCardProps {
  label: string
  value: number | string
  trend?: 'up' | 'down' | 'flat'
  trendValue?: string
}

export function SummaryCard({ label, value, trend, trendValue }: SummaryCardProps) {
  return (
    <Card className="border-border bg-card p-5">
      <div className="text-xs font-510 text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="mt-2 text-3xl font-510 text-foreground">{value}</div>
      {trend && trendValue && (
        <div className="mt-1 flex items-center gap-1 text-xs">
          {trend === 'up' && <TrendingUp className="h-3 w-3 text-emerald-500" />}
          {trend === 'down' && <TrendingDown className="h-3 w-3 text-red-400" />}
          {trend === 'flat' && <Minus className="h-3 w-3 text-secondary-foreground/60" />}
          <span
            className={
              trend === 'up'
                ? 'text-emerald-500'
                : trend === 'down'
                  ? 'text-red-400'
                  : 'text-secondary-foreground/60'
            }
          >
            {trendValue}
          </span>
        </div>
      )}
    </Card>
  )
}

interface SummaryCardsRowProps {
  cards: SummaryCardProps[]
}

export function SummaryCardsRow({ cards }: SummaryCardsRowProps) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((card) => (
        <SummaryCard key={card.label} {...card} />
      ))}
    </div>
  )
}
