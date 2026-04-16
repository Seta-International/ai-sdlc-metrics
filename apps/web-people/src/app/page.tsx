import { PeopleDirectoryTable } from '../components/people-directory-table'

export default function DirectoryPage() {
  return (
    <main className="container mx-auto p-3 space-y-6">
      <div>
        <h1 className="text-2xl font-510 tracking-[-0.288px] text-[#f7f8f8]">People Directory</h1>
        <p className="mt-1 text-sm text-[#8a8f98]">
          Browse and manage all employees across the organization.
        </p>
      </div>
      <PeopleDirectoryTable resourceKey="people.directory" />
    </main>
  )
}
