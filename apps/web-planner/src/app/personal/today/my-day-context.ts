'use client'

import { createContext, useContext } from 'react'

export interface MyDayCtx {
  date: string // tenant-local YYYY-MM-DD
  timezone: string
}

export const MyDayContext = createContext<MyDayCtx | null>(null)

export function useMyDayContext(): MyDayCtx {
  const ctx = useContext(MyDayContext)
  if (!ctx) throw new Error('useMyDayContext must be used within /personal/today/*')
  return ctx
}
