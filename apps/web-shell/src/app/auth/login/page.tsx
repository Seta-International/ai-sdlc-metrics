'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Alert, AlertDescription, Button, Input, Spinner } from '@future/ui'
import {
  MICROSOFT_CALLBACK_URL,
  GOOGLE_CALLBACK_URL,
  DEFAULT_POST_LOGIN_URL,
} from '../../../lib/auth-config'
import {
  getLoginOptions,
  startOAuth,
  type LoginOptionsResult,
} from '../../../lib/auth-gateway-client'

type Screen = 'discover' | 'providers' | 'magic-sent'

export default function LoginPage() {
  const searchParams = useSearchParams()

  const [screen, setScreen] = useState<Screen>('discover')
  const [identity, setIdentity] = useState('') // email or org slug
  const [loginOptions, setLoginOptions] = useState<LoginOptionsResult | null>(null)

  const [discovering, setDiscovering] = useState(false)
  const [oauthLoading, setOauthLoading] = useState(false)
  const [magicLinkLoading, setMagicLinkLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const redirectTo = searchParams.get('redirectTo') ?? DEFAULT_POST_LOGIN_URL
  const callbackError = searchParams.get('error')

  // ----- Tenant discovery -----

  async function handleDiscover(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setDiscovering(true)

    try {
      const trimmed = identity.trim()
      const isEmail = trimmed.includes('@')
      const opts = isEmail
        ? await getLoginOptions({ emailDomain: trimmed.split('@')[1] ?? trimmed })
        : await getLoginOptions({ slug: trimmed })

      if (!opts) {
        setError('No organisation found for that email or slug. Please check and try again.')
        return
      }

      if (opts.tenant.status !== 'active') {
        setError(
          `Your organisation account is ${opts.tenant.status}. Please contact your administrator.`,
        )
        return
      }

      setLoginOptions(opts)
      setScreen('providers')
    } catch {
      setError('Unable to look up your organisation. Please try again.')
    } finally {
      setDiscovering(false)
    }
  }

  // ----- Microsoft OAuth -----

  async function handleMicrosoftLogin() {
    if (!loginOptions) return
    const microsoftMethod = loginOptions.methods.find((m) => m.type === 'microsoft')
    if (!microsoftMethod) return

    setOauthLoading(true)
    setError(null)

    try {
      const result = await startOAuth({
        tenantId: loginOptions.tenant.id,
        providerId: microsoftMethod.id,
        callbackUri: MICROSOFT_CALLBACK_URL,
        redirectTo,
      })

      window.location.href = result.authorizationUrl
    } catch {
      setError('Failed to start Microsoft sign-in. Please try again.')
      setOauthLoading(false)
    }
  }

  // ----- Google OAuth -----

  async function handleGoogleLogin() {
    if (!loginOptions) return
    const googleMethod = loginOptions.methods.find((m) => m.type === 'google')
    if (!googleMethod) return

    setOauthLoading(true)
    setError(null)

    try {
      const result = await startOAuth({
        tenantId: loginOptions.tenant.id,
        providerId: googleMethod.id,
        callbackUri: GOOGLE_CALLBACK_URL,
        redirectTo,
      })

      window.location.href = result.authorizationUrl
    } catch {
      setError('Failed to start Google sign-in. Please try again.')
      setOauthLoading(false)
    }
  }

  // ----- Magic link -----

  async function handleMagicLink() {
    if (!loginOptions) return
    const email = identity.includes('@') ? identity.trim() : ''
    if (!email) {
      setError('Enter your email address to receive a magic link.')
      return
    }

    setMagicLinkLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, tenantId: loginOptions.tenant.id }),
      })

      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        setError(data.error ?? 'Failed to send magic link')
        return
      }

      const data = (await res.json()) as { ok?: boolean; dev?: boolean }
      if (data.dev) {
        window.location.href = redirectTo
      } else {
        setScreen('magic-sent')
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setMagicLinkLoading(false)
    }
  }

  // ----- Screens -----

  if (screen === 'magic-sent') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-h2 mb-4">Check your email</h1>
          <p className="text-muted-foreground">
            We sent a magic link to <strong>{identity}</strong>. Click the link to sign in.
          </p>
        </div>
      </div>
    )
  }

  if (screen === 'providers' && loginOptions) {
    const microsoftMethod = loginOptions.methods.find((m) => m.type === 'microsoft')
    const googleMethod = loginOptions.methods.find((m) => m.type === 'google')
    const emailForMagicLink = identity.includes('@') ? identity.trim() : ''
    const hasSsoMethod =
      (microsoftMethod !== undefined && microsoftMethod.status === 'ready') ||
      (googleMethod !== undefined && googleMethod.status === 'ready')
    const hasVisibleMethods = hasSsoMethod || !!emailForMagicLink

    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="w-full max-w-md space-y-6 p-8">
          <div>
            <h1 className="text-h1 text-center">Sign in to Future</h1>
            <p className="text-muted-foreground mt-1 text-center text-sm">
              {loginOptions.tenant.name}
            </p>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-3">
            {microsoftMethod && microsoftMethod.status === 'ready' && (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={oauthLoading || magicLinkLoading}
                onClick={handleMicrosoftLogin}
              >
                {oauthLoading && <Spinner className="size-4" />}
                Continue with Microsoft
              </Button>
            )}

            {googleMethod && googleMethod.status === 'ready' && (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={oauthLoading || magicLinkLoading}
                onClick={handleGoogleLogin}
              >
                {oauthLoading && <Spinner className="size-4" />}
                Continue with Google
              </Button>
            )}

            {emailForMagicLink && (
              <>
                {hasSsoMethod && (
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center text-sm">
                      <span className="bg-background px-2 text-muted-foreground">
                        Or continue with email
                      </span>
                    </div>
                  </div>
                )}
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={oauthLoading || magicLinkLoading}
                  onClick={handleMagicLink}
                >
                  {magicLinkLoading && <Spinner className="size-4" />}
                  Send magic link to {emailForMagicLink}
                </Button>
              </>
            )}

            {!hasVisibleMethods && (
              <p className="text-muted-foreground text-center text-sm">
                No sign-in methods are currently available. Please contact your administrator.
              </p>
            )}
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => {
              setScreen('discover')
              setLoginOptions(null)
              setError(null)
            }}
          >
            Use a different account
          </Button>
        </div>
      </div>
    )
  }

  // Discovery screen (default)
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-6 p-8">
        <h1 className="text-h1 text-center">Sign in to Future</h1>

        <form onSubmit={handleDiscover} className="space-y-4">
          {callbackError && (
            <Alert variant="destructive">
              <AlertDescription>
                Sign-in failed. Please try again or contact your administrator.
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <label htmlFor="identity" className="text-sm font-medium">
              Work email or organisation slug
            </label>
            <Input
              id="identity"
              type="text"
              value={identity}
              onChange={(e) => setIdentity(e.target.value)}
              placeholder="you@company.com or company-slug"
              required
              className="w-full"
              autoFocus
            />
          </div>

          <Button type="submit" disabled={discovering || !identity.trim()} className="w-full">
            {discovering && <Spinner className="size-4" />}
            Continue
          </Button>
        </form>
      </div>
    </div>
  )
}
