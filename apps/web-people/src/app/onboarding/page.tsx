// apps/web-people/src/app/onboarding/page.tsx
'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@future/ui'
import { OnboardingCasesTable } from '../../components/onboarding/OnboardingCasesTable'
import { OnboardingMyTasks } from '../../components/onboarding/OnboardingMyTasks'

export default function OnboardingPage() {
  return (
    <main className="container mx-auto p-3 space-y-6">
      <div>
        <h1 className="text-2xl font-510 tracking-h2 text-fg-primary">Onboarding</h1>
        <p className="mt-1 text-sm text-fg-muted">Manage onboarding cases and tasks.</p>
      </div>

      <Tabs defaultValue="cases">
        <TabsList>
          <TabsTrigger value="cases">Active Cases</TabsTrigger>
          <TabsTrigger value="my-tasks">My Tasks</TabsTrigger>
        </TabsList>
        <TabsContent value="cases" className="mt-4">
          <OnboardingCasesTable />
        </TabsContent>
        <TabsContent value="my-tasks" className="mt-4">
          <OnboardingMyTasks />
        </TabsContent>
      </Tabs>
    </main>
  )
}
