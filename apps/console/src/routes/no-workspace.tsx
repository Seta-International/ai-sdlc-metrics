import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/no-workspace')({ component: NoWorkspaceRoute })

function NoWorkspaceRoute() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <div className="max-w-md p-8 text-center">
        <h1 className="mb-2 text-xl font-semibold text-ink">No workspace yet</h1>
        <p className="text-sm text-ink-muted">
          Your account isn't attached to a workspace. Ask your tenant admin to add you, or wait for
          directory sync.
        </p>
      </div>
    </div>
  )
}
