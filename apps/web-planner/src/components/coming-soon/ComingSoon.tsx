import { Alert, AlertDescription, AlertTitle } from '@future/ui'
import { Clock } from 'lucide-react'

export function ComingSoon({ view, flag }: { view: string; flag: string }) {
  return (
    <div className="flex items-center justify-center p-12">
      <Alert className="max-w-md">
        <Clock className="size-4" />
        <AlertTitle>{view} view coming soon</AlertTitle>
        <AlertDescription>
          This view is not yet available. Enable the <code>{flag}</code> feature flag to preview it.
        </AlertDescription>
      </Alert>
    </div>
  )
}
