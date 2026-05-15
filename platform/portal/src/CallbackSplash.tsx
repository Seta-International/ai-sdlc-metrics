export interface CallbackSplashProps {
  /** Message shown while the cookie-mint redirect resolves. */
  message?: string
}

export function CallbackSplash({ message = 'Signing you in…' }: CallbackSplashProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <p className="text-ink-mute">{message}</p>
    </div>
  )
}
