import { PeopleDirectoryTable } from '../components/people-directory-table'

export default function DirectoryPage() {
  return (
    <main className="container mx-auto p-3 space-y-6">
      <div>
        <h1 className="text-2xl font-510 tracking-h2 text-fg-primary">People Directory</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Browse and manage all employees across the organization.
        </p>
      </div>
      <PeopleDirectoryTable resourceKey="people.directory" />
    </main>
  )
}
