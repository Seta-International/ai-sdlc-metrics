import { Button } from '@seta/ui'
import { Loader2, X } from 'lucide-react'
import { type FormEvent, type ReactElement, useEffect, useState } from 'react'
import {
  clearLastLoginHintCookie,
  type LastLoginHint,
  readLastLoginHintCookie,
} from './LastLoginHint'
import { discover, start } from './signIn'

export interface LoginPageProps {
  returnTo?: string
  title?: string
  subtitle?: string
  buildSha?: string
  termsUrl?: string
  privacyUrl?: string
  logoUrl?: string
  logoAlt?: string
}

export function LoginPage({
  returnTo = '/',
  title = 'Sign in to Seta',
  subtitle = 'Use your work email to continue.',
  buildSha = 'dev',
  termsUrl = '/legal/terms',
  privacyUrl = '/legal/privacy',
  logoUrl,
  logoAlt = 'Seta',
}: LoginPageProps) {
  const [hint, setHint] = useState<LastLoginHint | null>(null)
  useEffect(() => {
    setHint(readLastLoginHintCookie())
  }, [])

  if (hint) {
    return (
      <Shell
        {...(logoUrl !== undefined && { logoUrl })}
        logoAlt={logoAlt}
        title={title}
        subtitle={subtitle}
        buildSha={buildSha}
        termsUrl={termsUrl}
        privacyUrl={privacyUrl}
      >
        <StateB
          hint={hint}
          returnTo={returnTo}
          onUseDifferent={() => {
            clearLastLoginHintCookie()
            setHint(null)
          }}
        />
      </Shell>
    )
  }
  return (
    <Shell
      {...(logoUrl !== undefined && { logoUrl })}
      logoAlt={logoAlt}
      title={title}
      subtitle={subtitle}
      buildSha={buildSha}
      termsUrl={termsUrl}
      privacyUrl={privacyUrl}
    >
      <StateA returnTo={returnTo} />
    </Shell>
  )
}

function StateA({ returnTo }: { returnTo: string }) {
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      const r = await discover(email)
      if (!r.ok) {
        setError('No workspace found for that email. Ask your admin to invite you.')
        return
      }
      const { url } = await start(email, { returnTo })
      window.location.href = url
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="mt-6 flex flex-col gap-3" onSubmit={submit}>
      {error && <ErrorBanner text={error} onClear={() => setError(null)} />}
      <label className="text-[13px] text-ink-mute" htmlFor="email">
        Work email
      </label>
      <input
        id="email"
        type="email"
        required
        // biome-ignore lint/a11y/noAutofocus: login screen is the user's primary intent on this view.
        autoFocus
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded-md border border-divider bg-canvas px-3 py-2 text-[14px] focus:border-primary focus:outline-none"
        placeholder="alice@example.com"
      />
      <Button
        type="submit"
        variant="primary"
        disabled={pending || !email}
        icon={pending ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
      >
        Continue
      </Button>
    </form>
  )
}

function StateB({
  hint,
  returnTo,
  onUseDifferent,
}: {
  hint: LastLoginHint
  returnTo: string
  onUseDifferent: () => void
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function go() {
    setError(null)
    setPending(true)
    try {
      const { url } = await start(hint.email, { returnTo })
      window.location.href = url
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-3">
      {error && <ErrorBanner text={error} onClear={() => setError(null)} />}
      <p className="text-[14px] text-ink-mute">Welcome back to {hint.tenantDisplayName}.</p>
      <Button
        variant="primary"
        onClick={go}
        disabled={pending}
        icon={pending ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
        aria-label={`Continue as ${hint.email}`}
      >
        Continue as {hint.email}
      </Button>
      <Button variant="secondary" onClick={onUseDifferent}>
        Use a different account
      </Button>
    </div>
  )
}

function ErrorBanner({ text, onClear }: { text: string; onClear: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md border border-error/20 bg-error-soft px-3 py-2 text-[13px] text-error"
    >
      <span className="flex-1">{text}</span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onClear}
        className="-mr-1 -mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-md text-error/70 hover:bg-error/10 hover:text-error"
      >
        <X className="h-3.5 w-3.5" strokeWidth={1.75} />
      </button>
    </div>
  )
}

function Shell({
  children,
  logoUrl,
  logoAlt,
  title,
  subtitle,
  buildSha,
  termsUrl,
  privacyUrl,
}: {
  children: ReactElement
  logoUrl?: string
  logoAlt: string
  title: string
  subtitle: string
  buildSha: string
  termsUrl: string
  privacyUrl: string
}) {
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
        {children}
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
