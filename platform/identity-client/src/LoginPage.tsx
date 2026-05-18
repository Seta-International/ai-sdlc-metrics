import { Button } from '@seta/ui'
import { Loader2, X } from 'lucide-react'
import { type ReactElement, useState } from 'react'
import { type SignInOptions, type SsoProviderId, signIn } from './signIn'

export interface LoginPageProps {
  /** Path to land on after a successful login. Defaults to '/'. */
  returnTo?: string
  /** Title displayed above the buttons. Defaults to 'Sign in to Seta'. */
  title?: string
  /** Helper text below the title. */
  subtitle?: string
  /** Providers to expose, in display order. Defaults to ['entra', 'google']. */
  providers?: readonly SsoProviderId[]
  /** Build SHA shown in the footer. Defaults to 'dev'. */
  buildSha?: string
  /** Terms-of-service URL. */
  termsUrl?: string
  /** Privacy-policy URL. */
  privacyUrl?: string
  /** Wordmark/logo image URL. When omitted, a minimal text wordmark is shown. */
  logoUrl?: string
  /** Alt text for the logo image. Defaults to 'Seta'. */
  logoAlt?: string
  /** Override fetch / login URL (testing or alternate deployments). */
  signInOptions?: Omit<SignInOptions, 'returnTo'>
}

const LABELS: Record<SsoProviderId, string> = {
  entra: 'Sign in with Microsoft',
  google: 'Sign in with Google',
}

const GLYPHS: Record<SsoProviderId, ReactElement> = {
  entra: <MicrosoftGlyph />,
  google: <GoogleGlyph />,
}

export function LoginPage({
  returnTo = '/',
  title = 'Sign in to Seta',
  subtitle = 'Use your work account to continue.',
  providers = ['entra', 'google'],
  buildSha = 'dev',
  termsUrl = '/legal/terms',
  privacyUrl = '/legal/privacy',
  logoUrl,
  logoAlt = 'Seta',
  signInOptions,
}: LoginPageProps) {
  const [pending, setPending] = useState<SsoProviderId | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onClick(provider: SsoProviderId) {
    setError(null)
    setPending(provider)
    try {
      const { url } = await signIn(provider, { ...signInOptions, returnTo })
      window.location.href = url
    } catch {
      setError("We couldn't sign you in. Please try again.")
      setPending(null)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#eef0fb_0%,#c7d2fe_35%,#a5b4fc_65%,#5e6ad2_100%)] px-4 py-12">
      <div className="w-full max-w-[400px] rounded-xl bg-canvas p-10 shadow-[0_8px_32px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col items-center gap-2">
          {logoUrl ? (
            <img src={logoUrl} alt={logoAlt} className="h-8 w-auto select-none" />
          ) : (
            <Wordmark />
          )}
        </div>

        <div className="mt-8 space-y-1.5 text-center">
          <h1 className="font-semibold text-[26px] leading-[1.12] tracking-[-0.5px] text-ink">
            {title}
          </h1>
          <p className="text-[14px] leading-[1.5] text-ink-mute">{subtitle}</p>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-6 flex items-start gap-2 rounded-md border border-error/20 bg-error-soft px-3 py-2 text-[13px] leading-[1.4] text-error"
          >
            <span className="flex-1">{error}</span>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setError(null)}
              className="-mr-1 -mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-md text-error/70 transition-colors hover:bg-error/10 hover:text-error"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3">
          {providers.map((p, i) => (
            <Button
              key={p}
              variant={i === 0 ? 'primary' : 'secondary'}
              onClick={() => onClick(p)}
              aria-label={LABELS[p]}
              aria-busy={pending === p}
              disabled={pending !== null}
              icon={pending === p ? <Loader2 className="h-4 w-4 animate-spin" /> : GLYPHS[p]}
            >
              {LABELS[p]}
            </Button>
          ))}
        </div>

        <div className="mt-8 flex flex-col items-center gap-1 text-center text-[12px] leading-[1.4] text-ink-mute">
          <div className="flex items-center gap-2">
            <a href={termsUrl} className="hover:text-ink hover:underline">
              Terms
            </a>
            <span aria-hidden="true">·</span>
            <a href={privacyUrl} className="hover:text-ink hover:underline">
              Privacy
            </a>
          </div>
          <div className="text-ink-subtle tabular-nums">v{buildSha}</div>
        </div>
      </div>
    </div>
  )
}

function Wordmark() {
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary text-on-primary font-semibold text-[15px] leading-none tracking-[-0.2px] shadow-[0_2px_6px_rgba(94,106,210,0.35)]"
      >
        S
      </span>
      <span className="font-semibold text-[18px] leading-none tracking-[-0.2px] text-ink">
        Seta
      </span>
    </div>
  )
}

function MicrosoftGlyph() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="0" y="0" width="7" height="7" fill="#F25022" />
      <rect x="9" y="0" width="7" height="7" fill="#7FBA00" />
      <rect x="0" y="9" width="7" height="7" fill="#00A4EF" />
      <rect x="9" y="9" width="7" height="7" fill="#FFB900" />
    </svg>
  )
}

function GoogleGlyph() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.614Z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
        fill="#EA4335"
      />
    </svg>
  )
}
