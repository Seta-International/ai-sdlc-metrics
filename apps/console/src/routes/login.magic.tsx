import { MagicLinkRequestPage } from '@seta/identity-client'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/login/magic')({
  component: () => <MagicLinkRequestPage loginHref="/console/login" />,
})
