# Console design-system foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land one PR that gives `platform/ui` the typography token surface and shared primitives (PageHeader, Field) needed for DESIGN.md compliance, fixes existing primitives to consume those tokens, migrates the 19 current `text-{xs..3xl}` callsites, narrows Tailwind's `fontSize` map so hardcodes don't compile, and adds a CI guard that fails the build on raw pixel/hex/inline-style hardcodes.

**Architecture:** Typography tokens extend Tailwind v4's hybrid-mode preset (`platform/ui/src/tokens/tailwind-preset.ts`) with size+weight+tracking+font-features packed into one utility class (`text-body-md`, `text-caption`, `text-body-tabular`, etc.). Two new primitives — `PageHeader` (props-based: title/description/actions) and `Field` (label/input/helper-or-error wrapper) — land in `platform/ui`. After all callsites use the new tokens, the `fontSize` map is replaced (not extended) so `text-xs`/`text-sm`/`text-base`/etc. no longer compile. A regex-based CI guard (`tooling/scripts/check-no-hardcoded-styles.ts`) wired into the existing `lint` workflow catches arbitrary-value classes like `text-[12px]` and inline `style=` hardcodes. No escape-hatch comments — edge cases get a new design token, not a bypass.

**Tech Stack:** TypeScript, Tailwind CSS v4 (v3-style preset via `@config`), Vitest + React Testing Library (jsdom), Biome, pnpm workspaces, Node ≥24.

**Source spec:** `docs/superpowers/specs/2026-05-18-console-design-foundation-design.md`

---

## File Structure

**Modified:**
- `platform/ui/src/tokens/tailwind-preset.ts` — add `fontSize` map with named typography tokens (Task 1); later narrowed to drop Tailwind defaults (Task 10).
- `platform/ui/src/components/data/StatusBadge.tsx` — consume `text-eyebrow` (Task 2).
- `platform/ui/src/components/data/DataTable.tsx` — consume `text-caption` headers, `text-body-md` cells, add `numeric` column prop for `text-body-tabular` + right-align (Task 3).
- `platform/ui/src/components/data/EmptyState.tsx` — consume `text-display-lg` heading and `text-body-md` description (Task 4).
- `platform/ui/src/components/forms/Button.tsx` — consume `text-button-md` / `text-button-sm` in size variants (Task 5).
- `platform/ui/src/components/forms/Input.tsx` — consume `text-body-md` (Task 6).
- `platform/ui/src/components/forms/Select.tsx` — consume `text-body-md` (Task 6).
- `platform/ui/src/components/forms/Label.tsx` — consume `text-caption text-ink-mute` (Task 6).
- `platform/ui/src/components/shell/NotificationBell.tsx` — replace `text-[10px]` with `text-eyebrow` (Task 9).
- `platform/ui/src/components/shell/SidebarNavItem.tsx` — replace `text-[11px]` with `text-eyebrow` (Task 9).
- `platform/ui/src/components/data/TokenUsageBar.tsx` — replace `text-[12px]` with `text-caption` (Task 9).
- 19 callsites across `apps/console/src` (Task 9, file list in that task).
- `platform/ui/src/index.ts` — export `PageHeader` (Task 7) and `Field` (Task 8).
- `.github/workflows/ci.yml` — wire CI guard step (Task 12).
- `.changeset/*.md` — add changeset entry (Task 13).

**Created:**
- `platform/ui/src/components/layout/PageHeader.tsx` + `.test.tsx` (Task 7).
- `platform/ui/src/components/forms/Field.tsx` + `.test.tsx` (Task 8).
- `tooling/scripts/check-no-hardcoded-styles.ts` + `tooling/scripts/check-no-hardcoded-styles.test.ts` (Task 11).
- `tooling/scripts/fixtures/hardcoded-styles-fixture.tsx` (Task 11) — used as a regex target by the script's tests.

**Not touched:** any code under `modules/`, `apps/api`, `apps/agent-portal`, `apps/studio`. Spec scope is `platform/ui` + `apps/console` + tooling/CI only.

---

### Task 1: Add typography tokens to `tailwind-preset.ts`

**Files:**
- Modify: `platform/ui/src/tokens/tailwind-preset.ts`
- Verify: `apps/console/dist/assets/index-*.css` after a build

DESIGN.md §500-525 defines a 12-step typography scale. We add it to the preset's `theme.extend.fontSize`. Each entry packs size + lineHeight + letterSpacing + fontWeight + fontFeatureSettings into a single utility class. `tnum` is baked into `body-tabular` and `caption` so consumers do not have to add it.

This task **extends** the preset (does not replace `fontSize` yet) so the existing `text-sm` / `text-xs` / etc. still compile while later tasks migrate them. Replacement happens in Task 10.

- [ ] **Step 1: Add the fontSize map to the preset**

Edit `platform/ui/src/tokens/tailwind-preset.ts`. Inside `theme.extend`, add a `fontSize` entry between `fontFamily` (line 65) and `boxShadow` (line 69). Resulting block:

```ts
      fontFamily: {
        sans: ['Inter', 'SF Pro Display', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'ui-monospace', 'Menlo', 'monospace'],
      },
      fontSize: {
        'display-lg':    ['32px', { lineHeight: '1.15', letterSpacing: '-0.8px', fontWeight: '600' }],
        'display-md':    ['26px', { lineHeight: '1.2',  letterSpacing: '-0.5px', fontWeight: '600' }],
        'heading-lg':    ['22px', { lineHeight: '1.3',  letterSpacing: '-0.4px', fontWeight: '500' }],
        'heading-md':    ['18px', { lineHeight: '1.35', letterSpacing: '-0.2px', fontWeight: '500' }],
        'heading-sm':    ['15px', { lineHeight: '1.4',  letterSpacing: '-0.1px', fontWeight: '500' }],
        'body-lg':       ['16px', { lineHeight: '1.5',  letterSpacing: '-0.05px', fontWeight: '400' }],
        'body-md':       ['14px', { lineHeight: '1.5',  letterSpacing: '0',      fontWeight: '400' }],
        'body-tabular':  ['14px', { lineHeight: '1.5',  letterSpacing: '-0.3px', fontWeight: '400', fontFeatureSettings: '"tnum"' }],
        'button-md':     ['14px', { lineHeight: '1',    letterSpacing: '0',      fontWeight: '500' }],
        'button-sm':     ['13px', { lineHeight: '1',    letterSpacing: '0',      fontWeight: '500' }],
        'caption':       ['12px', { lineHeight: '1.4',  letterSpacing: '0',      fontWeight: '400', fontFeatureSettings: '"tnum"' }],
        'eyebrow':       ['11px', { lineHeight: '1.2',  letterSpacing: '0.4px',  fontWeight: '500' }],
      },
      boxShadow: {
```

- [ ] **Step 2: Build the console to compile the new tokens**

Run: `pnpm --filter @seta/console build`
Expected: exit code 0. Build finishes; new CSS appears under `apps/console/dist/assets/`.

- [ ] **Step 3: Verify `text-body-tabular` produces `font-feature-settings: tnum` in generated CSS**

Run: `grep -E "\.text-body-tabular\b" -A 6 apps/console/dist/assets/index-*.css | head -20`
Expected output: a CSS rule for `.text-body-tabular` whose properties include `font-feature-settings: "tnum"` (alongside `font-size: 14px`, `font-weight: 400`, `letter-spacing: -0.3px`).

**If `font-feature-settings: tnum` is missing**, Tailwind v4 hybrid mode is not propagating `fontFeatureSettings` from the preset tuple. Fall back to v4-native theme in `platform/ui/src/tokens/tokens.css`:

1. Remove the `fontSize` block added in Step 1.
2. Append the same scale to `tokens.css` using v4 `@theme`:
   ```css
   @theme {
     --text-display-lg: 32px;
     --text-display-lg--line-height: 1.15;
     --text-display-lg--letter-spacing: -0.8px;
     --text-display-lg--font-weight: 600;
     /* ...repeat for every token... */
     --text-body-tabular: 14px;
     --text-body-tabular--line-height: 1.5;
     --text-body-tabular--letter-spacing: -0.3px;
     --text-body-tabular--font-weight: 400;
     --text-body-tabular--font-feature-settings: "tnum";
     /* ... */
   }
   ```
3. Re-run Steps 2 and 3.

- [ ] **Step 4: Verify `text-caption` also carries `tnum`**

Run: `grep -E "\.text-caption\b" -A 6 apps/console/dist/assets/index-*.css | head -10`
Expected: CSS rule for `.text-caption` with `font-feature-settings: "tnum"` and `font-size: 12px`.

- [ ] **Step 5: Verify `text-eyebrow` does NOT carry tnum**

Run: `grep -E "\.text-eyebrow\b" -A 6 apps/console/dist/assets/index-*.css | head -10`
Expected: CSS rule for `.text-eyebrow` with `font-size: 11px`, `letter-spacing: 0.4px`, **without** `font-feature-settings`.

- [ ] **Step 6: Commit**

```bash
git add platform/ui/src/tokens/tailwind-preset.ts
# If fallback was used:
# git add platform/ui/src/tokens/tokens.css
git commit -m "feat(ui): add DESIGN.md typography tokens to tailwind preset"
```

---

### Task 2: Migrate `StatusBadge` to `text-eyebrow`

**Files:**
- Modify: `platform/ui/src/components/data/StatusBadge.tsx`
- Test: `platform/ui/src/components/data/StatusBadge.test.tsx`

`StatusBadge.tsx:23` hardcodes `text-[11px] font-medium tracking-wider`. The `text-eyebrow` token (11/500/+0.4px tracking) covers all three. `uppercase` is layout, not a DESIGN.md spec property — keep it.

- [ ] **Step 1: Write/update the failing test**

If `StatusBadge.test.tsx` exists, add a new test inside its `describe` block. Otherwise create the file:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatusBadge } from './StatusBadge'

describe('StatusBadge', () => {
  it('uses the text-eyebrow typography token', () => {
    render(<StatusBadge variant="success">ACTIVE</StatusBadge>)
    const el = screen.getByText('ACTIVE')
    expect(el.className).toContain('text-eyebrow')
    expect(el.className).not.toMatch(/text-\[11px\]/)
    expect(el.className).not.toMatch(/tracking-wider/)
    expect(el.className).not.toMatch(/font-medium/)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @seta/ui vitest run src/components/data/StatusBadge.test.tsx`
Expected: FAIL — current implementation has `text-[11px] font-medium tracking-wider`, so all three assertions fail.

- [ ] **Step 3: Update `StatusBadge.tsx`**

In `platform/ui/src/components/data/StatusBadge.tsx`, replace the className inside the `cn(...)` call (line 23):

Change:
```tsx
'inline-flex items-center rounded-pill px-2 py-0.5 text-[11px] font-medium tracking-wider uppercase',
```
To:
```tsx
'inline-flex items-center rounded-pill px-2 py-0.5 text-eyebrow uppercase',
```

- [ ] **Step 4: Re-run the test**

Run: `pnpm --filter @seta/ui vitest run src/components/data/StatusBadge.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add platform/ui/src/components/data/StatusBadge.tsx platform/ui/src/components/data/StatusBadge.test.tsx
git commit -m "refactor(ui): StatusBadge uses text-eyebrow token"
```

---

### Task 3: Migrate `DataTable` headers and cells; add `numeric` column prop

**Files:**
- Modify: `platform/ui/src/components/data/DataTable.tsx`
- Test: `platform/ui/src/components/data/DataTable.test.tsx`

DataTable currently uses `text-[12px] font-medium text-ink-mute tnum` on `<th>` (line 66) and an unspecified text size on `<td>`. Per DESIGN.md §518 column headers are `caption` weight 400 (drop `font-medium`); per §714 numeric cells use `body-tabular` with `tnum` and right-align. The new `numeric` column prop opts a column into that.

- [ ] **Step 1: Read DataTable.test.tsx**

Run: `cat platform/ui/src/components/data/DataTable.test.tsx 2>/dev/null || echo "FILE_MISSING"`

If the file is missing, you will create it in Step 2; if it exists, append new tests inside the existing `describe`. (Both paths are handled below.)

- [ ] **Step 2: Write/append failing tests**

In `platform/ui/src/components/data/DataTable.test.tsx`, ensure the file contains these tests (create file if missing — add the imports at the top):

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DataTable, type Column } from './DataTable'

interface Row { id: string; name: string; amount: number }

const rows: Row[] = [{ id: '1', name: 'Alpha', amount: 12 }]

describe('DataTable tokens', () => {
  it('column headers use text-caption text-ink-mute (no font-medium)', () => {
    const columns: Column<Row>[] = [
      { key: 'name', header: 'Name', cell: (r) => r.name },
    ]
    render(<DataTable rows={rows} columns={columns} rowKey={(r) => r.id} />)
    const th = screen.getByText('Name').closest('th')!
    expect(th.className).toContain('text-caption')
    expect(th.className).toContain('text-ink-mute')
    expect(th.className).not.toMatch(/text-\[12px\]/)
    expect(th.className).not.toMatch(/font-medium/)
  })

  it('default cells use text-body-md', () => {
    const columns: Column<Row>[] = [
      { key: 'name', header: 'Name', cell: (r) => r.name },
    ]
    render(<DataTable rows={rows} columns={columns} rowKey={(r) => r.id} />)
    const td = screen.getByText('Alpha').closest('td')!
    expect(td.className).toContain('text-body-md')
  })

  it('numeric columns use text-body-tabular and right-align', () => {
    const columns: Column<Row>[] = [
      { key: 'amount', header: 'Amount', cell: (r) => r.amount, numeric: true },
    ]
    render(<DataTable rows={rows} columns={columns} rowKey={(r) => r.id} />)
    const td = screen.getByText('12').closest('td')!
    expect(td.className).toContain('text-body-tabular')
    expect(td.className).toContain('text-right')
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @seta/ui vitest run src/components/data/DataTable.test.tsx`
Expected: FAIL — `numeric` is not on `Column`, headers still carry `text-[12px] font-medium`, cells lack `text-body-md`.

- [ ] **Step 4: Update `DataTable.tsx`**

Edit `platform/ui/src/components/data/DataTable.tsx`:

(a) Extend the `Column<T>` interface (around line 4) to add `numeric`:

```tsx
export interface Column<T> {
  key: string
  header: ReactNode
  cell: (row: T) => ReactNode
  sortable?: boolean
  align?: 'left' | 'right' | 'center'
  numeric?: boolean
  compare?: (a: T, b: T) => number
}
```

(b) Replace the table opening tag (line 58) — drop the hardcoded `text-[14px]`:

```tsx
      <table className="w-full border-collapse">
```

(c) Replace the `<th>` className block (lines 65-70):

```tsx
                className={cn(
                  'sticky top-0 px-3.5 py-2.5 text-left text-caption text-ink-mute',
                  (col.align === 'right' || col.numeric) && 'text-right',
                  col.align === 'center' && 'text-center',
                  col.sortable && 'cursor-pointer hover:text-ink',
                )}
```

(d) Remove `tnum` from the `<tr>` row className (line 89) — `tnum` is now per-cell via `numeric`:

```tsx
                className={cn(
                  'border-t border-hairline transition-colors',
                  onRowClick && 'cursor-pointer',
                  selected ? 'bg-primary-subtle' : 'hover:bg-canvas-subtle',
                )}
```

(e) Replace the `<td>` className block (lines 97-101):

```tsx
                    className={cn(
                      'px-3.5 py-2.5 text-ink',
                      col.numeric ? 'text-body-tabular text-right' : 'text-body-md',
                      col.align === 'right' && !col.numeric && 'text-right',
                      col.align === 'center' && 'text-center',
                    )}
```

- [ ] **Step 5: Re-run the tests**

Run: `pnpm --filter @seta/ui vitest run src/components/data/DataTable.test.tsx`
Expected: PASS — all three new tests green; any pre-existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add platform/ui/src/components/data/DataTable.tsx platform/ui/src/components/data/DataTable.test.tsx
git commit -m "refactor(ui): DataTable consumes typography tokens; add numeric column prop"
```

---

### Task 4: Migrate `EmptyState` to `text-display-lg` / `text-body-md`

**Files:**
- Modify: `platform/ui/src/components/data/EmptyState.tsx`
- Test: `platform/ui/src/components/data/EmptyState.test.tsx`

`EmptyState.tsx` heading currently is `text-[26px] font-semibold leading-tight tracking-tight`; per DESIGN.md §508 + §722 the empty-state headline is `display-lg` (32/600/-0.8px). Description is `text-[14px] text-ink-mute` — should be `text-body-md text-ink-mute`.

- [ ] **Step 1: Write the failing test**

Create or extend `platform/ui/src/components/data/EmptyState.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { Inbox } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  it('heading uses text-display-lg token', () => {
    render(<EmptyState icon={Inbox} title="Nothing here" />)
    const h = screen.getByRole('heading', { name: 'Nothing here' })
    expect(h.className).toContain('text-display-lg')
    expect(h.className).not.toMatch(/text-\[26px\]/)
    expect(h.className).not.toMatch(/font-semibold/)
  })

  it('description uses text-body-md token', () => {
    render(<EmptyState icon={Inbox} title="X" description="No rows yet" />)
    const p = screen.getByText('No rows yet')
    expect(p.className).toContain('text-body-md')
    expect(p.className).toContain('text-ink-mute')
    expect(p.className).not.toMatch(/text-\[14px\]/)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @seta/ui vitest run src/components/data/EmptyState.test.tsx`
Expected: FAIL — current classes contain `text-[26px]` and `text-[14px]`.

- [ ] **Step 3: Update `EmptyState.tsx`**

Replace the `<h2>` and `<p>` lines:

```tsx
      <h2 className="text-display-lg text-ink">{title}</h2>
      {description && <p className="max-w-sm text-body-md text-ink-mute">{description}</p>}
```

(Drop `leading-tight tracking-tight font-semibold` — all encoded in `text-display-lg`.)

- [ ] **Step 4: Re-run the test**

Run: `pnpm --filter @seta/ui vitest run src/components/data/EmptyState.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add platform/ui/src/components/data/EmptyState.tsx platform/ui/src/components/data/EmptyState.test.tsx
git commit -m "refactor(ui): EmptyState uses display-lg + body-md tokens"
```

---

### Task 5: Migrate `Button` size variants to `text-button-md` / `text-button-sm`

**Files:**
- Modify: `platform/ui/src/components/forms/Button.tsx`
- Test: `platform/ui/src/components/forms/Button.test.tsx`

`Button.tsx` size variants hardcode `text-[14px]` and `text-[13px]` (lines around `size: { md: ..., sm: ... }`). The `text-button-md` (14/500) and `text-button-sm` (13/500) tokens are exact replacements; `font-medium` is already on the base — keep it (Tailwind's `font-medium` is harmless since the typography token's `fontWeight: 500` matches and CSS just sets the same value).

- [ ] **Step 1: Write the failing test**

Append to `platform/ui/src/components/forms/Button.test.tsx`:

```tsx
  it('size md uses text-button-md token', () => {
    render(<Button>Save</Button>)
    expect(screen.getByRole('button').className).toContain('text-button-md')
    expect(screen.getByRole('button').className).not.toMatch(/text-\[14px\]/)
  })

  it('size sm uses text-button-sm token', () => {
    render(<Button size="sm">Save</Button>)
    expect(screen.getByRole('button').className).toContain('text-button-sm')
    expect(screen.getByRole('button').className).not.toMatch(/text-\[13px\]/)
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @seta/ui vitest run src/components/forms/Button.test.tsx`
Expected: FAIL — both size variants still use bracket sizes.

- [ ] **Step 3: Update `Button.tsx`**

In the `cva` size variant block (around the `size: { md:..., sm:... }` lines), replace:

```tsx
      size: {
        md: 'h-9 px-3.5 text-[14px]',
        sm: 'h-8 px-2.5 text-[13px]',
      },
```

with:

```tsx
      size: {
        md: 'h-9 px-3.5 text-button-md',
        sm: 'h-8 px-2.5 text-button-sm',
      },
```

- [ ] **Step 4: Re-run the test**

Run: `pnpm --filter @seta/ui vitest run src/components/forms/Button.test.tsx`
Expected: PASS — all Button tests (existing and new) green.

- [ ] **Step 5: Commit**

```bash
git add platform/ui/src/components/forms/Button.tsx platform/ui/src/components/forms/Button.test.tsx
git commit -m "refactor(ui): Button size variants consume button-md/button-sm tokens"
```

---

### Task 6: Migrate `Input`, `Select`, `Label` to body/caption tokens

**Files:**
- Modify: `platform/ui/src/components/forms/Input.tsx`
- Modify: `platform/ui/src/components/forms/Select.tsx`
- Modify: `platform/ui/src/components/forms/Label.tsx`
- Test: `platform/ui/src/components/forms/Input.test.tsx`
- Test: `platform/ui/src/components/forms/Select.test.tsx`
- Test: `platform/ui/src/components/forms/Label.test.tsx`

Three tiny one-line replacements:
- `Input.tsx` — `text-[14px]` → `text-body-md`.
- `Select.tsx` — `text-[14px]` on Trigger (line 16) and Item (line 59) → `text-body-md`.
- `Label.tsx` — `text-[13px] font-medium text-ink` → `text-caption text-ink-mute`. The label-as-form-label use case is now governed by Field; standalone Label keeps a sensible default.

- [ ] **Step 1: Write the failing tests**

Append to `platform/ui/src/components/forms/Input.test.tsx`:
```tsx
  it('uses text-body-md token', () => {
    render(<Input placeholder="x" />)
    expect(screen.getByPlaceholderText('x').className).toContain('text-body-md')
  })
```

Append to `platform/ui/src/components/forms/Select.test.tsx` (inside its existing `describe`):
```tsx
  it('Trigger uses text-body-md', () => {
    render(
      <Select.Root>
        <Select.Trigger placeholder="pick" />
      </Select.Root>,
    )
    expect(screen.getByRole('combobox').className).toContain('text-body-md')
  })
```

Append to `platform/ui/src/components/forms/Label.test.tsx`:
```tsx
  it('uses text-caption text-ink-mute tokens', () => {
    render(<Label htmlFor="x">Email</Label>)
    const lbl = screen.getByText('Email')
    expect(lbl.className).toContain('text-caption')
    expect(lbl.className).toContain('text-ink-mute')
    expect(lbl.className).not.toMatch(/text-\[13px\]/)
  })
```

(If `Select.test.tsx` or `Label.test.tsx` doesn't exist, create the file with imports + a `describe` wrapping just this test.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @seta/ui vitest run src/components/forms/`
Expected: 3 FAILs (Input, Select, Label new assertions).

- [ ] **Step 3: Update the components**

`platform/ui/src/components/forms/Input.tsx` — replace `text-[14px]` with `text-body-md` (one occurrence).

`platform/ui/src/components/forms/Select.tsx` — replace `text-[14px]` with `text-body-md` (both occurrences — Trigger line 16 and Item line 59).

`platform/ui/src/components/forms/Label.tsx` — replace the className inside `cn(...)`:

```tsx
export const Label = forwardRef<HTMLLabelElement, LabelProps>(({ className, ...rest }, ref) => (
  // biome-ignore lint/a11y/noLabelWithoutControl: htmlFor/children supplied by consumers
  <label ref={ref} className={cn('text-caption text-ink-mute', className)} {...rest} />
))
```

- [ ] **Step 4: Re-run the tests**

Run: `pnpm --filter @seta/ui vitest run src/components/forms/`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add platform/ui/src/components/forms/Input.tsx platform/ui/src/components/forms/Input.test.tsx \
        platform/ui/src/components/forms/Select.tsx platform/ui/src/components/forms/Select.test.tsx \
        platform/ui/src/components/forms/Label.tsx platform/ui/src/components/forms/Label.test.tsx
git commit -m "refactor(ui): Input/Select/Label consume body-md and caption tokens"
```

---

### Task 7: Create `PageHeader` primitive

**Files:**
- Create: `platform/ui/src/components/layout/PageHeader.tsx`
- Create: `platform/ui/src/components/layout/PageHeader.test.tsx`
- Modify: `platform/ui/src/index.ts`

New `layout/` subdirectory under `components/`. Props-based API per the approved design.

- [ ] **Step 1: Write the failing test**

Create `platform/ui/src/components/layout/PageHeader.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PageHeader } from './PageHeader'

describe('PageHeader', () => {
  it('renders title as an h1 with display-lg token', () => {
    render(<PageHeader title="Tenants" />)
    const h = screen.getByRole('heading', { level: 1, name: 'Tenants' })
    expect(h.className).toContain('text-display-lg')
  })

  it('renders description in body-md ink-mute when provided', () => {
    render(<PageHeader title="X" description="all tenants" />)
    const p = screen.getByText('all tenants')
    expect(p.className).toContain('text-body-md')
    expect(p.className).toContain('text-ink-mute')
  })

  it('does not render a description paragraph when omitted', () => {
    render(<PageHeader title="X" />)
    expect(screen.queryByText(/.+/, { selector: 'p' })).toBeNull()
  })

  it('renders actions in a flex slot to the right', () => {
    render(<PageHeader title="X" actions={<button>New</button>} />)
    const btn = screen.getByRole('button', { name: 'New' })
    expect(btn.parentElement?.className).toContain('flex')
    expect(btn.parentElement?.className).toContain('shrink-0')
  })

  it('does not render the actions slot when omitted', () => {
    const { container } = render(<PageHeader title="X" />)
    // Only one child div (the title+description column), no actions div.
    const header = container.querySelector('header')!
    expect(header.children.length).toBe(1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @seta/ui vitest run src/components/layout/PageHeader.test.tsx`
Expected: FAIL — `PageHeader` not defined.

- [ ] **Step 3: Implement `PageHeader.tsx`**

Create `platform/ui/src/components/layout/PageHeader.tsx`:

```tsx
import type { ReactNode } from 'react'

export interface PageHeaderProps {
  title: string
  description?: ReactNode
  actions?: ReactNode
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="flex items-start justify-between gap-md pb-lg">
      <div className="flex flex-col gap-xs">
        <h1 className="text-display-lg text-ink">{title}</h1>
        {description ? <p className="text-body-md text-ink-mute">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-sm">{actions}</div> : null}
    </header>
  )
}
```

- [ ] **Step 4: Export from package barrel**

In `platform/ui/src/index.ts`, add (alphabetical placement is fine; this group is "Layout"):

```ts
// Layout
export type { PageHeaderProps } from './components/layout/PageHeader'
export { PageHeader } from './components/layout/PageHeader'
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @seta/ui vitest run src/components/layout/PageHeader.test.tsx`
Expected: all 5 tests PASS.

- [ ] **Step 6: Typecheck the package**

Run: `pnpm --filter @seta/ui typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add platform/ui/src/components/layout/PageHeader.tsx \
        platform/ui/src/components/layout/PageHeader.test.tsx \
        platform/ui/src/index.ts
git commit -m "feat(ui): add PageHeader primitive"
```

---

### Task 8: Create `Field` form-layout primitive

**Files:**
- Create: `platform/ui/src/components/forms/Field.tsx`
- Create: `platform/ui/src/components/forms/Field.test.tsx`
- Modify: `platform/ui/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `platform/ui/src/components/forms/Field.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Field } from './Field'
import { Input } from './Input'

describe('Field', () => {
  it('renders label associated with the child via htmlFor', () => {
    render(
      <Field label="Email" htmlFor="email-input">
        <Input id="email-input" />
      </Field>,
    )
    const label = screen.getByText('Email')
    expect(label.tagName).toBe('LABEL')
    expect(label).toHaveAttribute('for', 'email-input')
    expect(label.className).toContain('text-caption')
    expect(label.className).toContain('text-ink-mute')
  })

  it('renders description in text-caption text-ink-mute when no error', () => {
    render(
      <Field label="x" htmlFor="i" description="helper text">
        <Input id="i" />
      </Field>,
    )
    const p = screen.getByText('helper text')
    expect(p.className).toContain('text-caption')
    expect(p.className).toContain('text-ink-mute')
  })

  it('renders error in text-caption text-error and suppresses description', () => {
    render(
      <Field label="x" htmlFor="i" description="helper" error="Required">
        <Input id="i" />
      </Field>,
    )
    expect(screen.queryByText('helper')).toBeNull()
    const err = screen.getByText('Required')
    expect(err).toHaveAttribute('role', 'alert')
    expect(err.className).toContain('text-error')
  })

  it('renders a required marker when required', () => {
    render(
      <Field label="x" htmlFor="i" required>
        <Input id="i" />
      </Field>,
    )
    expect(screen.getByText('*')).toBeInTheDocument()
  })

  it('renders no marker when not required', () => {
    render(
      <Field label="x" htmlFor="i">
        <Input id="i" />
      </Field>,
    )
    expect(screen.queryByText('*')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @seta/ui vitest run src/components/forms/Field.test.tsx`
Expected: FAIL — `Field` not defined.

- [ ] **Step 3: Implement `Field.tsx`**

Create `platform/ui/src/components/forms/Field.tsx`:

```tsx
import type { ReactNode } from 'react'

export interface FieldProps {
  label: string
  htmlFor: string
  description?: ReactNode
  error?: string
  required?: boolean
  children: ReactNode
}

export function Field({ label, htmlFor, description, error, required, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-xs">
      <label htmlFor={htmlFor} className="text-caption text-ink-mute">
        {label}
        {required ? (
          <span className="ml-0.5 text-error" aria-hidden>
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p className="text-caption text-error" role="alert">
          {error}
        </p>
      ) : description ? (
        <p className="text-caption text-ink-mute">{description}</p>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 4: Export from package barrel**

In `platform/ui/src/index.ts`, in the "Forms" section:

```ts
export type { FieldProps } from './components/forms/Field'
export { Field } from './components/forms/Field'
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @seta/ui vitest run src/components/forms/Field.test.tsx`
Expected: all 5 tests PASS.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @seta/ui typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add platform/ui/src/components/forms/Field.tsx \
        platform/ui/src/components/forms/Field.test.tsx \
        platform/ui/src/index.ts
git commit -m "feat(ui): add Field form-layout primitive"
```

---

### Task 9: Migrate all existing `text-{xs..3xl}` and other hardcoded sizes

**Files:** (size-only swaps — no layout/structural changes)
- Modify: `apps/console/src/pages/ConsentLandingPage.tsx`
- Modify: `apps/console/src/pages/ConnectorsPage.tsx`
- Modify: `apps/console/src/routes/__root.tsx`
- Modify: `apps/console/src/routes/_authed/index.tsx`
- Modify: `apps/console/src/routes/_authed/profile.tsx`
- Modify: `apps/console/src/routes/_authed/members.tsx`
- Modify: `apps/console/src/routes/no-workspace.tsx`
- Modify: `apps/console/src/routes/_superadmin/admin/tenants.tsx`
- Modify: `platform/ui/src/components/shell/NotificationBell.tsx`
- Modify: `platform/ui/src/components/shell/SidebarNavItem.tsx`
- Modify: `platform/ui/src/components/data/TokenUsageBar.tsx`
- Modify: `apps/console/src/pages/SsoConfigForm.tsx`, `SsoDomainsTable.tsx`, `MailerConfigForm.tsx` (their existing `text-[Xpx]` hardcodes)
- Modify: `apps/console/src/pages/Members.tsx` (existing `text-[13px]` lines)

This is mechanical substitution. The build will break after Task 10 unless every default Tailwind size class is gone first. Two passes: (a) the 19 enumerated `text-{xs..3xl}` callsites; (b) any `text-[Xpx]` bracket-size hardcodes that the audit and the to-be-added CI guard would flag.

**Substitution table:**

| Existing class | Replacement |
|---|---|
| `text-2xl font-semibold` | `text-display-md` |
| `text-xl font-semibold` | `text-heading-lg` |
| `text-lg font-medium` | `text-heading-md` |
| `text-lg` (alone) | `text-heading-md` |
| `text-base` | `text-body-md` |
| `text-sm` | `text-body-md` |
| `text-xs` | `text-caption` |
| `text-[14px]` | `text-body-md` |
| `text-[13px]` | `text-body-md` (form helper/error in console) **OR** `text-button-sm` (compact button-like control) — read context |
| `text-[12px]` | `text-caption` |
| `text-[11px]` | `text-eyebrow` |
| `text-[10px]` | `text-eyebrow` (only NotificationBell — flagged in spec risks) |
| `font-mono text-xs` | `font-mono text-caption` |
| `font-mono text-sm` | `font-mono text-body-md` |

`text-ink-muted` (with the typo, in some routes) → `text-ink-mute` (correct token name) — fix at the same time.

- [ ] **Step 1: Walk each file and apply substitutions**

For each file in the list above, open it, locate the offending class strings, replace using the table. **Do not** restructure markup or change layout — this task is type-class swap only. Use `PageHeader`/`Field` in the *follow-up* per-page PRs.

Tip: `pnpm --filter @seta/console build` after each file confirms you didn't break parsing.

- [ ] **Step 2: Grep to confirm no callsites remain**

Run:
```bash
grep -rn --include='*.tsx' --include='*.ts' -E '\btext-(xs|sm|base|lg|xl|2xl|3xl|4xl)\b' apps/console/src platform/ui/src 2>/dev/null | grep -v test
```
Expected: empty output.

Run:
```bash
grep -rn --include='*.tsx' --include='*.ts' -E 'text-\[[0-9]+px\]' apps/console/src platform/ui/src 2>/dev/null | grep -v test
```
Expected: empty output.

If matches remain, edit those files and re-run.

- [ ] **Step 3: Build the console end-to-end**

Run: `pnpm --filter @seta/console build`
Expected: exit 0.

- [ ] **Step 4: Run all UI unit tests**

Run: `pnpm --filter @seta/ui vitest run`
Expected: all pass (we have not yet narrowed `fontSize`, so the legacy classes still compile — but no callsite should depend on them after this task).

- [ ] **Step 5: Commit**

```bash
git add apps/console/src platform/ui/src/components/shell/NotificationBell.tsx \
        platform/ui/src/components/shell/SidebarNavItem.tsx \
        platform/ui/src/components/data/TokenUsageBar.tsx
git commit -m "refactor(console,ui): replace hardcoded text sizes with DESIGN.md typography tokens"
```

---

### Task 10: Narrow `fontSize` so Tailwind defaults no longer compile

**Files:**
- Modify: `platform/ui/src/tokens/tailwind-preset.ts`

Now that no callsite uses `text-xs`/`text-sm`/`text-base`/`text-lg`/`text-xl`/`text-2xl`/`text-3xl`/`text-4xl` or any `text-[Xpx]`, replace `fontSize` (move from `extend.fontSize` to top-level `theme.fontSize`) so those defaults are removed from the generated CSS.

- [ ] **Step 1: Move `fontSize` out of `extend`**

In `platform/ui/src/tokens/tailwind-preset.ts`, restructure the file so `fontSize` lives directly under `theme` (not `theme.extend`). After the edit, the file is:

```ts
import type { Config } from 'tailwindcss'

export const setaPreset: Config = {
  content: [],
  theme: {
    fontSize: {
      'display-lg':    ['32px', { lineHeight: '1.15', letterSpacing: '-0.8px', fontWeight: '600' }],
      'display-md':    ['26px', { lineHeight: '1.2',  letterSpacing: '-0.5px', fontWeight: '600' }],
      'heading-lg':    ['22px', { lineHeight: '1.3',  letterSpacing: '-0.4px', fontWeight: '500' }],
      'heading-md':    ['18px', { lineHeight: '1.35', letterSpacing: '-0.2px', fontWeight: '500' }],
      'heading-sm':    ['15px', { lineHeight: '1.4',  letterSpacing: '-0.1px', fontWeight: '500' }],
      'body-lg':       ['16px', { lineHeight: '1.5',  letterSpacing: '-0.05px', fontWeight: '400' }],
      'body-md':       ['14px', { lineHeight: '1.5',  letterSpacing: '0',      fontWeight: '400' }],
      'body-tabular':  ['14px', { lineHeight: '1.5',  letterSpacing: '-0.3px', fontWeight: '400', fontFeatureSettings: '"tnum"' }],
      'button-md':     ['14px', { lineHeight: '1',    letterSpacing: '0',      fontWeight: '500' }],
      'button-sm':     ['13px', { lineHeight: '1',    letterSpacing: '0',      fontWeight: '500' }],
      'caption':       ['12px', { lineHeight: '1.4',  letterSpacing: '0',      fontWeight: '400', fontFeatureSettings: '"tnum"' }],
      'eyebrow':       ['11px', { lineHeight: '1.2',  letterSpacing: '0.4px',  fontWeight: '500' }],
    },
    extend: {
      colors: { /* unchanged */ },
      borderRadius: { /* unchanged */ },
      spacing: { /* unchanged */ },
      fontFamily: { /* unchanged */ },
      boxShadow: { /* unchanged */ },
    },
  },
}
```

(Preserve the existing `colors`, `borderRadius`, `spacing`, `fontFamily`, `boxShadow` blocks verbatim — only `fontSize` moves.)

**If you used the v4 `@theme` fallback in Task 1**, this task instead removes Tailwind's default `text-*` utilities by adding to `tokens.css`:

```css
@theme {
  --text-xs: initial;
  --text-sm: initial;
  --text-base: initial;
  --text-lg: initial;
  --text-xl: initial;
  --text-2xl: initial;
  --text-3xl: initial;
  --text-4xl: initial;
  --text-5xl: initial;
  --text-6xl: initial;
  --text-7xl: initial;
  --text-8xl: initial;
  --text-9xl: initial;
}
```

(Tailwind v4's `initial` sentinel deletes the default token.)

- [ ] **Step 2: Build the console to prove no callsites regressed**

Run: `pnpm --filter @seta/console build`
Expected: exit 0. If the build complains about unknown utility (`text-sm` etc.), grep for the remaining usage, fix it, rebuild.

- [ ] **Step 3: Verify the defaults are gone from generated CSS**

Run: `grep -E "\.text-(xs|sm|base|lg|xl|[2-9]xl)\b" apps/console/dist/assets/index-*.css | head -5`
Expected: empty output. (The regex matches only the bare Tailwind defaults — it will NOT match `.text-body-md`, `.text-heading-lg`, etc. because those have additional characters between `.text-` and the suffix.)

- [ ] **Step 4: Run typecheck and tests**

Run in parallel:
- `pnpm typecheck`
- `pnpm --filter @seta/ui vitest run`

Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add platform/ui/src/tokens/tailwind-preset.ts
# If v4 fallback: also git add platform/ui/src/tokens/tokens.css
git commit -m "feat(ui)!: narrow fontSize to design-token utilities only

Removes Tailwind default text-xs/sm/base/lg/xl/2xl/3xl from the
compiled utility surface. All callsites already migrated to named
typography tokens in the previous commit."
```

---

### Task 11: Build the `check-no-hardcoded-styles` CI guard

**Files:**
- Create: `tooling/scripts/check-no-hardcoded-styles.ts`
- Create: `tooling/scripts/check-no-hardcoded-styles.test.ts`
- Create: `tooling/scripts/fixtures/hardcoded-styles-clean.tsx`
- Create: `tooling/scripts/fixtures/hardcoded-styles-dirty.tsx`

Greps `.ts`/`.tsx` files for banned patterns (arbitrary text sizes, hex colors, arbitrary spacing, inline `style=` with banned properties, hand-rolled `tnum`). Prints `file:line` + message + suggested fix and exits non-zero on hit.

- [ ] **Step 1: Write the fixture files**

`tooling/scripts/fixtures/hardcoded-styles-clean.tsx`:
```tsx
export const Clean = () => (
  <div className="text-body-md text-ink">
    <span className="text-caption text-ink-mute">helper</span>
  </div>
)
```

`tooling/scripts/fixtures/hardcoded-styles-dirty.tsx`:
```tsx
export const Dirty = () => (
  <div className="text-[14px] text-[#62666d]" style={{ color: '#000', padding: 10 }}>
    <span className="bg-[#fff] p-[10px]">x</span>
    <em style={{ fontFeatureSettings: '"tnum"' }}>y</em>
  </div>
)
```

- [ ] **Step 2: Write the failing test**

Create `tooling/scripts/check-no-hardcoded-styles.test.ts`:

```ts
import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const script = 'tooling/scripts/check-no-hardcoded-styles.ts'

function run(args: string[]) {
  try {
    return {
      code: 0,
      out: execFileSync('pnpm', ['tsx', script, ...args], { encoding: 'utf8' }),
    }
  } catch (err) {
    const e = err as { status: number; stdout: string; stderr: string }
    return { code: e.status, out: `${e.stdout}\n${e.stderr}` }
  }
}

describe('check-no-hardcoded-styles', () => {
  it('passes on a clean file', () => {
    const r = run(['tooling/scripts/fixtures/hardcoded-styles-clean.tsx'])
    expect(r.code).toBe(0)
  })

  it('fails on a dirty file and reports the patterns', () => {
    const r = run(['tooling/scripts/fixtures/hardcoded-styles-dirty.tsx'])
    expect(r.code).not.toBe(0)
    expect(r.out).toMatch(/text-\[14px\]/)
    expect(r.out).toMatch(/text-\[#62666d\]/)
    expect(r.out).toMatch(/bg-\[#fff\]/)
    expect(r.out).toMatch(/p-\[10px\]/)
    expect(r.out).toMatch(/style=/)
    expect(r.out).toMatch(/tnum/)
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm vitest run tooling/scripts/check-no-hardcoded-styles.test.ts`
Expected: FAIL — script does not exist.

- [ ] **Step 4: Implement the script**

Create `tooling/scripts/check-no-hardcoded-styles.ts`:

```ts
#!/usr/bin/env tsx
import { execSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { extname, posix, sep } from 'node:path'

interface Rule {
  pattern: RegExp
  message: string
}

const RULES: Rule[] = [
  {
    pattern: /text-\[\d+(?:\.\d+)?px\]/,
    message: 'arbitrary text size — use a typography token (text-body-md, text-caption, text-eyebrow, ...).',
  },
  {
    pattern: /text-\[#[0-9a-fA-F]{3,8}\]/,
    message: 'hardcoded hex color — use a named color token (text-ink, text-ink-mute, text-primary, ...).',
  },
  {
    pattern: /(?:bg|border)-\[#[0-9a-fA-F]{3,8}\]/,
    message: 'hardcoded hex color — use a named color token.',
  },
  {
    pattern: /\b(?:p|m|gap)(?:[xytrbl])?-\[\d+(?:\.\d+)?px\]/,
    message: 'arbitrary spacing — use a spacing token (p-sm, p-md, gap-xs, ...).',
  },
  {
    pattern: /style=\{\{[^}]*(?:color|background|fontSize|padding|margin|gap)\s*:/,
    message: 'inline style for color/background/fontSize/padding/margin/gap — use a Tailwind class with a token.',
  },
  {
    pattern: /font-feature-settings\s*:\s*['"]tnum['"]/,
    message: 'hand-rolled tnum — use text-body-tabular or text-caption, or the .tnum utility class.',
  },
]

const EXEMPT_DIRS = ['node_modules', 'dist', '.next', '.turbo', '.git', 'platform/ui/src/tokens']
const EXEMPT_PATTERNS = [
  /\.test\.tsx?$/,
  /[/\\]test[/\\]/,
  /[/\\]tests[/\\]/,
  /\.gen\.tsx?$/,
  /[/\\]fixtures[/\\]/,  // applied only in default scan mode, NOT when explicit args are passed
]

function listFiles(roots: string[]): string[] {
  const cmd =
    roots.length > 0
      ? `git ls-files -- ${roots.map((r) => `'${r}'`).join(' ')}`
      : `git ls-files`
  const out = execSync(cmd, { encoding: 'utf8' })
  return out
    .split('\n')
    .filter(Boolean)
    .filter((f) => ['.ts', '.tsx'].includes(extname(f)))
    .filter((f) => !EXEMPT_DIRS.some((d) => f.startsWith(d + '/') || f.includes(`/${d}/`)))
    .filter((f) => !EXEMPT_PATTERNS.some((p) => p.test(f)))
}

interface Hit {
  file: string
  line: number
  match: string
  message: string
}

function scan(file: string): Hit[] {
  let content: string
  try {
    if (!statSync(file).isFile()) return []
    content = readFileSync(file, 'utf8')
  } catch {
    return []
  }
  const hits: Hit[] = []
  const lines = content.split('\n')
  lines.forEach((line, i) => {
    for (const rule of RULES) {
      const m = line.match(rule.pattern)
      if (m) {
        hits.push({ file, line: i + 1, match: m[0], message: rule.message })
      }
    }
  })
  return hits
}

function main() {
  const args = process.argv.slice(2)
  // If args are specific files, scan them as-is (used by tests + ad-hoc).
  // Otherwise scan the default roots via git ls-files (which applies exempt filters).
  const defaultRoots = ['apps', 'modules', 'platform']
  const explicitFiles =
    args.length > 0 && args.every((a) => a.endsWith('.ts') || a.endsWith('.tsx'))
  const files = explicitFiles ? args : listFiles(args.length > 0 ? args : defaultRoots)

  const allHits = files.flatMap(scan)
  if (allHits.length === 0) {
    console.log(`✓ no hardcoded styles in ${files.length} file(s)`)
    return
  }
  for (const h of allHits) {
    const rel = h.file.split(sep).join(posix.sep)
    console.log(`${rel}:${h.line}`)
    console.log(`  Found banned pattern: ${h.match}`)
    console.log(`  ${h.message}`)
    console.log('')
  }
  console.log(`✗ ${allHits.length} violation(s) in ${new Set(allHits.map((h) => h.file)).size} file(s)`)
  process.exit(1)
}

main()
```

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run tooling/scripts/check-no-hardcoded-styles.test.ts`
Expected: all 3 tests PASS.

- [ ] **Step 6: Run the script against the real repo to confirm Task 9 cleaned everything up**

Run: `pnpm tsx tooling/scripts/check-no-hardcoded-styles.ts`
Expected: `✓ no hardcoded styles in <N> file(s)`, exit 0.

If violations are found, they are real misses from Task 9 — fix them in `apps/console` / `platform/ui` (small commit), then re-run.

- [ ] **Step 7: Commit**

```bash
git add tooling/scripts/check-no-hardcoded-styles.ts \
        tooling/scripts/check-no-hardcoded-styles.test.ts \
        tooling/scripts/fixtures/hardcoded-styles-clean.tsx \
        tooling/scripts/fixtures/hardcoded-styles-dirty.tsx
git commit -m "feat(tooling): add check-no-hardcoded-styles CI guard"
```

---

### Task 12: Wire the CI guard into the lint job

**Files:**
- Modify: `.github/workflows/ci.yml`

Existing pattern (line 27): boundary checks run as `pnpm tsx tooling/scripts/check-public-private.ts` inside the `lint` job. Add the new check next to those.

- [ ] **Step 1: Add the CI step**

Edit `.github/workflows/ci.yml`. In the `lint` job, after the existing `check-no-manual-pkg-edit.ts` step (around line 27), append:

```yaml
      - run: pnpm tsx tooling/scripts/check-no-hardcoded-styles.ts
```

So the lint job ends with three boundary-check steps:
```yaml
      - run: pnpm tsx tooling/scripts/check-public-private.ts
      - run: pnpm tsx tooling/scripts/check-no-manual-pkg-edit.ts
        env:
          BASE_REF: origin/${{ github.base_ref || 'main' }}
      - run: pnpm tsx tooling/scripts/check-no-hardcoded-styles.ts
```

- [ ] **Step 2: Validate YAML**

Run: `pnpm tsx -e "import('js-yaml').then(y => y.load(require('fs').readFileSync('.github/workflows/ci.yml', 'utf8'))).then(() => console.log('ok'))"`

If `js-yaml` isn't installed, this minimal check suffices:
Run: `python3 -c 'import yaml,sys; yaml.safe_load(open(".github/workflows/ci.yml")); print("ok")'`
Expected output: `ok`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run check-no-hardcoded-styles in lint job"
```

---

### Task 13: Add changeset and final acceptance run

**Files:**
- Create: `.changeset/<auto-named>.md`

- [ ] **Step 1: Generate a changeset for `@seta/ui`**

Run: `pnpm changeset`

Interactive prompt:
- Mark `@seta/ui` as **minor**.
- No other packages.
- Summary (paste exactly):
  ```
  feat: typography tokens (display-lg through eyebrow, body-tabular with auto tnum) + PageHeader + Field primitives. Tailwind default text-* utilities (text-xs..text-3xl) removed — consumers must use named typography tokens. DataTable gains a `numeric` column prop. StatusBadge, EmptyState, Button, Input, Select, Label migrated to the new tokens.
  ```

- [ ] **Step 2: Run full acceptance suite**

Run all in sequence:
```bash
pnpm install --frozen-lockfile     # if changeset modified lockfile
pnpm lint
pnpm typecheck
pnpm --filter @seta/ui vitest run
pnpm --filter @seta/console build
pnpm tsx tooling/scripts/check-no-hardcoded-styles.ts
```
Expected: every command exits 0.

- [ ] **Step 3: Verify the spec's acceptance criteria one by one**

For each criterion from the spec's "Acceptance" section, run the verification:

- `text-body-md` etc. compile → already verified in Task 1 Step 3 and Task 10 Step 3.
- `text-sm`, `text-xs`, etc. do **not** compile → already verified in Task 10 Step 3.
- `PageHeader` and `Field` exported with tests → confirm with:
  ```bash
  grep -E "PageHeader|Field" platform/ui/src/index.ts
  ```
  Expected: both names appear.
- Existing primitives contain no hardcoded text sizes → covered by `check-no-hardcoded-styles`.
- CI guard runs in CI and fails on banned patterns → wired in Task 12; the unit tests in Task 11 prove failure behavior.
- All checks pass → just verified in Step 2.

- [ ] **Step 4: Commit the changeset**

```bash
git add .changeset/
git commit -m "chore: changeset for ui typography tokens and primitives"
```

- [ ] **Step 5: Final sanity — review the commit log**

Run: `git log --oneline origin/main..HEAD`
Expected output (order matches the tasks):
```
chore: changeset for ui typography tokens and primitives
ci: run check-no-hardcoded-styles in lint job
feat(tooling): add check-no-hardcoded-styles CI guard
feat(ui)!: narrow fontSize to design-token utilities only
refactor(console,ui): replace hardcoded text sizes with DESIGN.md typography tokens
feat(ui): add Field form-layout primitive
feat(ui): add PageHeader primitive
refactor(ui): Input/Select/Label consume body-md and caption tokens
refactor(ui): Button size variants consume button-md/button-sm tokens
refactor(ui): EmptyState uses display-lg + body-md tokens
refactor(ui): DataTable consumes typography tokens; add numeric column prop
refactor(ui): StatusBadge uses text-eyebrow token
feat(ui): add DESIGN.md typography tokens to tailwind preset
```

13 commits, one per task. Ready to push and open the PR.

---

## Notes for the executing engineer

- **TDD strict where it pays.** Tests in this plan are deliberately small assertions on token classes; they catch regressions cheaply (e.g., if someone "fixes" a token by replacing it with a bracket size). Don't write integration tests for token usage — that's what the CI guard is for.
- **Frequent commits.** Each task ends with one commit. Do not bundle.
- **No legacy or aliases** (per `CLAUDE.md`): Task 10's `fontSize` narrowing is the "change all callers + delete old shape" rule applied to the type scale.
- **Conventional Commits scope** = package name without `@seta/` prefix (so `ui`, `tooling`, `console`).
- **Per-page PR follow-ups** (out of scope for this plan): apply `PageHeader` + `Field` to each console page, mark `DataTable` numeric columns. Each is a separate PR.
