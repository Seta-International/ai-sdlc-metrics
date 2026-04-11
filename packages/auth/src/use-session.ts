'use client'

import { useState, useEffect } from 'react'

export interface Session {
  actorId: string
  tenantId: string
  roles: string[]
  displayName: string
  email?: string
  provider: string
}

let cachedSession: Session | null = null
let fetchPromise: Promise<Session | null> | null = null

async function fetchSession(): Promise<Session | null> {
  try {
    const res = await fetch('/api/auth/me', {
      credentials: 'include',
    })
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

/**
 * React hook that returns the current session.
 * Fetches from /api/auth/me (server validates JWT) and caches the result.
 * Returns null while loading or if not authenticated.
 */
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

/**
 * Imperative session invalidation — clears the cache.
 * Call after logout to force re-fetch on next useSession().
 */
export function clearSessionCache(): void {
  cachedSession = null
  fetchPromise = null
}
