# OrgChartToolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `OrgChartToolbar` — a standalone component with a dismissible Team filter chip, a static Location chip, a compact view toggle, and an Export button.

**Architecture:** Pure presentational component. Owns only the team picker popover open/close state; all other state is lifted to `OrgChartTree` and passed as props. No data fetching.

**Tech Stack:** React (`'use client'`), `@future/ui` (Button, Command, CommandGroup, CommandInput, CommandItem, CommandList, Popover, PopoverContent, PopoverTrigger, Spinner), `@future/ui/icons` (Download, LayoutGrid, X), Vitest + Testing Library

---

## File Structure

| File                                                      | Action     | Responsibility           |
| --------------------------------------------------------- | ---------- | ------------------------ |
| `apps/web-people/src/components/OrgChartToolbar.spec.tsx` | **Create** | Unit tests               |
| `apps/web-people/src/components/OrgChartToolbar.tsx`      | **Create** | Component implementation |

---

## Task 1: Write failing tests

**Files:**

- Create: `apps/web-people/src/components/OrgChartToolbar.spec.tsx`

- [ ] **Step 1: Create the spec file**

Create `apps/web-people/src/components/OrgChartToolbar.spec.tsx`:

```tsx
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OrgChartToolbar } from './OrgChartToolbar'

const teams = [
  { id: 'team-1', name: 'Engineering' },
  { id: 'team-2', name: 'Product' },
]

const defaults = {
  teams,
  selectedTeamId: null as string | null,
  isCompact: false,
  isExporting: false,
  onTeamChange: vi.fn(),
  onCompactToggle: vi.fn(),
  onExport: vi.fn(),
}

describe('OrgChartToolbar', () => {
  afterEach(cleanup)

  it('renders ghost Team chip when no team is selected', () => {
    render(<OrgChartToolbar {...defaults} />)
    expect(screen.getByRole('button', { name: /team filter/i })).toBeTruthy()
  })

  it('renders active Team chip with name and dismiss button when team is selected', () => {
    render(<OrgChartToolbar {...defaults} selectedTeamId="team-1" />)
    expect(screen.getByText('Engineering')).toBeTruthy()
    expect(screen.getByRole('button', { name: /clear team filter/i })).toBeTruthy()
  })

  it('calls onTeamChange(null) when dismiss button is clicked', () => {
    const onTeamChange = vi.fn()
    render(<OrgChartToolbar {...defaults} selectedTeamId="team-1" onTeamChange={onTeamChange} />)
    fireEvent.click(screen.getByRole('button', { name: /clear team filter/i }))
    expect(onTeamChange).toHaveBeenCalledWith(null)
  })

  it('renders Location chip as non-interactive text', () => {
    render(<OrgChartToolbar {...defaults} />)
    expect(screen.getByText('Location')).toBeTruthy()
  })

  it('calls onCompactToggle when compact view button is clicked', () => {
    const onCompactToggle = vi.fn()
    render(<OrgChartToolbar {...defaults} onCompactToggle={onCompactToggle} />)
    fireEvent.click(screen.getByRole('button', { name: /compact view/i }))
    expect(onCompactToggle).toHaveBeenCalledTimes(1)
  })

  it('marks compact view button aria-pressed=true when isCompact is true', () => {
    render(<OrgChartToolbar {...defaults} isCompact={true} />)
    expect(screen.getByRole('button', { name: /compact view/i }).getAttribute('aria-pressed')).toBe(
      'true',
    )
  })

  it('shows spinner and disables export button when isExporting is true', () => {
    render(<OrgChartToolbar {...defaults} isExporting={true} />)
    const btn = screen.getByRole('button', { name: /export org chart/i })
    expect(btn.hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('status')).toBeTruthy()
  })

  it('calls onExport when export button is clicked', () => {
    const onExport = vi.fn()
    render(<OrgChartToolbar {...defaults} onExport={onExport} />)
    fireEvent.click(screen.getByRole('button', { name: /export org chart/i }))
    expect(onExport).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
bun run --cwd apps/web-people test:unit src/components/OrgChartToolbar.spec.tsx
```

Expected: FAIL — `OrgChartToolbar` not found.

---

## Task 2: Implement OrgChartToolbar

**Files:**

- Create: `apps/web-people/src/components/OrgChartToolbar.tsx`

- [ ] **Step 1: Create the component**

Create `apps/web-people/src/components/OrgChartToolbar.tsx`:

```tsx
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
```

- [ ] **Step 2: Run tests to verify they pass**

Run:

```bash
bun run --cwd apps/web-people test:unit src/components/OrgChartToolbar.spec.tsx
```

Expected: All 8 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web-people/src/components/OrgChartToolbar.tsx \
        apps/web-people/src/components/OrgChartToolbar.spec.tsx
git commit -m "feat(web-people): add OrgChartToolbar with filter chips and export button"
```
