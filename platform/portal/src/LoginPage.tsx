import { Button } from '@seta/ui'
import { type SignInOptions, type SsoProviderId, signIn } from './signIn'

export interface LoginPageProps {
  /** Path to land on after a successful login. Defaults to '/'. */
  returnTo?: string
  /** Title displayed above the buttons. Defaults to 'Sign in to Seta'. */
  title?: string
  /** Providers to expose, in display order. Defaults to ['entra', 'google']. */
  providers?: readonly SsoProviderId[]
  /** Override fetch / login URL (testing or alternate deployments). */
  signInOptions?: Omit<SignInOptions, 'returnTo'>
}

const LABELS: Record<SsoProviderId, string> = {
  entra: 'Sign in with Microsoft',
  google: 'Sign in with Google',
}

export function LoginPage({
  returnTo = '/',
  title = 'Sign in to Seta',
  providers = ['entra', 'google'],
  signInOptions,
}: LoginPageProps) {
  async function onClick(provider: SsoProviderId) {
    const { url } = await signIn(provider, { ...signInOptions, returnTo })
    window.location.href = url
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-hairline bg-canvas-soft p-8 shadow-card">
        <h1 className="text-center text-2xl font-semibold text-ink">{title}</h1>
        <div className="flex flex-col gap-3">
          {providers.map((p, i) => (
            <Button
              key={p}
              variant={i === 0 ? 'primary' : 'secondary'}
              onClick={() => onClick(p)}
              aria-label={LABELS[p]}
            >
              {LABELS[p]}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}
