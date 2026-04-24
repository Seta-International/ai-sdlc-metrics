import { Alert, AlertDescription, AlertTitle, Button } from '@future/ui'
import { AlertTriangle } from '@future/ui/icons'

export interface InvalidBannerProps {
  reason: string | null
  onReconnect: () => void
}

export function InvalidBanner({ reason, onReconnect }: InvalidBannerProps) {
  return (
    <Alert variant="destructive">
      <AlertTriangle className="size-4" />
      <AlertTitle>Microsoft 365 sync is disconnected</AlertTitle>
      <AlertDescription>
        Reason: {reason ?? 'authentication failed'}. Plans are still editable; changes resume after
        reconnect.
      </AlertDescription>
      <Button onClick={onReconnect} className="mt-3">
        Reconnect Microsoft 365
      </Button>
    </Alert>
  )
}
