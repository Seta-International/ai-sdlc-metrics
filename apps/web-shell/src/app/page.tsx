import { GlobalNav } from '@future/ui'

export default function HomePage() {
  return (
    <div>
      <GlobalNav agentStrip={false} />
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
