import { Button } from '@future/ui'
import { Input } from '@future/ui'
import { Label } from '@future/ui'
import { MICROSOFT_CONFIG, GOOGLE_CONFIG } from '../../../lib/auth-config'

function buildMicrosoftAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: MICROSOFT_CONFIG.clientId,
    response_type: 'code',
    redirect_uri: MICROSOFT_CONFIG.redirectUri,
    scope: MICROSOFT_CONFIG.scope,
    response_mode: 'query',
    state,
  })
  return `${MICROSOFT_CONFIG.authorizeUrl}?${params.toString()}`
}

function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CONFIG.clientId,
    response_type: 'code',
    redirect_uri: GOOGLE_CONFIG.redirectUri,
    scope: GOOGLE_CONFIG.scope,
    state,
  })
  return `${GOOGLE_CONFIG.authorizeUrl}?${params.toString()}`
}

export default function LoginPage() {
  // In production, state would include CSRF token + tenant slug
  const state = encodeURIComponent(JSON.stringify({ intent: 'login' }))
  const microsoftUrl = buildMicrosoftAuthUrl(state)
  const googleUrl = buildGoogleAuthUrl(state)

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0A0F1E]">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-white/10 bg-[#0F1B2D] p-8">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-white">Sign in to Future</h1>
          <p className="mt-2 text-sm text-white/60">Enterprise OS by SETA</p>
        </div>

        <div className="space-y-3">
          <Button asChild size="lg" className="w-full bg-[#1D4ED8] hover:bg-[#1E40AF]">
            <a href={microsoftUrl}>Sign in with Microsoft</a>
          </Button>

          <Button asChild size="lg" variant="outline" className="w-full">
            <a href={googleUrl}>Sign in with Google</a>
          </Button>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/10" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-[#0F1B2D] px-2 text-white/40">or</span>
          </div>
        </div>

        <form action="/api/auth/magic-link" method="POST" className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="email" className="text-white/80">
              Email address
            </Label>
            <Input id="email" name="email" type="email" required placeholder="you@company.com" />
          </div>
          <Button type="submit" variant="outline" size="lg" className="w-full">
            Send magic link
          </Button>
        </form>
      </div>
    </div>
  )
}
