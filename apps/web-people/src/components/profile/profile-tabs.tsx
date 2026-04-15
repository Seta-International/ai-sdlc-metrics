'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@future/ui'
import { TabOverview } from './tab-overview'
import { TabJobHistory } from './tab-job-history'
import { TabDocuments } from './tab-documents'
import { TabContracts } from './tab-contracts'
import { TabSections } from './tab-sections'
import { TabChangeRequests } from './tab-change-requests'
import { TabProbation } from './tab-probation'
import type { EmployeeProfile } from '../../lib/types'

interface ProfileTabsProps {
  profile: EmployeeProfile
  employmentId: string
  canEditPersonal: boolean
  canEditEmployment: boolean
  canEditBank: boolean
  canUploadDocuments: boolean
  canCreateContract: boolean
  canViewSalary: boolean
  canApproveChanges: boolean
  canManageProbation: boolean
  isSelf: boolean
  activeTab?: string
  onTabChange?: (tab: string) => void
}

export function ProfileTabs({
  profile,
  employmentId,
  canEditPersonal,
  canEditEmployment,
  canEditBank,
  canUploadDocuments,
  canCreateContract,
  canViewSalary,
  canApproveChanges,
  canManageProbation,
  isSelf,
  activeTab = 'overview',
  onTabChange,
}: ProfileTabsProps) {
  return (
    <Tabs value={activeTab} onValueChange={onTabChange}>
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="job-history">Job History</TabsTrigger>
        <TabsTrigger value="documents">Documents</TabsTrigger>
        <TabsTrigger value="contracts">Contracts</TabsTrigger>
        <TabsTrigger value="sections">Sections</TabsTrigger>
        <TabsTrigger value="changes">Change Requests</TabsTrigger>
        {profile.probation && <TabsTrigger value="probation">Probation</TabsTrigger>}
      </TabsList>

      <TabsContent value="overview" className="mt-6">
        <TabOverview
          profile={profile}
          canEditPersonal={canEditPersonal}
          canEditEmployment={canEditEmployment}
          canEditBank={canEditBank}
        />
      </TabsContent>

      <TabsContent value="job-history" className="mt-6">
        <TabJobHistory employmentId={employmentId} />
      </TabsContent>

      <TabsContent value="documents" className="mt-6">
        <TabDocuments employmentId={employmentId} canUpload={canUploadDocuments} />
      </TabsContent>

      <TabsContent value="contracts" className="mt-6">
        <TabContracts
          employmentId={employmentId}
          canCreate={canCreateContract}
          canViewSalary={canViewSalary}
        />
      </TabsContent>

      <TabsContent value="sections" className="mt-6">
        <TabSections employmentId={employmentId} canEdit={canEditPersonal || isSelf} />
      </TabsContent>

      <TabsContent value="changes" className="mt-6">
        <TabChangeRequests employmentId={employmentId} canApprove={canApproveChanges} />
      </TabsContent>

      {profile.probation && (
        <TabsContent value="probation" className="mt-6">
          <TabProbation probation={profile.probation} canManage={canManageProbation} />
        </TabsContent>
      )}
    </Tabs>
  )
}
