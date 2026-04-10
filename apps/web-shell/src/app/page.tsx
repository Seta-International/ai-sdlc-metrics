import { GlobalNav } from '@future/ui'

export default function HomePage() {
  return (
    <div>
      <GlobalNav />
      <main className="p-8">
        <h1 className="text-2xl font-bold">Future</h1>
        <p className="mt-2 text-gray-600">Select a module from the navigation.</p>
      </main>
    </div>
  )
}
