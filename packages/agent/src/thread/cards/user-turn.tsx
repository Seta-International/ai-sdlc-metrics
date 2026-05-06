import type { ReactNode } from 'react'

export interface UserTurnProps {
  children: ReactNode
}

export function UserTurn({ children }: UserTurnProps) {
  return (
    <div className="flex justify-end px-3 py-1">
      <div className="max-w-[85%] rounded-lg bg-white/[0.06] px-3 py-2 text-sm text-foreground">
        {children}
      </div>
    </div>
  )
}
