import { Button, Input, Label } from '@seta/ui'
import { Loader2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'

export interface MagicLinkRequestPageProps {
  /** Override fetch (testing). */
  fetch?: typeof fetch
  /** Optional path back to the login page. */
  loginHref?: string
}

export function MagicLinkRequestPage({
  fetch: fetchImpl,
  loginHref = '/login',
}: MagicLinkRequestPageProps) {
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    try {
      await (fetchImpl ?? fetch)('/sso/magic/request', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      })
    } finally {
      setPending(false)
      setSubmitted(true)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#eef0fb_0%,#c7d2fe_35%,#a5b4fc_65%,#5e6ad2_100%)] px-4 py-12">
      <div className="w-full max-w-[400px] rounded-xl bg-canvas p-10 shadow-[0_8px_32px_rgba(15,23,42,0.08)]">
        <h1 className="font-semibold text-[22px] leading-tight text-ink">
          Email me a sign-in link
        </h1>
        <p className="mt-2 text-[14px] text-ink-mute">
          For tenant owners only. Use this when your workspace's SSO is misconfigured.
        </p>
        {submitted ? (
          <p className="mt-6 rounded-md border border-divider bg-canvas-mute px-3 py-2 text-[14px]">
            If your email matches a workspace owner, a sign-in link has been sent. It expires in 10
            minutes.
          </p>
        ) : (
          <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
            <Label htmlFor="email">Work email</Label>
            <Input
              id="email"
              type="email"
              required
              // biome-ignore lint/a11y/noAutofocus: recovery screen is the user's primary intent on this view.
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@example.com"
            />
            <Button
              type="submit"
              variant="primary"
              disabled={pending || !email}
              icon={pending ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
            >
              Email me a link
            </Button>
          </form>
        )}
        <p className="mt-6 text-center text-[12px] text-ink-mute">
          <a href={loginHref} className="hover:text-ink hover:underline">
            Back to sign in
          </a>
        </p>
      </div>
    </div>
  )
}
