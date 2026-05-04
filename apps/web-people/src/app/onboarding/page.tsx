'use client'

import * as React from 'react'
import { Button } from '@future/ui'
import { Plus } from '@future/ui/icons'
import { OnboardingKanban } from '../../components/onboarding/OnboardingKanban'
import { NewOnboardingDialog } from '../../components/onboarding/NewOnboardingDialog'

export default function OnboardingPage() {
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [refreshKey, setRefreshKey] = React.useState(0)

  return (
    <main className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h1 className="text-2xl font-510 tracking-h2 text-fg-primary">Onboarding</h1>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="size-4 mr-1.5" /> New onboarding
        </Button>
      </div>

      <OnboardingKanban key={refreshKey} onAddClick={() => setDialogOpen(true)} />

      <NewOnboardingDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={() => {
          setDialogOpen(false)
          setRefreshKey((k) => k + 1)
        }}
      />
    </main>
  )
}
