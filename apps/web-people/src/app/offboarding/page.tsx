// apps/web-people/src/app/offboarding/page.tsx
'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@future/ui'
import { OffboardingCasesTable } from '../../components/offboarding/offboarding-cases-table'
import { OffboardingMyTasks } from '../../components/offboarding/offboarding-my-tasks'

export default function OffboardingPage() {
  return (
    <main className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-[510] tracking-[-0.288px] text-[#f7f8f8]">Offboarding</h1>
        <p className="mt-1 text-sm text-[#8a8f98]">Manage offboarding cases and tasks.</p>
      </div>

      <Tabs defaultValue="cases">
        <TabsList>
          <TabsTrigger value="cases">Active Cases</TabsTrigger>
          <TabsTrigger value="my-tasks">My Tasks</TabsTrigger>
        </TabsList>
        <TabsContent value="cases" className="mt-4">
          <OffboardingCasesTable />
        </TabsContent>
        <TabsContent value="my-tasks" className="mt-4">
          <OffboardingMyTasks />
        </TabsContent>
      </Tabs>
    </main>
  )
}
