'use client'

import * as React from 'react'
import {
  Button,
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Spinner,
} from '@future/ui'
import { Download, LayoutGrid, X } from '@future/ui/icons'

type Team = { id: string; name: string }

export type OrgChartToolbarProps = {
  teams: Team[]
  selectedTeamId: string | null
  isCompact: boolean
  isExporting: boolean
  onTeamChange: (teamId: string | null) => void
  onCompactToggle: () => void
  onExport: () => void
}

export function OrgChartToolbar({
  teams,
  selectedTeamId,
  isCompact,
  isExporting,
  onTeamChange,
  onCompactToggle,
  onExport,
}: OrgChartToolbarProps) {
  const [teamOpen, setTeamOpen] = React.useState(false)
  const selectedTeam = teams.find((t) => t.id === selectedTeamId)

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {selectedTeam ? (
          <div className="flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs">
            <span className="text-fg-subtle">Team</span>
            <span className="font-510 text-fg-primary">{selectedTeam.name}</span>
            <button
              type="button"
              aria-label="Clear team filter"
              onClick={() => onTeamChange(null)}
              className="ml-1 rounded-full p-0.5 text-fg-muted hover:text-fg-primary"
            >
              <X className="size-3" />
            </button>
          </div>
        ) : (
          <Popover open={teamOpen} onOpenChange={setTeamOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Team filter"
                className="flex items-center rounded-full border border-sidebar-border bg-transparent px-3 py-1 text-xs text-fg-subtle hover:text-fg-primary"
              >
                Team
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-0" align="start">
              <Command>
                <CommandInput placeholder="Search team…" />
                <CommandList>
                  <CommandGroup>
                    {teams.map((team) => (
                      <CommandItem
                        key={team.id}
                        value={team.name}
                        onSelect={() => {
                          onTeamChange(team.id)
                          setTeamOpen(false)
                        }}
                      >
                        {team.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}

        <div className="flex items-center rounded-full border border-sidebar-border px-3 py-1 text-xs text-fg-subtle">
          Location
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant={isCompact ? 'secondary' : 'outline'}
          size="sm"
          onClick={onCompactToggle}
          aria-label="Compact view"
          aria-pressed={isCompact}
        >
          <LayoutGrid className="size-3.5" />
          Compact view
        </Button>

        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={onExport}
          disabled={isExporting}
          aria-label="Export org chart"
        >
          {isExporting ? (
            <>
              <Spinner className="size-3.5" />
              Exporting…
            </>
          ) : (
            <>
              <Download className="size-3.5" />
              Export
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
