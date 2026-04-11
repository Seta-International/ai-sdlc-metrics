# Design Spec: Component Design System Update

> Align all shared UI components with DESIGN.md tokens. Keep shadcn/ui architecture,
> remap CSS foundation, add theme/density support, tweak 7 components.

**Date:** 2026-04-11
**Status:** Approved
**Scope:** `packages/ui` + all 12 zone layouts

---

## Context

The `packages/ui` package contains 57 shadcn/ui components using stock theming (generic
HSL vars, default spacing, no Geist font). DESIGN.md defines a complete token system:
authority blue accent, deep navy sidebar/dark mode, Geist typography, compact ERP density,
semantic status colors. The gap is the CSS foundation and a handful of component-level
overrides.

We keep shadcn's architecture (Radix primitives, CVA variants, data-slot pattern) and
remap the CSS custom properties. This preserves the shadcn upgrade path and accessibility
guarantees.

---

## Layer 1: CSS Foundation (`globals.css`)

Rewrite `packages/ui/src/styles/globals.css` to map shadcn CSS vars to DESIGN.md values.

### Light Mode (`:root`)

| shadcn var                 | DESIGN.md value | Source token         |
| -------------------------- | --------------- | -------------------- |
| `--background`             | `#F8F9FB`       | color-bg-page        |
| `--foreground`             | `#0F1B2D`       | color-text-primary   |
| `--card`                   | `#FFFFFF`       | color-bg-surface     |
| `--card-foreground`        | `#0F1B2D`       | color-text-primary   |
| `--popover`                | `#FFFFFF`       | color-bg-surface     |
| `--popover-foreground`     | `#0F1B2D`       | color-text-primary   |
| `--primary`                | `#1D4ED8`       | color-accent         |
| `--primary-foreground`     | `#FFFFFF`       | color-text-inverse   |
| `--secondary`              | `#F1F3F6`       | color-bg-subtle      |
| `--secondary-foreground`   | `#475569`       | color-text-secondary |
| `--muted`                  | `#F1F3F6`       | color-bg-subtle      |
| `--muted-foreground`       | `#64748B`       | color-text-muted     |
| `--accent`                 | `#EFF6FF`       | color-accent-subtle  |
| `--accent-foreground`      | `#1D4ED8`       | color-text-accent    |
| `--destructive`            | `#DC2626`       | color-red-600        |
| `--destructive-foreground` | `#FFFFFF`       | color-text-inverse   |
| `--border`                 | `#E2E8F0`       | color-border-subtle  |
| `--input`                  | `#E2E8F0`       | color-border-subtle  |
| `--ring`                   | `#DBEAFE`       | color-accent-muted   |
| `--radius`                 | `6px`           | radius-md            |

### Dark Mode (`.dark`)

| shadcn var                 | DESIGN.md value         | Source token         |
| -------------------------- | ----------------------- | -------------------- |
| `--background`             | `#0A0F1E`               | deep navy            |
| `--foreground`             | `#F1F5F9`               | color-text-primary   |
| `--card`                   | `#111827`               | color-bg-surface     |
| `--card-foreground`        | `#F1F5F9`               | color-text-primary   |
| `--popover`                | `#111827`               | color-bg-surface     |
| `--popover-foreground`     | `#F1F5F9`               | color-text-primary   |
| `--primary`                | `#3B82F6`               | color-accent (dark)  |
| `--primary-foreground`     | `#FFFFFF`               | color-text-inverse   |
| `--secondary`              | `#1F2937`               | color-bg-subtle      |
| `--secondary-foreground`   | `#CBD5E1`               | color-text-secondary |
| `--muted`                  | `#1F2937`               | color-bg-subtle      |
| `--muted-foreground`       | `#94A3B8`               | color-text-muted     |
| `--accent`                 | `rgba(59,130,246,0.1)`  | color-accent-subtle  |
| `--accent-foreground`      | `#3B82F6`               | color-text-accent    |
| `--destructive`            | `rgba(220,38,38,0.6)`   | color-red (dark)     |
| `--destructive-foreground` | `#FFFFFF`               | color-text-inverse   |
| `--border`                 | `#1E293B`               | color-border-subtle  |
| `--input`                  | `#1E293B`               | color-border-subtle  |
| `--ring`                   | `rgba(59,130,246,0.15)` | color-accent-muted   |

### Additional DESIGN.md Tokens

Added as extra CSS custom properties (not overriding shadcn, just extending):

```css
/* Sidebar */
--color-sidebar-bg: #0F1B2D;
--color-sidebar-text: #94A3B8;
--color-sidebar-hover: rgba(255, 255, 255, 0.07);
--color-sidebar-active: rgba(29, 78, 216, 0.25);
--color-sidebar-accent: #3B82F6;

/* Status */
--color-bg-success: #F0FDF4;
--color-text-success: #15803D;
--color-bg-warning: #FEF3C7;
--color-text-warning: #B45309;
--color-bg-danger: #FEE2E2;
--color-text-danger: #B91C1C;
--color-bg-info: #EFF6FF;
--color-text-info: #1D4ED8;

/* Spacing */
--space-1 through --space-16 (4px grid)

/* Motion */
--motion-fast: 100ms;
--motion-normal: 150ms;
--motion-slow: 250ms;

/* Font families (set by next/font CSS variables) */
--font-family-body: var(--font-geist), -apple-system, system-ui, sans-serif;
--font-family-mono: var(--font-geist-mono), 'Fira Code', monospace;
```

Dark mode overrides for status colors and sidebar per DESIGN.md section 4.

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Layer 2: Font System

### New file: `packages/ui/src/lib/fonts.ts`

```ts
import { Geist, Geist_Mono } from 'next/font/google'

export const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
  display: 'swap',
})

export const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
})

export const fontVariables = `${geist.variable} ${geistMono.variable}`
```

### Zone layout updates (all 12)

```tsx
import { fontVariables } from '@future/ui/fonts'

export default function Layout({ children }) {
  return (
    <html lang="en" className={fontVariables}>
      <body>...</body>
    </html>
  )
}
```

Export path: add `"./fonts"` to `package.json` exports map pointing at `src/lib/fonts.ts`.

---

## Layer 3: Theme Provider

### New file: `packages/ui/src/components/theme-provider.tsx`

Re-export `next-themes` ThemeProvider with Future defaults:

```tsx
'use client'
import { ThemeProvider as NextThemesProvider } from 'next-themes'

export function ThemeProvider({ children, ...props }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  )
}
```

### Zone layout updates

Each zone wraps children in `<ThemeProvider>`. The `<html>` tag gets `suppressHydrationWarning`
(standard next-themes requirement).

---

## Layer 4: Component Tweaks

### 4.1 Button (`button.tsx`)

Sizing adjustments per DESIGN.md section 10.1:

| Size      | Current         | Updated                     |
| --------- | --------------- | --------------------------- |
| `sm`      | `h-8 px-3`      | `h-7 px-2 py-1 text-[11px]` |
| `default` | `h-9 px-4 py-2` | `h-8 px-3 py-2 text-xs`     |
| `lg`      | `h-10 px-6`     | `h-10 px-5 py-3 text-sm`    |

Border-radius: already `rounded-md` (6px via `--radius`). Correct.

Transition: already `transition-all`. Add `duration-100` to match `motion-fast`.

Density: compact uses the values above. Default (relaxed) adds 4px more vertical/horizontal padding.

### 4.2 Badge (`badge.tsx`)

Add status variants:

```
success: bg-[--color-bg-success] text-[--color-text-success]
warning: bg-[--color-bg-warning] text-[--color-text-warning]
danger:  bg-[--color-bg-danger] text-[--color-text-danger]
info:    bg-[--color-bg-info] text-[--color-text-info]
```

Base: `text-[11px] font-medium px-2 py-0.5 rounded-full` (already close, just pin font size).

### 4.3 Table (`table.tsx`)

**TableHead:** Change from `font-medium text-foreground` to:
`text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground`

**TableCell:** Row padding `px-3 py-2.5` for compact density. `py-3` for default.

**TableRow:** Hover `bg-muted/50` (already correct via CSS var remap).

### 4.4 Card (`card.tsx`)

- Gap: `gap-6` to `gap-4`
- Body padding: `px-6` to `px-5`
- Border-radius: `rounded-xl` to `rounded-lg` (8px)
- Shadow: `shadow-sm` (already correct)

### 4.5 Input (`input.tsx`)

Focus ring: the existing `focus-visible:ring-ring/50` will now resolve to
`rgba(#DBEAFE, 0.5)` which is close to DESIGN.md's `box-shadow: 0 0 0 3px var(--color-accent-muted)`.

Font: inherits Geist from body. Size `md:text-sm` (14px) is correct.

No structural changes needed beyond the CSS var remap.

### 4.6 Dialog (`dialog.tsx`)

- Shadow: ensure `shadow-lg`
- Border-radius: ensure `rounded-xl` (12px, `radius-xl`)
- Backdrop: `bg-black/60` with `backdrop-blur-sm`

### 4.7 Sidebar (`sidebar.tsx`)

Point the sidebar CSS custom properties at DESIGN.md values in globals.css:

```css
--sidebar-background: var(--color-sidebar-bg);
--sidebar-foreground: var(--color-sidebar-text);
--sidebar-primary: var(--color-sidebar-accent);
--sidebar-primary-foreground: #ffffff;
--sidebar-accent: var(--color-sidebar-active);
--sidebar-accent-foreground: var(--color-sidebar-accent);
--sidebar-border: rgba(255, 255, 255, 0.05);
--sidebar-ring: var(--color-sidebar-accent);
```

Width stays 220px per DESIGN.md (currently 16rem/256px, adjust to `220px`).

---

## Layer 5: Density Support

### Mechanism

`data-density` attribute on `<html>`:

- `compact` (default for all zones)
- `default` (opt-in, relaxed)

### CSS approach

```css
:root {
  --density: compact;
}
[data-density='default'] {
  --density: default;
}
```

Components that respond to density use Tailwind's `data-*` variants or
CSS selectors in globals.css:

```css
/* Example: table cell padding */
[data-density='compact'] [data-slot='table-cell'] {
  padding: 10px 12px;
}
[data-density='default'] [data-slot='table-cell'] {
  padding: 12px 12px;
}
```

Affected components: Button (padding), Table (row height), Card (gap/padding),
Input (height), Badge (padding), Sidebar (item padding).

Density is set once at the zone layout level. Not prop-drilled.

---

## Files Changed

| File                                            | Action                                 |
| ----------------------------------------------- | -------------------------------------- |
| `packages/ui/src/styles/globals.css`            | Rewrite                                |
| `packages/ui/src/lib/fonts.ts`                  | New                                    |
| `packages/ui/src/components/theme-provider.tsx` | New                                    |
| `packages/ui/src/index.ts`                      | Add exports                            |
| `packages/ui/package.json`                      | Add `./fonts` export                   |
| `packages/ui/src/components/ui/button.tsx`      | Tweak sizing                           |
| `packages/ui/src/components/ui/badge.tsx`       | Add status variants                    |
| `packages/ui/src/components/ui/table.tsx`       | Header styling, compact padding        |
| `packages/ui/src/components/ui/card.tsx`        | Tighter gap/padding/radius             |
| `packages/ui/src/components/ui/dialog.tsx`      | Shadow + radius                        |
| `packages/ui/src/components/ui/sidebar.tsx`     | Width + var mapping                    |
| `apps/web-*/src/app/layout.tsx` (x12)           | Font vars, ThemeProvider, data-density |

### Not in scope

- No new components (AppLauncher/GlobalNav already shipped)
- No page-level patterns (dashboards, forms — built when features ship)
- No changes to the ~50 shadcn components that inherit correctly from CSS vars
- No Input structural changes (focus ring correct after var remap)
