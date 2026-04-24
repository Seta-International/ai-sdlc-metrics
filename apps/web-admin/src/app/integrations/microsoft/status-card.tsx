import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@future/ui'
import { ChevronDown } from '@future/ui/icons'

export interface StatusCardProps {
  connectedAt: string | null
  tenantAdId: string
  onPause: () => void
  onDestroy: () => void
}

export function StatusCard({ connectedAt, tenantAdId, onPause, onDestroy }: StatusCardProps) {
  const connectedAtLabel = connectedAt ? new Date(connectedAt).toLocaleString() : '—'

  return (
    <Card>
      <CardHeader className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle>Microsoft 365 integration</CardTitle>
          <CardDescription>
            Connected {connectedAtLabel} · Directory {tenantAdId}
          </CardDescription>
          <CardDescription>Last sync: —</CardDescription>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              Disconnect
              <ChevronDown className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onPause}>Pause sync</DropdownMenuItem>
            <DropdownMenuItem onSelect={onDestroy} variant="destructive">
              Disconnect (keep data as Future-only)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled>
            Linked Groups
          </Button>
          <Button variant="outline" size="sm" disabled>
            Rosters
          </Button>
          <Button variant="outline" size="sm" disabled>
            Conflicts
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Linked Groups, Rosters, and Conflicts will be available as sync features ship.
        </p>
      </CardContent>
    </Card>
  )
}
