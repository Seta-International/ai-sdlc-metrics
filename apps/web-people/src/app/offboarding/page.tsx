'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@future/ui'
import { WorkflowCasesTable } from '../../components/workflow/WorkflowCasesTable'
import { WorkflowMyTasks } from '../../components/workflow/WorkflowMyTasks'

export default function OffboardingPage() {
  return (
    <main className="container mx-auto p-3 space-y-6">
      <div>
        <h1 className="text-2xl font-510 tracking-h2 text-fg-primary">Offboarding</h1>
        <p className="mt-1 text-sm text-fg-muted">Manage offboarding cases and tasks.</p>
      </div>

      <Tabs defaultValue="cases">
        <TabsList>
          <TabsTrigger value="cases">Active Cases</TabsTrigger>
          <TabsTrigger value="my-tasks">My Tasks</TabsTrigger>
        </TabsList>
        <TabsContent value="cases" className="mt-4">
          <WorkflowCasesTable type="offboarding" />
        </TabsContent>
        <TabsContent value="my-tasks" className="mt-4">
          <WorkflowMyTasks type="offboarding" />
        </TabsContent>
      </Tabs>
    </main>
  )
}
