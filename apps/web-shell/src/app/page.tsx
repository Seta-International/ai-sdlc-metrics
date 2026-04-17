import { GlobalNav } from '@future/ui'
import { SessionUserMenu, StubNotificationsPopover } from '@future/app-layout'

export default function HomePage() {
  return (
    <div>
      <GlobalNav
        agentStrip={false}
        userMenuSlot={<SessionUserMenu />}
        notificationsSlot={<StubNotificationsPopover />}
      />
      <main className="p-8">
        <h1 className="text-h2">Future</h1>
        <p className="mt-2 text-muted-foreground">
          Press <kbd className="font-mono rounded border border-border px-1 text-xs">⌘K</kbd> or
          click the grid icon to open the app launcher.
        </p>
      </main>
    </div>
  )
}
