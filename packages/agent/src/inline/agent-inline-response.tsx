'use client'

import { X, ArrowRight } from '@future/ui/icons'
import { AnswerBubble } from '../thread/cards/answer-bubble'
import { IconBtn } from '../primitives/icon-btn'
import { TinyBtn } from '../primitives/tiny-btn'

export interface AgentInlineResponseProps {
  content: string
  isStreaming?: boolean
  onDismiss: () => void
  onContinueInPanel?: () => void
}

export function AgentInlineResponse({
  content,
  isStreaming,
  onDismiss,
  onContinueInPanel,
}: AgentInlineResponseProps) {
  return (
    <div className="dark mt-2 flex flex-col gap-1 rounded-md border border-white/[0.05] bg-sidebar p-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <AnswerBubble>
            {content}
            {isStreaming && (
              <span className="ml-1 inline-block h-3 w-1 animate-pulse bg-foreground" />
            )}
          </AnswerBubble>
        </div>
        <IconBtn aria-label="Dismiss" onClick={onDismiss}>
          <X className="h-3.5 w-3.5" />
        </IconBtn>
      </div>
      {onContinueInPanel && !isStreaming && (
        <TinyBtn onClick={onContinueInPanel}>
          Continue in panel <ArrowRight className="ml-0.5 h-3 w-3" />
        </TinyBtn>
      )}
    </div>
  )
}
