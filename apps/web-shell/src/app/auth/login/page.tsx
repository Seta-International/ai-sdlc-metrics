'use client'

import { useState } from 'react'
import { MICROSOFT_CONFIG, GOOGLE_CONFIG } from '../../../lib/auth-config'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleMagicLink(e: React.FormEvent) {
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
          window.location.href = '/'
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

  const msLoginUrl = `${MICROSOFT_CONFIG.authorizationEndpoint}?client_id=${MICROSOFT_CONFIG.clientId}&response_type=code&redirect_uri=${encodeURIComponent(MICROSOFT_CONFIG.redirectUri)}&scope=${encodeURIComponent(MICROSOFT_CONFIG.scope)}&response_mode=query`

  const googleLoginUrl = `${GOOGLE_CONFIG.authorizationEndpoint}?client_id=${GOOGLE_CONFIG.clientId}&response_type=code&redirect_uri=${encodeURIComponent(GOOGLE_CONFIG.redirectUri)}&scope=${encodeURIComponent(GOOGLE_CONFIG.scope)}`

  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Check your email</h1>
          <p className="text-gray-600">
            We sent a magic link to <strong>{email}</strong>. Click the link to sign in.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-6 p-8">
        <h1 className="text-3xl font-bold text-center">Sign in to Future</h1>

        <div className="space-y-3">
          <a
            href={msLoginUrl}
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <span>Continue with Microsoft</span>
          </a>

          <a
            href={googleLoginUrl}
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <span>Continue with Google</span>
          </a>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-white px-2 text-gray-500">Or continue with email</span>
          </div>
        </div>

        <form onSubmit={handleMagicLink} className="space-y-4">
          {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            required
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading || !email}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Sending…' : 'Send magic link'}
          </button>
        </form>
      </div>
    </div>
  )
}
