# Member Details Redesign — Plan 03: Card Primitives

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `ProfileCard` (the KV section card used in the main column) and `SideCard` (the compact rail widget). These are pure presentational components that Plans 04 and 05 depend on.

**Architecture:** Both cards are stateless presentational components. `ProfileCard` renders a header row with title + optional action button, then a body of child KV rows separated by subtle borders. `SideCard` renders an uppercase label header with optional count badge and children below.

**Tech Stack:** React, TypeScript, @future/ui (Button, Lock icon from @future/ui/icons), Vitest + @testing-library/react

---

## Files

| Action | Path                                                                |
| ------ | ------------------------------------------------------------------- |
| Create | `apps/web-people/src/components/profile/cards/ProfileCard.tsx`      |
| Create | `apps/web-people/src/components/profile/cards/ProfileCard.spec.tsx` |
| Create | `apps/web-people/src/components/profile/cards/SideCard.tsx`         |
| Create | `apps/web-people/src/components/profile/cards/SideCard.spec.tsx`    |

**Prerequisite:** Plan 01 complete.

---

### Task 1: ProfileCard

**Files:**

- Create: `apps/web-people/src/components/profile/cards/ProfileCard.spec.tsx`
- Create: `apps/web-people/src/components/profile/cards/ProfileCard.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web-people/src/components/profile/cards/ProfileCard.spec.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProfileCard, KVRow } from './ProfileCard'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ProfileCard', () => {
  it('renders the title', () => {
    render(<ProfileCard title="About">content</ProfileCard>)
    expect(screen.getByText('About')).toBeTruthy()
  })

  it('renders children', () => {
    render(
      <ProfileCard title="About">
        <span>child content</span>
      </ProfileCard>,
    )
    expect(screen.getByText('child content')).toBeTruthy()
  })

  it('renders action button when action prop provided', () => {
    render(
      <ProfileCard title="Job" action={{ label: 'Edit', onClick: vi.fn() }}>
        content
      </ProfileCard>,
    )
    expect(screen.getByText('Edit')).toBeTruthy()
  })

  it('calls action.onClick when action button clicked', async () => {
    const onClick = vi.fn()
    render(
      <ProfileCard title="Job" action={{ label: 'Edit', onClick }}>
        content
      </ProfileCard>,
    )
    await userEvent.click(screen.getByText('Edit'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('does not render action button when action prop is absent', () => {
    render(<ProfileCard title="About">content</ProfileCard>)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('renders lock icon and message when locked', () => {
    render(
      <ProfileCard title="Compensation" locked>
        content
      </ProfileCard>,
    )
    expect(screen.getByTestId('lock-icon')).toBeTruthy()
  })
})

describe('KVRow', () => {
  it('renders label and value', () => {
    render(<KVRow label="Job title" value="Senior Engineer" />)
    expect(screen.getByText('Job title')).toBeTruthy()
    expect(screen.getByText('Senior Engineer')).toBeTruthy()
  })

  it('applies mono class when mono prop is true', () => {
    render(<KVRow label="Employee ID" value="E-001" mono />)
    const value = screen.getByText('E-001')
    expect(value.className).toContain('font-mono')
  })

  it('renders em-dash when value is null', () => {
    render(<KVRow label="Middle name" value={null} />)
    expect(screen.getByText('—')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd apps/web-people && bun run test:unit --reporter=verbose 2>&1 | grep -A 3 "ProfileCard"
```

Expected: FAIL with "Cannot find module './ProfileCard'".

- [ ] **Step 3: Create ProfileCard.tsx**

Create `apps/web-people/src/components/profile/cards/ProfileCard.tsx`:

```tsx
'use client'

import { Button } from '@future/ui'
import { Lock } from '@future/ui/icons'

interface ProfileCardAction {
  label: string
  onClick: () => void
}

interface ProfileCardProps {
  title: string
  action?: ProfileCardAction
  locked?: boolean
  children: React.ReactNode
}

export function ProfileCard({ title, action, locked, children }: ProfileCardProps) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
        <h3 className="flex items-center gap-1.5 text-xs font-510 tracking-tight text-foreground">
          {locked && <Lock data-testid="lock-icon" className="h-3 w-3 text-muted-foreground" />}
          {title}
        </h3>
        {action && (
          <Button
            variant="ghost"
            size="sm"
            onClick={action.onClick}
            className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            {action.label}
          </Button>
        )}
      </header>
      <div className="px-3.5 pb-2.5 pt-1">{children}</div>
    </section>
  )
}

interface KVRowProps {
  label: string
  value: string | null | undefined
  mono?: boolean
}

export function KVRow({ label, value, mono }: KVRowProps) {
  return (
    <div className="grid grid-cols-[160px_1fr] border-b border-border/40 py-1.5 last:border-0">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={`text-xs text-secondary-foreground ${mono ? 'font-mono' : ''}`}>
        {value ?? '—'}
      </span>
    </div>
  )
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd apps/web-people && bun run test:unit --reporter=verbose 2>&1 | grep -A 5 "ProfileCard\|KVRow"
```

Expected: all ProfileCard and KVRow tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web-people/src/components/profile/cards/ProfileCard.tsx \
        apps/web-people/src/components/profile/cards/ProfileCard.spec.tsx
git commit -m "feat(web-people): add ProfileCard and KVRow primitives"
```

---

### Task 2: SideCard

**Files:**

- Create: `apps/web-people/src/components/profile/cards/SideCard.spec.tsx`
- Create: `apps/web-people/src/components/profile/cards/SideCard.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web-people/src/components/profile/cards/SideCard.spec.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { SideCard } from './SideCard'

afterEach(() => {
  cleanup()
})

describe('SideCard', () => {
  it('renders the title', () => {
    render(<SideCard title="Completeness">content</SideCard>)
    expect(screen.getByText('Completeness')).toBeTruthy()
  })

  it('renders children', () => {
    render(
      <SideCard title="Reports to">
        <span>Bob Smith</span>
      </SideCard>,
    )
    expect(screen.getByText('Bob Smith')).toBeTruthy()
  })

  it('renders count badge when count prop provided', () => {
    render(
      <SideCard title="Direct reports" count={3}>
        content
      </SideCard>,
    )
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('does not render count when count prop is absent', () => {
    render(<SideCard title="Completeness">content</SideCard>)
    // title text is present, no numeric count
    expect(screen.queryByText(/^\d+$/)).toBeNull()
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd apps/web-people && bun run test:unit --reporter=verbose 2>&1 | grep -A 3 "SideCard"
```

Expected: FAIL with "Cannot find module './SideCard'".

- [ ] **Step 3: Create SideCard.tsx**

Create `apps/web-people/src/components/profile/cards/SideCard.tsx`:

```tsx
'use client'

interface SideCardProps {
  title: string
  count?: number
  children: React.ReactNode
}

export function SideCard({ title, count, children }: SideCardProps) {
  return (
    <section className="rounded-lg border border-border bg-card p-3">
      <header className="mb-2 flex items-center gap-1.5">
        <h4 className="text-[10px] font-510 uppercase tracking-widest text-muted-foreground">
          {title}
        </h4>
        {count != null && <span className="text-[10px] text-muted-foreground">{count}</span>}
      </header>
      {children}
    </section>
  )
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd apps/web-people && bun run test:unit --reporter=verbose 2>&1 | grep -A 3 "SideCard"
```

Expected: all SideCard tests pass.

- [ ] **Step 5: Run full suite**

```bash
cd apps/web-people && bun run test:unit
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web-people/src/components/profile/cards/SideCard.tsx \
        apps/web-people/src/components/profile/cards/SideCard.spec.tsx
git commit -m "feat(web-people): add SideCard primitive"
```
