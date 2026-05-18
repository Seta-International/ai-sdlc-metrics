import { CallbackSplash } from '@seta/identity-client'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/login/$provider/callback')({
  component: () => <CallbackSplash />,
})
