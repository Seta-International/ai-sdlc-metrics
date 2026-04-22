'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button, Input } from '@future/ui'
import { MICROSOFT_CONFIG, GOOGLE_CONFIG } from '../../../lib/auth-config'

const PEOPLE_APP_URL =
  process.env['NEXT_PUBLIC_LOCAL_DEV'] === 'true'
    ? 'http://localhost:3001'
    : 'https://people.future.seta-international.vn'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const searchParams = useSearchParams()

  async function handleMagicLink(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        setError(data.error ?? 'Failed to send magic link')
      } else {
        const data = (await res.json()) as { ok?: boolean; dev?: boolean }
        if (data.dev) {
          const redirectTo = searchParams.get('redirectTo') ?? PEOPLE_APP_URL
          window.location.href = redirectTo
        } else {
          setSent(true)
        }
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const futureTenantId = process.env['NEXT_PUBLIC_TENANT_ID'] ?? ''
  const msLoginUrl = `${MICROSOFT_CONFIG.authorizationEndpoint}?client_id=${MICROSOFT_CONFIG.clientId}&response_type=code&redirect_uri=${encodeURIComponent(MICROSOFT_CONFIG.redirectUri)}&scope=${encodeURIComponent(MICROSOFT_CONFIG.scope)}&response_mode=query&state=${encodeURIComponent(futureTenantId)}`

  const googleLoginUrl = `${GOOGLE_CONFIG.authorizationEndpoint}?client_id=${GOOGLE_CONFIG.clientId}&response_type=code&redirect_uri=${encodeURIComponent(GOOGLE_CONFIG.redirectUri)}&scope=${encodeURIComponent(GOOGLE_CONFIG.scope)}`

  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-h2 mb-4">Check your email</h1>
          <p className="text-muted-foreground">
            We sent a magic link to <strong>{email}</strong>. Click the link to sign in.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-6 p-8">
        <h1 className="text-h1 text-center">Sign in to Future</h1>

        <div className="space-y-3">
          <a
            href={msLoginUrl}
            className="flex w-full items-center justify-center gap-3 rounded-md border border-border bg-card px-4 py-3 text-sm font-510 text-foreground transition-colors hover:bg-secondary"
          >
            <span>Continue with Microsoft</span>
          </a>

          <a
            href={googleLoginUrl}
            className="flex w-full items-center justify-center gap-3 rounded-md border border-border bg-card px-4 py-3 text-sm font-510 text-foreground transition-colors hover:bg-secondary"
          >
            <span>Continue with Google</span>
          </a>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-background px-2 text-muted-foreground">Or continue with email</span>
          </div>
        </div>

        <form onSubmit={handleMagicLink} className="space-y-4">
          {error && (
            <div className="rounded-md border border-status-border-danger bg-status-bg-danger p-3 text-sm text-status-text-danger">
              {error}
            </div>
          )}
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            required
            className="w-full"
          />
          <Button type="submit" disabled={loading || !email} className="w-full">
            {loading ? 'Sending…' : 'Send magic link'}
          </Button>
        </form>
      </div>
    </div>
  )
}
