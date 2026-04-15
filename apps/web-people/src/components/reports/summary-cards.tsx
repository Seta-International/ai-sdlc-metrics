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
    <Card className="border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-5">
      <div className="text-xs font-[510] text-[#8a8f98] uppercase tracking-wide">{label}</div>
      <div className="mt-2 text-3xl font-[510] text-[#f7f8f8]">{value}</div>
      {trend && trendValue && (
        <div className="mt-1 flex items-center gap-1 text-xs">
          {trend === 'up' && <TrendingUp className="h-3 w-3 text-[#10b981]" />}
          {trend === 'down' && <TrendingDown className="h-3 w-3 text-red-400" />}
          {trend === 'flat' && <Minus className="h-3 w-3 text-[#62666d]" />}
          <span
            className={
              trend === 'up'
                ? 'text-[#10b981]'
                : trend === 'down'
                  ? 'text-red-400'
                  : 'text-[#62666d]'
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
