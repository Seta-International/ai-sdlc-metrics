'use client'

import { Progress } from '@future/ui'

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
  const color = score >= 80 ? 'text-[#10b981]' : score >= 50 ? 'text-amber-400' : 'text-red-400'

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[#8a8f98]">Profile completeness</span>
        <span className={`font-[510] ${color}`}>{score}%</span>
      </div>
      <Progress value={score} className="h-1.5" />
      {showLink && score < 100 && missingItems && missingItems.length > 0 && (
        <button
          type="button"
          onClick={onCompleteClick}
          className="text-xs text-[#7170ff] hover:text-[#828fff] underline-offset-2 hover:underline"
        >
          Complete your profile ({missingItems.length} items remaining)
        </button>
      )}
    </div>
  )
}
