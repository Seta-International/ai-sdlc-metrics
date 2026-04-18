'use client'
import * as React from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@future/ui'
import { ImportWizard } from '../../../components/settings/ImportWizard'

export default function ImportExportPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-510 text-fg-primary">Import / Export</h2>
      <Tabs defaultValue="import">
        <TabsList>
          <TabsTrigger value="import">Import</TabsTrigger>
          <TabsTrigger value="export">Export</TabsTrigger>
        </TabsList>
        <TabsContent value="import" className="mt-4">
          <ImportWizard />
        </TabsContent>
        <TabsContent value="export" className="mt-4">
          <div className="text-sm text-fg-muted">Export functionality coming soon.</div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
