'use client'
import { createContext, useContext } from 'react'

export const PersonalTasksContext = createContext<{ includeCompleted: boolean }>({
  includeCompleted: false,
})

export const usePersonalTasksCtx = () => useContext(PersonalTasksContext)
