'use client'

import { Pencil, Check, File, Users, FileText } from '@future/ui/icons'

// TODO: replace with real people.getActivityFeed query once backend is wired

interface MockActivityEvent {
  id: string
  eventType: 'edit' | 'approval' | 'document' | 'org_change' | 'contract'
  description: string
  actorName: string
  occurredAt: string
}

const MOCK_EVENTS: MockActivityEvent[] = [
  {
    id: 'evt-1',
    eventType: 'org_change',
    description: 'Promoted to Staff Engineer · L6',
    actorName: 'Mei Chen',
    occurredAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'evt-2',
    eventType: 'document',
    description: 'Document uploaded: Tax 2025.pdf',
    actorName: 'Diego Ribeiro',
    occurredAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'evt-3',
    eventType: 'org_change',
    description: 'Manager changed to Mei Chen',
    actorName: 'Ana Silva',
    occurredAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'evt-4',
    eventType: 'edit',
    description: 'Work arrangement updated to Hybrid',
    actorName: 'Diego Ribeiro',
    occurredAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'evt-5',
    eventType: 'contract',
    description: 'Contract signed: indefinite · USD 168,000',
    actorName: 'HR Team',
    occurredAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  },
]

const EVENT_ICON: Record<string, React.ElementType> = {
  edit: Pencil,
  approval: Check,
  document: File,
  org_change: Users,
  contract: FileText,
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (days === 0) return 'Today'
  if (days === 1) return '1 day ago'
  if (days < 7) return `${days} days ago`
  const weeks = Math.floor(days / 7)
  if (weeks === 1) return '1 week ago'
  return `${weeks} weeks ago`
}

interface TabActivityProps {
  employmentId: string
}

export function TabActivity({ employmentId: _ }: TabActivityProps) {
  return (
    <div className="p-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="text-sm font-510 text-foreground">Activity</span>
        <span className="text-xs text-muted-foreground">{MOCK_EVENTS.length} events</span>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        {MOCK_EVENTS.map((evt, i) => {
          const Icon = EVENT_ICON[evt.eventType] ?? Pencil
          return (
            <div
              key={evt.id}
              data-testid="activity-event"
              className={`flex items-start gap-3 px-4 py-3 ${
                i > 0 ? 'border-t border-border/60' : ''
              }`}
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary/40">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-secondary-foreground">{evt.description}</p>
                <p className="text-tiny text-muted-foreground">
                  by {evt.actorName} · {relativeTime(evt.occurredAt)}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex justify-center">
        <button
          disabled
          className="text-xs text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          No more events
        </button>
      </div>
    </div>
  )
}
