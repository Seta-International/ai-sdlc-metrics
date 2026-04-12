'use client'

import { useState, useEffect } from 'react'

export interface Session {
  actorId: string
  tenantId: string
  roles: string[]
  displayName: string
  email: string
  provider: string
}

let cachedSession: Session | null = null
let fetchPromise: Promise<Session | null> | null = null

async function fetchSession(): Promise<Session | null> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' })
    if (!res.ok) {
      cachedSession = null
      return null
    }
    const data = (await res.json()) as Session
    cachedSession = data
    return data
  } catch {
    cachedSession = null
    return null
  }
}

export function useSession(): Session | null {
  const [session, setSession] = useState<Session | null>(cachedSession)
  useEffect(() => {
    if (cachedSession) {
      setSession(cachedSession)
      return
    }
    if (!fetchPromise) {
      fetchPromise = fetchSession()
    }
    fetchPromise
      .then((result) => {
        setSession(result)
        fetchPromise = null
      })
      .catch(() => {
        setSession(null)
        fetchPromise = null
      })
  }, [])
  return session
}

export function clearSessionCache(): void {
  cachedSession = null
  fetchPromise = null
}
