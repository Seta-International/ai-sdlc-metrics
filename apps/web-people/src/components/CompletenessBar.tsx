'use client'

import { Progress, Button } from '@future/ui'

interface CompletenessBarProps {
  score: number // 0-100
  missingItems?: string[]
  showLink?: boolean
  onCompleteClick?: () => void
}

export function CompletenessBar({
  score,
  missingItems,
  showLink,
  onCompleteClick,
}: CompletenessBarProps) {
  const color = score >= 80 ? 'text-emerald-500' : score >= 50 ? 'text-amber-400' : 'text-red-400'

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Profile completeness</span>
        <span className={`font-510 ${color}`}>{score}%</span>
      </div>
      <Progress value={score} className="h-1.5" />
      {showLink && score < 100 && missingItems && missingItems.length > 0 && (
        <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onCompleteClick}>
          Complete your profile ({missingItems.length} items remaining)
        </Button>
      )}
    </div>
  )
}
