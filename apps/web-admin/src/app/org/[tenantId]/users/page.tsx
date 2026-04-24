'use client'

import { Alert, AlertDescription, AlertTitle } from '@future/ui'
import { AdminPageHeader } from '@/components/admin-page-header'

interface UsersPageProps {
  params: { tenantId: string }
}

export default function UsersPage({ params: { tenantId: _tenantId } }: UsersPageProps) {
  return (
    <main className="p-8">
      <AdminPageHeader
        title="Users"
        description="Manage users and their access within this tenant."
      />

      <div className="mt-6">
        <Alert>
          <AlertTitle>Coming in next release</AlertTitle>
          <AlertDescription>
            The users management API is not yet implemented. User provisioning and role assignment
            will be available in the next release.
          </AlertDescription>
        </Alert>
      </div>
    </main>
  )
}
