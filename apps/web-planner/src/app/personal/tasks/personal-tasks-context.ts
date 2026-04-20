'use client'
import { createContext, use } from 'react'

export const PersonalTasksContext = createContext<{ includeCompleted: boolean }>({
  includeCompleted: false,
})

export const usePersonalTasksCtx = () => use(PersonalTasksContext)
