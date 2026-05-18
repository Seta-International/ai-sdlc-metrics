import { SetaProvider } from '@seta/ui'
import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import { client } from '../api/client'
import { env } from '../env'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootComponent,
})

function RootComponent() {
  const { queryClient } = Route.useRouteContext()
  return (
    <SetaProvider client={client} queryClient={queryClient}>
      <div className="flex min-h-screen flex-col">
        <div className="flex-1">
          <Outlet />
        </div>
        <footer className="border-t border-hairline px-6 py-2 text-xs text-ink-mute">
          <span className="font-mono">build {env.VITE_PUBLIC_BUILD_SHA.slice(0, 7)}</span>
        </footer>
      </div>
    </SetaProvider>
  )
}
