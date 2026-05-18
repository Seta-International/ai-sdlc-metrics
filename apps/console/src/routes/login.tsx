import { LoginPage } from '@seta/identity-client'
import { createFileRoute } from '@tanstack/react-router'

const buildSha = import.meta.env.VITE_PUBLIC_BUILD_SHA ?? 'dev'

export const Route = createFileRoute('/login')({
  component: () => <LoginPage returnTo="/" buildSha={buildSha} logoUrl="/console/seta-logo.svg" />,
})
