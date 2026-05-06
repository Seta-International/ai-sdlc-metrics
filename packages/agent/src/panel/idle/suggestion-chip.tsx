'use client'

import { ThreadPrimitive } from '@assistant-ui/react'
import { Button } from '@future/ui'
import { Sparkles } from '@future/ui/icons'

export interface SuggestionChipProps {
  text: string
  onPick?: () => void
}

export function SuggestionChip({ text, onPick }: SuggestionChipProps) {
  return (
    <Button
      asChild
      variant="outline"
      className="h-auto w-full items-start justify-start gap-2 rounded-md border-white/[0.08] bg-white/[0.02] px-2.5 py-2 text-left text-xs text-foreground hover:bg-white/[0.04]"
    >
      <ThreadPrimitive.Suggestion prompt={text} send clearComposer onClick={onPick}>
        <Sparkles className="mt-0.5 size-3 shrink-0 text-accent" />
        <span className="leading-snug">{text}</span>
      </ThreadPrimitive.Suggestion>
    </Button>
  )
}
