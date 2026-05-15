import { EmptyState } from '@seta/ui'
import { createFileRoute } from '@tanstack/react-router'
import { Hammer } from 'lucide-react'

export const Route = createFileRoute('/_authed/workflows')({
  component: () => (
    <EmptyState icon={Hammer} title="Coming soon" description="This page lands in a later PR." />
  ),
})
