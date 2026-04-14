import { GlobalNav, LOCAL_FUTURE_APPS } from '@future/ui'

const isLocalDev = process.env['NEXT_PUBLIC_LOCAL_DEV'] === 'true'

export default function HomePage() {
  return (
    <div>
      <GlobalNav agentStrip={false} apps={isLocalDev ? LOCAL_FUTURE_APPS : undefined} />
      <main className="p-8">
        <h1 className="text-2xl font-bold">Future</h1>
        <p className="mt-2 text-gray-600">
          Press <kbd className="rounded border px-1 text-xs">⌘K</kbd> or click the grid icon to open
          the app launcher.
        </p>
      </main>
    </div>
  )
}
