import { LoginPage } from '@seta/identity-client'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/login')({
  component: () => <LoginPage returnTo="/" />,
})
