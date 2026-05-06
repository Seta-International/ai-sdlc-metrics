import { Mono } from '../../primitives/mono'
import type { ReactNode } from 'react'

export interface AnswerBubbleProps {
  children: ReactNode
  shape?: string
}

export function AnswerBubble({ children, shape }: AnswerBubbleProps) {
  return (
    <div className="flex flex-col gap-1">
      {shape && (
        <Mono>
          <span data-testid="answer-shape">{shape}</span>
        </Mono>
      )}
      <div className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{children}</div>
    </div>
  )
}
