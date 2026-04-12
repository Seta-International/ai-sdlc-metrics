import { PeopleDirectoryTable } from '../components/people-directory-table'

export default function HomePage() {
  return (
    <main className="container mx-auto py-8">
      <h1 className="text-2xl font-semibold mb-6">People Directory</h1>
      <PeopleDirectoryTable resourceKey="people.directory" />
    </main>
  )
}
