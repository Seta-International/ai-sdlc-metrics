import { CallbackSplash } from '@seta/portal'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/login/$provider/callback')({
  component: () => <CallbackSplash />,
})
