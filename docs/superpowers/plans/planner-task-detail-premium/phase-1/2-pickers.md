# Phase 1 / Plan 2 — Picker Components

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create four shared picker components — `PriorityPicker`, `ProgressPicker`, `DatePicker`, `BucketPicker` — in `src/components/pickers/`. These are standalone dropdown UIs used by both the task detail fields (Phase 1) and board card context menus.

**Architecture:** Each picker is a pure presentational component. It receives the current value and callback props; it calls no tRPC directly. Field wrappers (Plan 3) wire the pickers to mutations. Every picker: closes on outside click (caller manages via `onClose`), closes on Escape key, calls `onSelect`/`onChange` with the chosen value.

**Tech Stack:** React, `@future/ui` Button/Input, `lucide-react` icons, Vitest + Testing Library

**Prereq:** Plan 1 (Tiptap install) must be complete.

---

## Exit Criteria

- [ ] All four picker files exist in `src/components/pickers/`
- [ ] `bun run test --filter @future/web-planner -- PriorityPicker ProgressPicker DatePicker BucketPicker` — all pass
- [ ] No raw `<button>` or `<input>` for interactive elements; use `<Button>` / `<Input>` from `@future/ui`

---

## File Map

**Create:**

```
apps/web-planner/src/components/pickers/
  PriorityPicker.tsx        (+ PriorityPicker.spec.tsx)
  ProgressPicker.tsx        (+ ProgressPicker.spec.tsx)
  DatePicker.tsx            (+ DatePicker.spec.tsx)
  BucketPicker.tsx          (+ BucketPicker.spec.tsx)
```

All paths below are relative to `apps/web-planner/src/`.

---

## Task 2: PriorityPicker

**Files:**

- Create: `src/components/pickers/PriorityPicker.tsx`
- Test: `src/components/pickers/PriorityPicker.spec.tsx`

Priority values: `1` = Low, `3` = Normal (default), `5` = Important, `9` = Urgent. These match `chk_task_priority` DB check.

- [ ] **Step 1: Write the failing test**

Create `src/components/pickers/PriorityPicker.spec.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PriorityPicker } from './PriorityPicker'

afterEach(() => cleanup())

describe('PriorityPicker', () => {
  it('renders all four priority options', () => {
    render(<PriorityPicker currentPriority={3} onSelect={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Low')).toBeDefined()
    expect(screen.getByText('Normal')).toBeDefined()
    expect(screen.getByText('Important')).toBeDefined()
    expect(screen.getByText('Urgent')).toBeDefined()
  })

  it('marks the current priority as selected', () => {
    render(<PriorityPicker currentPriority={5} onSelect={vi.fn()} onClose={vi.fn()} />)
    const btn = screen.getByTestId('priority-option-5')
    expect(btn.getAttribute('aria-pressed')).toBe('true')
  })

  it('calls onSelect with the chosen priority value', async () => {
    const onSelect = vi.fn()
    render(<PriorityPicker currentPriority={3} onSelect={onSelect} onClose={vi.fn()} />)
    await userEvent.click(screen.getByTestId('priority-option-1'))
    expect(onSelect).toHaveBeenCalledWith(1)
  })

  it('calls onClose on Escape key', async () => {
    const onClose = vi.fn()
    render(<PriorityPicker currentPriority={3} onSelect={vi.fn()} onClose={onClose} />)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
bun run test --filter @future/web-planner -- PriorityPicker
```

Expected: FAIL — `PriorityPicker` not found.

- [ ] **Step 3: Implement PriorityPicker**

Create `src/components/pickers/PriorityPicker.tsx`:

```tsx
'use client'

import { Button } from '@future/ui'
import { PriorityIcon, type Priority } from '../primitives/PriorityIcon'

const OPTIONS: { value: Priority; label: string }[] = [
  { value: 1, label: 'Low' },
  { value: 3, label: 'Normal' },
  { value: 5, label: 'Important' },
  { value: 9, label: 'Urgent' },
]

interface Props {
  currentPriority: Priority
  onSelect: (priority: Priority) => void
  onClose: () => void
}

export function PriorityPicker({ currentPriority, onSelect, onClose }: Props) {
  return (
    <div
      className="absolute left-0 top-full z-50 w-44 overflow-hidden rounded-lg border border-white/8 bg-surface shadow-dialog"
      data-testid="priority-picker"
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <div className="border-b border-white/5 px-3 py-2">
        <span className="text-caption font-510 text-fg-muted">Priority</span>
      </div>
      <ul role="list" className="py-1">
        {OPTIONS.map(({ value, label }) => (
          <li key={value}>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              aria-pressed={currentPriority === value}
              data-testid={`priority-option-${value}`}
              onClick={() => {
                onSelect(value)
                onClose()
              }}
              className="w-full justify-start gap-2 px-3 py-1.5"
            >
              <PriorityIcon priority={value} />
              <span className="flex-1 text-small font-510">{label}</span>
              {currentPriority === value && (
                <svg viewBox="0 0 12 12" fill="none" className="size-3 text-accent" aria-hidden>
                  <path
                    d="M2 6l3 3 5-5"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
bun run test --filter @future/web-planner -- PriorityPicker
```

Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web-planner/src/components/pickers/PriorityPicker.tsx \
         apps/web-planner/src/components/pickers/PriorityPicker.spec.tsx
git commit -m "feat(web-planner): add PriorityPicker component"
```

---

## Task 3: ProgressPicker

**Files:**

- Create: `src/components/pickers/ProgressPicker.tsx`
- Test: `src/components/pickers/ProgressPicker.spec.tsx`

Progress values: `0` = Not started, `50` = In progress, `100` = Complete. Match `chk_task_progress` DB check.

- [ ] **Step 1: Write the failing test**

Create `src/components/pickers/ProgressPicker.spec.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProgressPicker } from './ProgressPicker'

afterEach(() => cleanup())

describe('ProgressPicker', () => {
  it('renders all three progress options', () => {
    render(<ProgressPicker currentProgress={0} onSelect={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Not started')).toBeDefined()
    expect(screen.getByText('In progress')).toBeDefined()
    expect(screen.getByText('Complete')).toBeDefined()
  })

  it('marks current progress as selected', () => {
    render(<ProgressPicker currentProgress={50} onSelect={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByTestId('progress-option-50').getAttribute('aria-pressed')).toBe('true')
  })

  it('calls onSelect with chosen value', async () => {
    const onSelect = vi.fn()
    render(<ProgressPicker currentProgress={0} onSelect={onSelect} onClose={vi.fn()} />)
    await userEvent.click(screen.getByTestId('progress-option-100'))
    expect(onSelect).toHaveBeenCalledWith(100)
  })

  it('calls onClose on Escape', async () => {
    const onClose = vi.fn()
    render(<ProgressPicker currentProgress={0} onSelect={vi.fn()} onClose={onClose} />)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
bun run test --filter @future/web-planner -- ProgressPicker
```

Expected: FAIL.

- [ ] **Step 3: Implement ProgressPicker**

Create `src/components/pickers/ProgressPicker.tsx`:

```tsx
'use client'

import { Button } from '@future/ui'
import { ProgressIcon, type Progress } from '../primitives/ProgressIcon'

const OPTIONS: { value: Progress; label: string }[] = [
  { value: 0, label: 'Not started' },
  { value: 50, label: 'In progress' },
  { value: 100, label: 'Complete' },
]

interface Props {
  currentProgress: Progress
  onSelect: (progress: Progress) => void
  onClose: () => void
}

export function ProgressPicker({ currentProgress, onSelect, onClose }: Props) {
  return (
    <div
      className="absolute left-0 top-full z-50 w-44 overflow-hidden rounded-lg border border-white/8 bg-surface shadow-dialog"
      data-testid="progress-picker"
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <div className="border-b border-white/5 px-3 py-2">
        <span className="text-caption font-510 text-fg-muted">Progress</span>
      </div>
      <ul role="list" className="py-1">
        {OPTIONS.map(({ value, label }) => (
          <li key={value}>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              aria-pressed={currentProgress === value}
              data-testid={`progress-option-${value}`}
              onClick={() => {
                onSelect(value)
                onClose()
              }}
              className="w-full justify-start gap-2 px-3 py-1.5"
            >
              <ProgressIcon progress={value} />
              <span className="flex-1 text-small font-510">{label}</span>
              {currentProgress === value && (
                <svg viewBox="0 0 12 12" fill="none" className="size-3 text-accent" aria-hidden>
                  <path
                    d="M2 6l3 3 5-5"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
bun run test --filter @future/web-planner -- ProgressPicker
```

Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web-planner/src/components/pickers/ProgressPicker.tsx \
         apps/web-planner/src/components/pickers/ProgressPicker.spec.tsx
git commit -m "feat(web-planner): add ProgressPicker component"
```

---

## Task 4: DatePicker

**Files:**

- Create: `src/components/pickers/DatePicker.tsx`
- Test: `src/components/pickers/DatePicker.spec.tsx`

Uses a native `<input type="date">` wrapped in `<Input>` from `@future/ui`. Accepts `Date | null`, returns `Date | null` via `onChange`. Has a "Clear" button when a date is set.

- [ ] **Step 1: Write the failing test**

Create `src/components/pickers/DatePicker.spec.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DatePicker } from './DatePicker'

afterEach(() => cleanup())

describe('DatePicker', () => {
  it('renders a date input with the given value', () => {
    render(<DatePicker value={new Date('2026-06-15')} onChange={vi.fn()} onClose={vi.fn()} />)
    const input = screen.getByTestId<HTMLInputElement>('date-picker-input')
    expect(input.value).toBe('2026-06-15')
  })

  it('renders empty when value is null', () => {
    render(<DatePicker value={null} onChange={vi.fn()} onClose={vi.fn()} />)
    const input = screen.getByTestId<HTMLInputElement>('date-picker-input')
    expect(input.value).toBe('')
  })

  it('calls onChange with a Date when user picks a date', () => {
    const onChange = vi.fn()
    render(<DatePicker value={null} onChange={onChange} onClose={vi.fn()} />)
    fireEvent.change(screen.getByTestId('date-picker-input'), { target: { value: '2026-07-01' } })
    expect(onChange).toHaveBeenCalledOnce()
    const arg: Date = onChange.mock.calls[0][0]
    expect(arg).toBeInstanceOf(Date)
    expect(arg.toISOString().slice(0, 10)).toBe('2026-07-01')
  })

  it('calls onChange with null when user clicks Clear', async () => {
    const onChange = vi.fn()
    render(<DatePicker value={new Date('2026-06-15')} onChange={onChange} onClose={vi.fn()} />)
    await userEvent.click(screen.getByTestId('date-picker-clear'))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('does not show Clear button when value is null', () => {
    render(<DatePicker value={null} onChange={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByTestId('date-picker-clear')).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
bun run test --filter @future/web-planner -- DatePicker
```

Expected: FAIL.

- [ ] **Step 3: Implement DatePicker**

Create `src/components/pickers/DatePicker.tsx`:

```tsx
'use client'

import { Button, Input } from '@future/ui'

interface Props {
  label?: string
  value: Date | null
  onChange: (date: Date | null) => void
  onClose: () => void
}

export function DatePicker({ label, value, onChange, onClose }: Props) {
  const inputValue = value ? value.toISOString().slice(0, 10) : ''

  return (
    <div
      className="absolute left-0 top-full z-50 w-52 overflow-hidden rounded-lg border border-white/8 bg-surface p-3 shadow-dialog"
      data-testid="date-picker"
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      {label && <p className="mb-2 text-caption font-510 text-fg-muted">{label}</p>}
      <Input
        type="date"
        value={inputValue}
        data-testid="date-picker-input"
        onChange={(e) => {
          const v = e.target.value
          onChange(v ? new Date(v) : null)
        }}
        className="h-8 text-sm"
      />
      {value && (
        <Button
          variant="ghost"
          size="sm"
          data-testid="date-picker-clear"
          onClick={() => onChange(null)}
          className="mt-2 w-full text-fg-muted"
        >
          Clear
        </Button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
bun run test --filter @future/web-planner -- DatePicker
```

Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web-planner/src/components/pickers/DatePicker.tsx \
         apps/web-planner/src/components/pickers/DatePicker.spec.tsx
git commit -m "feat(web-planner): add DatePicker component"
```

---

## Task 5: BucketPicker

**Files:**

- Create: `src/components/pickers/BucketPicker.tsx`
- Test: `src/components/pickers/BucketPicker.spec.tsx`

Receives `buckets: { id: string; name: string }[]` — populated by `BucketField` from the board snapshot cache. Scrollable list of up to the plan's buckets. Calls `onSelect(bucketId)` on click.

- [ ] **Step 1: Write the failing test**

Create `src/components/pickers/BucketPicker.spec.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BucketPicker } from './BucketPicker'

afterEach(() => cleanup())

const BUCKETS = [
  { id: 'b1', name: 'To Do' },
  { id: 'b2', name: 'In Progress' },
  { id: 'b3', name: 'Done' },
]

describe('BucketPicker', () => {
  it('renders all buckets', () => {
    render(
      <BucketPicker buckets={BUCKETS} currentBucketId="b1" onSelect={vi.fn()} onClose={vi.fn()} />,
    )
    expect(screen.getByText('To Do')).toBeDefined()
    expect(screen.getByText('In Progress')).toBeDefined()
    expect(screen.getByText('Done')).toBeDefined()
  })

  it('marks the current bucket as selected', () => {
    render(
      <BucketPicker buckets={BUCKETS} currentBucketId="b2" onSelect={vi.fn()} onClose={vi.fn()} />,
    )
    expect(screen.getByTestId('bucket-option-b2').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('bucket-option-b1').getAttribute('aria-pressed')).toBe('false')
  })

  it('calls onSelect with bucket id when clicked', async () => {
    const onSelect = vi.fn()
    render(
      <BucketPicker buckets={BUCKETS} currentBucketId="b1" onSelect={onSelect} onClose={vi.fn()} />,
    )
    await userEvent.click(screen.getByTestId('bucket-option-b3'))
    expect(onSelect).toHaveBeenCalledWith('b3')
  })

  it('calls onClose on Escape', async () => {
    const onClose = vi.fn()
    render(
      <BucketPicker buckets={BUCKETS} currentBucketId="b1" onSelect={vi.fn()} onClose={onClose} />,
    )
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
bun run test --filter @future/web-planner -- BucketPicker
```

Expected: FAIL.

- [ ] **Step 3: Implement BucketPicker**

Create `src/components/pickers/BucketPicker.tsx`:

```tsx
'use client'

import { Button } from '@future/ui'

interface Bucket {
  id: string
  name: string
}

interface Props {
  buckets: Bucket[]
  currentBucketId: string
  onSelect: (bucketId: string) => void
  onClose: () => void
}

export function BucketPicker({ buckets, currentBucketId, onSelect, onClose }: Props) {
  return (
    <div
      className="absolute left-0 top-full z-50 w-56 overflow-hidden rounded-lg border border-white/8 bg-surface shadow-dialog"
      data-testid="bucket-picker"
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <div className="border-b border-white/5 px-3 py-2">
        <span className="text-caption font-510 text-fg-muted">Move to bucket</span>
      </div>
      <ul role="list" className="max-h-56 overflow-y-auto py-1">
        {buckets.map((bucket) => {
          const isSelected = bucket.id === currentBucketId
          return (
            <li key={bucket.id}>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                aria-pressed={isSelected}
                data-testid={`bucket-option-${bucket.id}`}
                onClick={() => {
                  onSelect(bucket.id)
                  onClose()
                }}
                className="w-full justify-start gap-2 px-3 py-1.5"
              >
                <span className="flex-1 truncate text-small font-510">{bucket.name}</span>
                {isSelected && (
                  <svg viewBox="0 0 12 12" fill="none" className="size-3 text-accent" aria-hidden>
                    <path
                      d="M2 6l3 3 5-5"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </Button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
bun run test --filter @future/web-planner -- BucketPicker
```

Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web-planner/src/components/pickers/BucketPicker.tsx \
         apps/web-planner/src/components/pickers/BucketPicker.spec.tsx
git commit -m "feat(web-planner): add BucketPicker component"
```
