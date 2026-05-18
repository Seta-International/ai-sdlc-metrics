# PR-8: @seta/ui Primitives v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four general-purpose primitives to @seta/ui: Tabs (Radix wrapper, Linear underline), KeyValueList (two-column k/v with copy), SectionCard (Card + built-in header), Searchbar (debounced text input). All tree-shakable, all token-based.

**Architecture:** Tabs uses @radix-ui/react-tabs. KeyValueList, SectionCard, Searchbar are pure presentational components built on existing tokens + lucide icons. No new tokens added.

**Tech Stack:** React 19, @radix-ui/react-tabs (new), class-variance-authority, clsx, tailwind-merge, lucide-react, vitest, RTL.

---

## Pre-flight

- [ ] Read `/Users/canh/Projects/Seta/seta-os/CLAUDE.md` (Working rules, Boundaries, Conventions).
- [ ] Read `/Users/canh/Projects/Seta/seta-os/docs/superpowers/specs/2026-05-15-studio-p2-master-plan.md` §12 (this PR's scope).
- [ ] Read `/Users/canh/Projects/Seta/seta-os/docs/superpowers/specs/2026-05-15-studio-design.md` §2.2 (token + semantic palette reference).
- [ ] Read existing patterns: `/Users/canh/Projects/Seta/seta-os/platform/ui/src/components/data/Card.tsx`, `StatusBadge.tsx`, `DataTable.tsx`, and `/Users/canh/Projects/Seta/seta-os/platform/ui/src/components/feedback/Tooltip.tsx`.
- [ ] Read `/Users/canh/Projects/Seta/seta-os/platform/ui/src/index.ts` (current export shape).
- [ ] Read `/Users/canh/Projects/Seta/seta-os/platform/ui/tsup.config.ts` (single-entry bundle — tree-shaking is bundler-side via named ESM exports).
- [ ] Confirm cwd is the repo root for all `pnpm --filter @seta/ui …` commands.

---

## Task 1 — Add `@radix-ui/react-tabs` dependency

- [ ] Run `pnpm view @radix-ui/react-tabs version` to read the current pin. Expected output `1.1.13` (this plan pins `^1.1.13`; if `pnpm view` returns a newer compatible patch/minor at execution time, prefer that — update this task to record the resolved value before installing).
- [ ] Run `pnpm --filter @seta/ui add @radix-ui/react-tabs@^1.1.13`. Verify the diff updates `platform/ui/package.json` `dependencies` and `pnpm-lock.yaml`; no other `package.json` files change. (CI guard `check-no-manual-pkg-edit.ts` requires the lockfile diff to accompany the `package.json` diff.)
- [ ] Run `pnpm --filter @seta/ui typecheck` — should still pass (no source changes yet).

---

## Task 2 — Tabs (Radix wrapper)

### 2.1 — Failing test first

- [ ] Create `/Users/canh/Projects/Seta/seta-os/platform/ui/src/components/feedback/Tabs.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs'

function Fixture({ defaultValue = 'overview' }: { defaultValue?: string }) {
  return (
    <Tabs defaultValue={defaultValue}>
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="playground">Playground</TabsTrigger>
        <TabsTrigger value="tools">Tools</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">overview-panel</TabsContent>
      <TabsContent value="playground">playground-panel</TabsContent>
      <TabsContent value="tools">tools-panel</TabsContent>
    </Tabs>
  )
}

describe('Tabs', () => {
  it('renders the default panel and only that panel', () => {
    render(<Fixture />)
    expect(screen.getByText('overview-panel')).toBeInTheDocument()
    expect(screen.queryByText('playground-panel')).not.toBeInTheDocument()
  })

  it('switches panel when a trigger is clicked', async () => {
    const user = userEvent.setup()
    render(<Fixture />)
    await user.click(screen.getByRole('tab', { name: 'Playground' }))
    expect(screen.getByText('playground-panel')).toBeInTheDocument()
    expect(screen.queryByText('overview-panel')).not.toBeInTheDocument()
  })

  it('moves focus with ArrowRight and activates with Enter', async () => {
    const user = userEvent.setup()
    render(<Fixture />)
    const overview = screen.getByRole('tab', { name: 'Overview' })
    overview.focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Playground' })).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Tools' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(screen.getByText('tools-panel')).toBeInTheDocument()
  })

  it('applies the underline active style to the selected trigger', () => {
    render(<Fixture defaultValue="tools" />)
    const tools = screen.getByRole('tab', { name: 'Tools' })
    expect(tools).toHaveAttribute('data-state', 'active')
    expect(tools.className).toMatch(/border-primary/)
  })
})
```

- [ ] Run `pnpm --filter @seta/ui vitest run src/components/feedback/Tabs.test.tsx`. Expect failures: module missing.

### 2.2 — Implementation

- [ ] Create `/Users/canh/Projects/Seta/seta-os/platform/ui/src/components/feedback/Tabs.tsx`:

```tsx
import * as R from '@radix-ui/react-tabs'
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react'
import { cn } from '../../lib/cn'

export const Tabs = R.Root

export const TabsList = forwardRef<
  ElementRef<typeof R.List>,
  ComponentPropsWithoutRef<typeof R.List>
>(({ className, ...rest }, ref) => (
  <R.List
    ref={ref}
    className={cn(
      'inline-flex items-center gap-1 border-b border-hairline',
      className,
    )}
    {...rest}
  />
))
TabsList.displayName = 'TabsList'

export const TabsTrigger = forwardRef<
  ElementRef<typeof R.Trigger>,
  ComponentPropsWithoutRef<typeof R.Trigger>
>(({ className, ...rest }, ref) => (
  <R.Trigger
    ref={ref}
    className={cn(
      // Base: small caps-friendly Linear-style tab
      'relative inline-flex h-9 items-center px-3 text-[13px] font-medium text-ink-mute',
      'border-b-2 border-transparent -mb-px transition-colors',
      'hover:text-ink',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus focus-visible:rounded-sm',
      // Active: lavender underline, ink text
      'data-[state=active]:border-primary data-[state=active]:text-ink',
      'disabled:pointer-events-none disabled:opacity-50',
      className,
    )}
    {...rest}
  />
))
TabsTrigger.displayName = 'TabsTrigger'

export const TabsContent = forwardRef<
  ElementRef<typeof R.Content>,
  ComponentPropsWithoutRef<typeof R.Content>
>(({ className, ...rest }, ref) => (
  <R.Content
    ref={ref}
    className={cn(
      'pt-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus rounded-sm',
      className,
    )}
    {...rest}
  />
))
TabsContent.displayName = 'TabsContent'
```

- [ ] Re-run `pnpm --filter @seta/ui vitest run src/components/feedback/Tabs.test.tsx`. All four cases green.

---

## Task 3 — KeyValueList

### 3.1 — Failing test first

- [ ] Create `/Users/canh/Projects/Seta/seta-os/platform/ui/src/components/data/KeyValueList.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KeyValueList } from './KeyValueList'

const writeText = vi.fn().mockResolvedValue(undefined)

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
  writeText.mockClear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('KeyValueList', () => {
  it('renders each entry as a key/value pair', () => {
    render(
      <KeyValueList
        entries={[
          { key: 'id', value: 'run_123' },
          { key: 'status', value: 'completed' },
        ]}
      />,
    )
    expect(screen.getByText('id')).toBeInTheDocument()
    expect(screen.getByText('run_123')).toBeInTheDocument()
    expect(screen.getByText('status')).toBeInTheDocument()
    expect(screen.getByText('completed')).toBeInTheDocument()
  })

  it('renders monospace values', () => {
    render(<KeyValueList entries={[{ key: 'sha', value: 'abc123' }]} />)
    const v = screen.getByText('abc123')
    expect(v.className).toMatch(/font-mono/)
  })

  it('copies the value and swaps to Check icon then resets after 3s', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(
      <KeyValueList
        entries={[{ key: 'token', value: 'secret-xyz', copyable: true }]}
      />,
    )
    const btn = screen.getByRole('button', { name: /copy token/i })
    await user.click(btn)
    expect(writeText).toHaveBeenCalledWith('secret-xyz')
    expect(screen.getByRole('button', { name: /copied/i })).toBeInTheDocument()
    vi.advanceTimersByTime(3000)
    expect(screen.getByRole('button', { name: /copy token/i })).toBeInTheDocument()
  })

  it('omits the copy button when copyable is not set', () => {
    render(<KeyValueList entries={[{ key: 'id', value: 'run_123' }]} />)
    expect(screen.queryByRole('button', { name: /copy/i })).not.toBeInTheDocument()
  })
})
```

- [ ] Run `pnpm --filter @seta/ui vitest run src/components/data/KeyValueList.test.tsx`. Expect failures: module missing.

### 3.2 — Implementation

- [ ] Create `/Users/canh/Projects/Seta/seta-os/platform/ui/src/components/data/KeyValueList.tsx`:

```tsx
import { Check, Copy } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { cn } from '../../lib/cn'

export interface KeyValueEntry {
  key: string
  value: ReactNode
  copyable?: boolean
}

interface Props {
  entries: readonly KeyValueEntry[]
  className?: string
}

export function KeyValueList({ entries, className }: Props) {
  if (entries.length === 0) return null
  return (
    <dl
      className={cn(
        'grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-4 gap-y-1.5 text-[13px]',
        className,
      )}
    >
      {entries.map((entry, i) => (
        <Row key={`${entry.key}-${i}`} entry={entry} />
      ))}
    </dl>
  )
}

function Row({ entry }: { entry: KeyValueEntry }) {
  return (
    <>
      <dt className="py-1.5 text-ink-mute">{entry.key}</dt>
      <dd className="py-1.5 flex items-start gap-2 text-ink">
        <span className="font-mono break-all">{entry.value}</span>
        {entry.copyable && <CopyButton entry={entry} />}
      </dd>
    </>
  )
}

function CopyButton({ entry }: { entry: KeyValueEntry }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 3000)
    return () => clearTimeout(t)
  }, [copied])

  const handleCopy = async () => {
    const text = typeof entry.value === 'string' ? entry.value : String(entry.value)
    await navigator.clipboard.writeText(text)
    setCopied(true)
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? `Copied ${entry.key}` : `Copy ${entry.key}`}
      className={cn(
        'inline-flex h-6 w-6 items-center justify-center rounded-md',
        'text-ink-mute hover:text-ink hover:bg-canvas-subtle transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus',
      )}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}
```

- [ ] Re-run `pnpm --filter @seta/ui vitest run src/components/data/KeyValueList.test.tsx`. All four cases green.

---

## Task 4 — SectionCard

### 4.1 — Failing test first

- [ ] Create `/Users/canh/Projects/Seta/seta-os/platform/ui/src/components/data/SectionCard.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SectionCard } from './SectionCard'

describe('SectionCard', () => {
  it('renders title, description, action and children', () => {
    render(
      <SectionCard
        title="Connector status"
        description="Per-tenant consent state"
        action={<button type="button">Refresh</button>}
      >
        <div data-testid="body">body content</div>
      </SectionCard>,
    )
    expect(screen.getByRole('heading', { name: 'Connector status' })).toBeInTheDocument()
    expect(screen.getByText('Per-tenant consent state')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
    expect(screen.getByTestId('body')).toBeInTheDocument()
  })

  it('omits description and action when not provided', () => {
    render(
      <SectionCard title="Summary">
        <div>body</div>
      </SectionCard>,
    )
    expect(screen.getByRole('heading', { name: 'Summary' })).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('applies the requested padding variant', () => {
    const { container, rerender } = render(
      <SectionCard title="sm" padding="sm">
        <div>x</div>
      </SectionCard>,
    )
    expect(container.firstChild).toHaveClass('p-4')
    rerender(
      <SectionCard title="lg" padding="lg">
        <div>x</div>
      </SectionCard>,
    )
    expect(container.firstChild).toHaveClass('p-8')
  })
})
```

- [ ] Run `pnpm --filter @seta/ui vitest run src/components/data/SectionCard.test.tsx`. Expect failures: module missing.

### 4.2 — Implementation

- [ ] Create `/Users/canh/Projects/Seta/seta-os/platform/ui/src/components/data/SectionCard.tsx`:

```tsx
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

interface Props {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
  padding?: 'sm' | 'md' | 'lg'
  className?: string
}

const paddingMap = {
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
} as const

export function SectionCard({
  title,
  description,
  action,
  children,
  padding = 'md',
  className,
}: Props) {
  return (
    <section
      className={cn(
        'rounded-lg border border-hairline bg-canvas text-ink shadow-card',
        paddingMap[padding],
        className,
      )}
    >
      <header className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-[15px] font-medium leading-snug text-ink">{title}</h3>
          {description && (
            <p className="mt-1 text-[13px] text-ink-mute">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div>{children}</div>
    </section>
  )
}
```

- [ ] Re-run `pnpm --filter @seta/ui vitest run src/components/data/SectionCard.test.tsx`. All three cases green.

---

## Task 5 — Searchbar

### 5.1 — Failing test first

- [ ] Create `/Users/canh/Projects/Seta/seta-os/platform/ui/src/components/data/Searchbar.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Searchbar } from './Searchbar'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Searchbar', () => {
  it('renders the value, placeholder, and search icon', () => {
    render(
      <Searchbar value="alpha" onChange={() => {}} placeholder="Find tools" />,
    )
    const input = screen.getByPlaceholderText('Find tools') as HTMLInputElement
    expect(input.value).toBe('alpha')
  })

  it('debounces onChange by debounceMs (default 200ms)', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<Searchbar value="" onChange={onChange} placeholder="Search" />)
    const input = screen.getByPlaceholderText('Search')

    await user.type(input, 'abc')
    expect(onChange).not.toHaveBeenCalled()

    vi.advanceTimersByTime(199)
    expect(onChange).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenLastCalledWith('abc')
  })

  it('honours a custom debounceMs', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(
      <Searchbar value="" onChange={onChange} debounceMs={500} placeholder="Search" />,
    )
    await user.type(screen.getByPlaceholderText('Search'), 'x')
    vi.advanceTimersByTime(499)
    expect(onChange).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onChange).toHaveBeenCalledWith('x')
  })

  it('shows the clear button only when the internal value is non-empty and clears immediately', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<Searchbar value="" onChange={onChange} placeholder="Search" />)

    expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument()
    await user.type(screen.getByPlaceholderText('Search'), 'q')

    const clear = screen.getByRole('button', { name: /clear/i })
    await user.click(clear)
    expect(onChange).toHaveBeenCalledWith('')
    expect((screen.getByPlaceholderText('Search') as HTMLInputElement).value).toBe('')
  })

  it('syncs internal value when the external value prop changes', () => {
    const { rerender } = render(
      <Searchbar value="one" onChange={() => {}} placeholder="Search" />,
    )
    expect((screen.getByPlaceholderText('Search') as HTMLInputElement).value).toBe('one')
    rerender(<Searchbar value="two" onChange={() => {}} placeholder="Search" />)
    expect((screen.getByPlaceholderText('Search') as HTMLInputElement).value).toBe('two')
  })
})
```

- [ ] Run `pnpm --filter @seta/ui vitest run src/components/data/Searchbar.test.tsx`. Expect failures: module missing.

### 5.2 — Implementation

- [ ] Create `/Users/canh/Projects/Seta/seta-os/platform/ui/src/components/data/Searchbar.tsx`:

```tsx
import { Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '../../lib/cn'

interface Props {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  debounceMs?: number
  className?: string
}

export function Searchbar({
  value,
  onChange,
  placeholder,
  debounceMs = 200,
  className,
}: Props) {
  const [internal, setInternal] = useState(value)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // External value is the source of truth — sync if it changes from outside.
  useEffect(() => {
    setInternal(value)
  }, [value])

  // Debounced emit. Skip on initial render where internal === value.
  useEffect(() => {
    if (internal === value) return
    const t = setTimeout(() => {
      onChangeRef.current(internal)
    }, debounceMs)
    return () => clearTimeout(t)
  }, [internal, value, debounceMs])

  const handleClear = () => {
    setInternal('')
    onChangeRef.current('')
  }

  return (
    <div
      className={cn(
        'inline-flex h-9 w-full items-center gap-2 rounded-md border border-hairline bg-canvas px-2.5',
        'focus-within:ring-2 focus-within:ring-primary-focus focus-within:border-primary',
        'transition-colors',
        className,
      )}
    >
      <Search className="h-4 w-4 shrink-0 text-ink-mute" aria-hidden />
      <input
        type="text"
        value={internal}
        onChange={(e) => setInternal(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'flex-1 bg-transparent text-[13px] text-ink outline-none',
          'placeholder:text-ink-mute',
        )}
      />
      {internal.length > 0 && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear search"
          className={cn(
            'inline-flex h-5 w-5 items-center justify-center rounded-sm',
            'text-ink-mute hover:text-ink hover:bg-canvas-subtle',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus',
          )}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
```

- [ ] Re-run `pnpm --filter @seta/ui vitest run src/components/data/Searchbar.test.tsx`. All five cases green.

---

## Task 6 — Wire named exports in `index.ts`

- [ ] Edit `/Users/canh/Projects/Seta/seta-os/platform/ui/src/index.ts` and add the following named exports, keeping the alphabetised grouping comments already in the file:

```ts
// Data — KeyValueList
export type { KeyValueEntry } from './components/data/KeyValueList'
export { KeyValueList } from './components/data/KeyValueList'
// Data — Searchbar
export { Searchbar } from './components/data/Searchbar'
// Data — SectionCard
export { SectionCard } from './components/data/SectionCard'
// Feedback — Tabs
export { Tabs, TabsContent, TabsList, TabsTrigger } from './components/feedback/Tabs'
```

Place each line under the existing matching `// Data` / `// Feedback` comment header. Do not duplicate existing exports.

- [ ] Run `pnpm --filter @seta/ui typecheck`. Expect zero errors.

---

## Task 7 — Build + consumer-shape test

### 7.1 — Build verification

- [ ] Run `pnpm --filter @seta/ui build`. Confirm `platform/ui/dist/index.js` and `platform/ui/dist/index.d.ts` exist and updated mtime is fresh. (`tsup` bundles `@seta/ui` to a single ESM `index.js`; tree-shaking is exercised downstream by Vite/tsup consumers against the named exports — there is no per-component output file by design.)

### 7.2 — Consumer-shape test

- [ ] Create `/Users/canh/Projects/Seta/seta-os/platform/ui/test/exports.test.ts`. This consumer-style test asserts (a) each new symbol resolves through the built `dist/index.js` (proves they are named exports the bundler can tree-shake on), and (b) the built ESM bundle declares the new exports textually so downstream bundlers see them.

```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const distEntry = fileURLToPath(new URL('../dist/index.js', import.meta.url))
const distSource = readFileSync(distEntry, 'utf8')

describe('@seta/ui dist exports — primitives v2', () => {
  it('declares Tabs, TabsList, TabsTrigger, TabsContent as named ESM exports', async () => {
    const mod = await import('../dist/index.js')
    expect(typeof mod.Tabs).toBe('object') // Radix Root is an object/forwardRef
    expect(typeof mod.TabsList).toBe('object')
    expect(typeof mod.TabsTrigger).toBe('object')
    expect(typeof mod.TabsContent).toBe('object')
    expect(distSource).toMatch(/\bTabs\b/)
    expect(distSource).toMatch(/\bTabsList\b/)
    expect(distSource).toMatch(/\bTabsTrigger\b/)
    expect(distSource).toMatch(/\bTabsContent\b/)
  })

  it('declares KeyValueList, SectionCard, Searchbar as named ESM exports', async () => {
    const mod = await import('../dist/index.js')
    expect(typeof mod.KeyValueList).toBe('function')
    expect(typeof mod.SectionCard).toBe('function')
    expect(typeof mod.Searchbar).toBe('function')
    expect(distSource).toMatch(/\bKeyValueList\b/)
    expect(distSource).toMatch(/\bSectionCard\b/)
    expect(distSource).toMatch(/\bSearchbar\b/)
  })

  it('keeps tree-shakable named-export shape (no default export, no re-bundled namespace)', () => {
    expect(distSource).not.toMatch(/export\s+default\s+\{/)
  })
})
```

- [ ] Run `pnpm --filter @seta/ui vitest run test/exports.test.ts`. All three cases green. (Note: this test depends on a fresh `dist/`. If the file is missing, re-run `pnpm --filter @seta/ui build`.)

---

## Task 8 — README

- [ ] Create `/Users/canh/Projects/Seta/seta-os/platform/ui/README.md`:

```markdown
# @seta/ui

Seta Workspace design system — tokens, AppShell, components, hooks. Consumed by `apps/studio` and forthcoming Workspace SPAs.

## Primitives — v2 (Tabs, KeyValueList, SectionCard, Searchbar)

All four primitives are tree-shakable named exports from `@seta/ui`. Tokens are sourced from `src/tokens/tokens.css` — never hardcode colors.

### Tabs

Radix-based, Linear-style underline. Used for agent-detail tabs (overview / playground / tools) and workflow detail.

\`\`\`tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@seta/ui'

<Tabs defaultValue="overview">
  <TabsList>
    <TabsTrigger value="overview">Overview</TabsTrigger>
    <TabsTrigger value="playground">Playground</TabsTrigger>
    <TabsTrigger value="tools">Tools</TabsTrigger>
  </TabsList>
  <TabsContent value="overview">…</TabsContent>
  <TabsContent value="playground">…</TabsContent>
  <TabsContent value="tools">…</TabsContent>
</Tabs>
\`\`\`

### KeyValueList

Two-column key/value list. Monospace values. Optional per-row copy button.

\`\`\`tsx
import { KeyValueList } from '@seta/ui'

<KeyValueList
  entries={[
    { key: 'id', value: 'run_123', copyable: true },
    { key: 'status', value: 'completed' },
  ]}
/>
\`\`\`

### SectionCard

`Card` with a built-in title / description / action header. Padding `sm | md | lg` (default `md`).

\`\`\`tsx
import { SectionCard, Button } from '@seta/ui'

<SectionCard
  title="Connector status"
  description="Per-tenant consent state"
  action={<Button variant="secondary">Refresh</Button>}
>
  …
</SectionCard>
\`\`\`

### Searchbar

Debounced text input with `Search` icon prefix and clear button. External `value` is the source of truth; `onChange` fires after `debounceMs` (default 200ms).

\`\`\`tsx
import { Searchbar } from '@seta/ui'
import { useState } from 'react'

function ToolsFilter() {
  const [q, setQ] = useState('')
  return <Searchbar value={q} onChange={setQ} placeholder="Search tools" />
}
\`\`\`

## Building

`pnpm --filter @seta/ui build` — outputs `dist/index.js` + `dist/index.d.ts` (single ESM entry; consumers tree-shake by named import).

## Tests

`pnpm --filter @seta/ui test:unit` — Vitest + RTL + jsdom.
```

(The fenced ``` blocks above use literal backslashes only to escape inside this plan; when writing the README, use plain triple-backticks.)

- [ ] Run `pnpm --filter @seta/ui typecheck` (sanity).

---

## Task 9 — Verify demo state

- [ ] Run `pnpm --filter @seta/ui test:unit` from repo root. All suites green, including the four new test files and the consumer-shape test.
- [ ] Run `pnpm --filter @seta/ui typecheck`. Zero errors.
- [ ] Run `pnpm --filter @seta/ui build`. Builds clean, `dist/index.js` regenerated.
- [ ] In a temp Node REPL: `node --input-type=module -e "import('@seta/ui').then(m => console.log(Object.keys(m).filter(k => /^(Tabs|TabsList|TabsTrigger|TabsContent|KeyValueList|SectionCard|Searchbar)$/.test(k))))"` from the repo root. Expect the seven names printed.
- [ ] Run `pnpm lint` (root). Zero new violations in `platform/ui/src/components/{data,feedback}/`.
- [ ] Run `pnpm typecheck` (root). No regressions in dependents.

---

## Task 10 — Commit

- [ ] Stage only the changes in `platform/ui/` plus `pnpm-lock.yaml`:
  - `platform/ui/package.json`
  - `platform/ui/src/components/feedback/Tabs.tsx`
  - `platform/ui/src/components/feedback/Tabs.test.tsx`
  - `platform/ui/src/components/data/KeyValueList.tsx`
  - `platform/ui/src/components/data/KeyValueList.test.tsx`
  - `platform/ui/src/components/data/SectionCard.tsx`
  - `platform/ui/src/components/data/SectionCard.test.tsx`
  - `platform/ui/src/components/data/Searchbar.tsx`
  - `platform/ui/src/components/data/Searchbar.test.tsx`
  - `platform/ui/src/index.ts`
  - `platform/ui/test/exports.test.ts`
  - `platform/ui/README.md`
  - `pnpm-lock.yaml`
- [ ] `pnpm changeset` — `@seta/ui` is `"private": true`, so a changeset is optional per CLAUDE.md "Changeset required for every change to a **published** package". Skip if `"private": true` still holds; otherwise create a `minor` changeset.
- [ ] Commit message (Conventional Commits, scope = `ui`):

```
feat(ui): primitives v2 — Tabs, KeyValueList, SectionCard, Searchbar

Adds four general-purpose primitives to @seta/ui for the Mastra-parity
Studio slices: Tabs (Radix wrapper, Linear underline), KeyValueList
(two-column k/v with copy), SectionCard (Card with built-in header),
Searchbar (debounced input). Token-based; no tokens.css additions.
```

- [ ] Push branch + open PR per repo workflow.

---

## Acceptance — Demo state

- `pnpm --filter @seta/ui test:unit` is green (including Tabs keyboard nav, KeyValueList copy timing, SectionCard variants, Searchbar fake-timer debounce, and the dist consumer-shape test).
- `pnpm --filter @seta/ui build` produces a single ESM `dist/index.js` exporting `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`, `KeyValueList`, `SectionCard`, `Searchbar` (plus prior exports) as named exports — tree-shakable downstream.
- `import { Tabs, KeyValueList, SectionCard, Searchbar } from '@seta/ui'` resolves in any consumer using the workspace dep.

## Out of scope

- No Studio routes consume these primitives yet — that lands in PR-9..13.
- No new design tokens (`tokens.css` unchanged).
- No Storybook (deferred to P3+ per master plan §10).
- No per-component output chunks — `tsup` continues to emit a single `index.js`; tree-shaking is bundler-side via named ESM exports (verified by `test/exports.test.ts`).
