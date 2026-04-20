'use client'

import { createContext, use } from 'react'

export interface MyDayCtx {
  date: string // tenant-local YYYY-MM-DD
  timezone: string
}

export const MyDayContext = createContext<MyDayCtx | null>(null)

export function useMyDayContext(): MyDayCtx {
  const ctx = use(MyDayContext)
  if (!ctx) throw new Error('useMyDayContext must be used within /personal/today/*')
  return ctx
}
