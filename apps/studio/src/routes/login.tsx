import { LoginPage } from '@seta/portal'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/login')({
  component: () => <LoginPage returnTo="/tenants" />,
})
