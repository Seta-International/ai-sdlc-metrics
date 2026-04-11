# Component Design System Update — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align all shared UI components with DESIGN.md tokens — correct colors, Geist font, compact density, light/dark theme support — while keeping shadcn/ui architecture intact.

**Architecture:** Remap shadcn's CSS custom properties to DESIGN.md values in `globals.css`. Add Geist font loading via `next/font/google`. Wrap zones in a ThemeProvider. Tweak 7 components where the spec diverges from shadcn defaults. Add density modes via `data-density` attribute.

**Tech Stack:** Tailwind v4, shadcn/ui (Radix + CVA), next-themes, next/font/google, Geist + Geist Mono

**Status:** implemented

---

## File Map

| File                                            | Action  | Responsibility                                                   |
| ----------------------------------------------- | ------- | ---------------------------------------------------------------- |
| `packages/ui/src/styles/globals.css`            | Rewrite | CSS foundation — all token mappings, density, reduced motion     |
| `packages/ui/src/lib/fonts.ts`                  | Create  | Geist + Geist Mono font config via next/font/google              |
| `packages/ui/src/components/theme-provider.tsx` | Create  | next-themes wrapper with Future defaults                         |
| `packages/ui/src/index.ts`                      | Modify  | Add ThemeProvider export                                         |
| `packages/ui/package.json`                      | Modify  | Add `./fonts` export path                                        |
| `packages/ui/src/components/ui/button.tsx`      | Modify  | Compact sizing per DESIGN.md                                     |
| `packages/ui/src/components/ui/badge.tsx`       | Modify  | Add status variants (success/warning/danger/info)                |
| `packages/ui/src/components/ui/table.tsx`       | Modify  | Uppercase headers, compact padding                               |
| `packages/ui/src/components/ui/card.tsx`        | Modify  | Tighter gap/padding, rounded-lg                                  |
| `packages/ui/src/components/ui/dialog.tsx`      | Modify  | Shadow-lg, rounded-xl, backdrop blur                             |
| `packages/ui/src/components/ui/sidebar.tsx`     | Modify  | Width 220px                                                      |
| `apps/web-*/src/app/layout.tsx` (x12)           | Modify  | Font vars, ThemeProvider, data-density, suppressHydrationWarning |
| `apps/web-*/src/app/globals.css` (x12)          | Modify  | Import shared globals.css from @future/ui                        |

---

### Task 1: Rewrite globals.css — CSS Foundation

**Files:**

- Rewrite: `packages/ui/src/styles/globals.css`

- [ ] **Step 1: Replace globals.css with DESIGN.md token mapping**

Replace the entire contents of `packages/ui/src/styles/globals.css` with:

```css
@import 'tailwindcss';

@layer base {
  :root {
    /* ── shadcn vars → DESIGN.md light mode ── */
    --background: #f8f9fb;
    --foreground: #0f1b2d;
    --card: #ffffff;
    --card-foreground: #0f1b2d;
    --popover: #ffffff;
    --popover-foreground: #0f1b2d;
    --primary: #1d4ed8;
    --primary-foreground: #ffffff;
    --secondary: #f1f3f6;
    --secondary-foreground: #475569;
    --muted: #f1f3f6;
    --muted-foreground: #64748b;
    --accent: #eff6ff;
    --accent-foreground: #1d4ed8;
    --destructive: #dc2626;
    --destructive-foreground: #ffffff;
    --border: #e2e8f0;
    --input: #e2e8f0;
    --ring: #dbeafe;
    --radius: 6px;

    /* ── DESIGN.md semantic tokens ── */
    --color-sidebar-bg: #0f1b2d;
    --color-sidebar-text: #94a3b8;
    --color-sidebar-hover: rgba(255, 255, 255, 0.07);
    --color-sidebar-active: rgba(29, 78, 216, 0.25);
    --color-sidebar-accent: #3b82f6;

    --color-bg-success: #f0fdf4;
    --color-text-success: #15803d;
    --color-border-success: #dcfce7;
    --color-bg-warning: #fef3c7;
    --color-text-warning: #b45309;
    --color-border-warning: #fde68a;
    --color-bg-danger: #fee2e2;
    --color-text-danger: #b91c1c;
    --color-border-danger: #fecaca;
    --color-bg-info: #eff6ff;
    --color-text-info: #1d4ed8;

    /* ── Sidebar (shadcn sidebar component vars) ── */
    --sidebar-background: #0f1b2d;
    --sidebar-foreground: #94a3b8;
    --sidebar-primary: #3b82f6;
    --sidebar-primary-foreground: #ffffff;
    --sidebar-accent: rgba(29, 78, 216, 0.25);
    --sidebar-accent-foreground: #3b82f6;
    --sidebar-border: rgba(255, 255, 255, 0.05);
    --sidebar-ring: #3b82f6;

    /* ── Motion ── */
    --motion-fast: 100ms;
    --motion-normal: 150ms;
    --motion-slow: 250ms;

    /* ── Font (vars set by next/font on <html>) ── */
    --font-family-body: var(--font-geist, 'Geist'), -apple-system, system-ui, sans-serif;
    --font-family-mono: var(--font-geist-mono, 'Geist Mono'), 'Fira Code', monospace;
  }

  .dark {
    /* ── shadcn vars → DESIGN.md dark mode ── */
    --background: #0a0f1e;
    --foreground: #f1f5f9;
    --card: #111827;
    --card-foreground: #f1f5f9;
    --popover: #111827;
    --popover-foreground: #f1f5f9;
    --primary: #3b82f6;
    --primary-foreground: #ffffff;
    --secondary: #1f2937;
    --secondary-foreground: #cbd5e1;
    --muted: #1f2937;
    --muted-foreground: #94a3b8;
    --accent: rgba(59, 130, 246, 0.1);
    --accent-foreground: #3b82f6;
    --destructive: #dc2626;
    --destructive-foreground: #ffffff;
    --border: #1e293b;
    --input: #1e293b;
    --ring: rgba(59, 130, 246, 0.15);

    /* ── Dark status ── */
    --color-bg-success: rgba(22, 163, 74, 0.1);
    --color-text-success: #4ade80;
    --color-bg-warning: rgba(217, 119, 6, 0.1);
    --color-text-warning: #fcd34d;
    --color-bg-danger: rgba(220, 38, 38, 0.1);
    --color-text-danger: #fca5a5;
    --color-bg-info: rgba(59, 130, 246, 0.1);
    --color-text-info: #60a5fa;

    /* ── Dark sidebar ── */
    --sidebar-background: #080d1a;
    --color-sidebar-bg: #080d1a;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
    font-family: var(--font-family-body);
  }
  code,
  pre,
  kbd,
  .font-mono {
    font-family: var(--font-family-mono);
  }
}

/* ── Density ── */

[data-density='compact'] [data-slot='button'][data-size='default'] {
  height: 32px;
  padding: 8px 12px;
  font-size: 12px;
}
[data-density='compact'] [data-slot='button'][data-size='sm'] {
  height: 28px;
  padding: 4px 8px;
  font-size: 11px;
}

[data-density='compact'] [data-slot='table-head'] {
  height: 36px;
  padding: 8px 12px;
}
[data-density='compact'] [data-slot='table-cell'] {
  padding: 10px 12px;
}

[data-density='compact'] [data-slot='card'] {
  gap: 12px;
}
[data-density='compact'] [data-slot='card-header'],
[data-density='compact'] [data-slot='card-content'],
[data-density='compact'] [data-slot='card-footer'] {
  padding-left: 16px;
  padding-right: 16px;
}

[data-density='compact'] [data-slot='input'] {
  height: 32px;
}

[data-density='compact'] [data-slot='badge'] {
  padding: 1px 6px;
  font-size: 10px;
}

/* ── Reduced Motion ── */

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 2: Run typecheck to verify no breakage**

Run: `bun run --filter @future/ui typecheck`
Expected: Exit code 0

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/styles/globals.css
git commit -m "feat(ui): rewrite globals.css with DESIGN.md token mapping

Remap all shadcn CSS vars to DESIGN.md values: authority blue accent,
deep navy dark mode, semantic status colors, sidebar tokens, motion
tokens, density overrides, and reduced motion support."
```

---

### Task 2: Create Font System

**Files:**

- Create: `packages/ui/src/lib/fonts.ts`
- Modify: `packages/ui/package.json`

- [ ] **Step 1: Create fonts.ts**

Create `packages/ui/src/lib/fonts.ts`:

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

- [ ] **Step 2: Add export path to package.json**

In `packages/ui/package.json`, update the `"exports"` field from:

```json
"exports": {
  ".": {
    "import": "./src/index.ts",
    "types": "./src/index.ts"
  }
}
```

To:

```json
"exports": {
  ".": {
    "import": "./src/index.ts",
    "types": "./src/index.ts"
  },
  "./fonts": {
    "import": "./src/lib/fonts.ts",
    "types": "./src/lib/fonts.ts"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/lib/fonts.ts packages/ui/package.json
git commit -m "feat(ui): add Geist font system via next/font/google

Self-hosted Geist + Geist Mono, exported from @future/ui/fonts.
Sets --font-geist and --font-geist-mono CSS variables on <html>."
```

---

### Task 3: Create ThemeProvider

**Files:**

- Create: `packages/ui/src/components/theme-provider.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Create theme-provider.tsx**

Create `packages/ui/src/components/theme-provider.tsx`:

```tsx
'use client'

import * as React from 'react'
import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from 'next-themes'

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
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

- [ ] **Step 2: Export ThemeProvider from index.ts**

In `packages/ui/src/index.ts`, add this line after the existing custom component exports:

```ts
export { ThemeProvider } from './components/theme-provider'
```

- [ ] **Step 3: Run typecheck**

Run: `bun run --filter @future/ui typecheck`
Expected: Exit code 0

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/components/theme-provider.tsx packages/ui/src/index.ts
git commit -m "feat(ui): add ThemeProvider wrapping next-themes

Defaults: attribute=class, defaultTheme=system, enableSystem,
disableTransitionOnChange. Exported from @future/ui."
```

---

### Task 4: Update All Zone Layouts

**Files:**

- Modify: `apps/web-people/src/app/layout.tsx`
- Modify: `apps/web-time/src/app/layout.tsx`
- Modify: `apps/web-hiring/src/app/layout.tsx`
- Modify: `apps/web-performance/src/app/layout.tsx`
- Modify: `apps/web-projects/src/app/layout.tsx`
- Modify: `apps/web-finance/src/app/layout.tsx`
- Modify: `apps/web-goals/src/app/layout.tsx`
- Modify: `apps/web-insights/src/app/layout.tsx`
- Modify: `apps/web-agents/src/app/layout.tsx`
- Modify: `apps/web-planner/src/app/layout.tsx`
- Modify: `apps/web-admin/src/app/layout.tsx`
- Modify: `apps/web-shell/src/app/page.tsx`
- Modify: `apps/web-*/src/app/globals.css` (x12)

- [ ] **Step 1: Update each zone's globals.css to import the shared foundation**

Each zone's `apps/web-*/src/app/globals.css` currently contains only `@import 'tailwindcss';`. Replace with:

```css
@import 'tailwindcss';
@import '@future/ui/src/styles/globals.css';
```

This applies to all 12 zones: web-people, web-time, web-hiring, web-performance, web-projects, web-finance, web-goals, web-insights, web-agents, web-planner, web-admin, web-shell.

- [ ] **Step 2: Update web-projects layout (template for all zones)**

Replace `apps/web-projects/src/app/layout.tsx` with:

```tsx
import type { Metadata } from 'next'
import { GlobalNav, ThemeProvider } from '@future/ui'
import { fontVariables } from '@future/ui/fonts'
import './globals.css'

export const metadata: Metadata = { title: 'Projects — Future' }

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontVariables} data-density="compact" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <GlobalNav currentApp="projects" />
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
```

- [ ] **Step 3: Apply same pattern to remaining 10 zone layouts**

Each zone uses the same structure. Only `currentApp` and `metadata.title` differ:

| Zone            | `currentApp`    | `title`                |
| --------------- | --------------- | ---------------------- |
| web-people      | `"people"`      | `People — Future`      |
| web-time        | `"time"`        | `Time — Future`        |
| web-hiring      | `"hiring"`      | `Hiring — Future`      |
| web-performance | `"performance"` | `Performance — Future` |
| web-finance     | `"finance"`     | `Finance — Future`     |
| web-goals       | `"goals"`       | `Goals — Future`       |
| web-insights    | `"insights"`    | `Insights — Future`    |
| web-agents      | `"agents"`      | `Agents — Future`      |
| web-planner     | `"planner"`     | `Planner — Future`     |
| web-admin       | `"admin"`       | `Admin — Future`       |

For each, the layout follows the exact same structure as Step 2 with the correct `currentApp` and `title` values.

- [ ] **Step 4: Update web-shell layout.tsx**

web-shell has its own `layout.tsx` at `apps/web-shell/src/app/layout.tsx`. Replace it with:

```tsx
import type { Metadata } from 'next'
import { ThemeProvider } from '@future/ui'
import { fontVariables } from '@future/ui/fonts'
import './globals.css'

export const metadata: Metadata = {
  title: 'Future',
  description: 'Agent-native enterprise OS by SETA',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontVariables} data-density="compact" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
```

Keep `apps/web-shell/src/app/page.tsx` as-is (it uses `GlobalNav` inside the layout).

- [ ] **Step 5: Run full typecheck**

Run: `bun run typecheck`
Expected: All tasks pass (23 successful)

- [ ] **Step 6: Commit**

```bash
git add apps/
git commit -m "feat(zones): add Geist fonts, ThemeProvider, compact density to all zones

All 12 zone layouts now import @future/ui/fonts, wrap in ThemeProvider,
set data-density=compact, and import shared globals.css."
```

---

### Task 5: Tweak Button Component

**Files:**

- Modify: `packages/ui/src/components/ui/button.tsx`

- [ ] **Step 1: Update button sizing and transition**

In `packages/ui/src/components/ui/button.tsx`, replace the `buttonVariants` definition.

Change the base classes from:

```
"inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
```

To:

```
"inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-xs font-medium whitespace-nowrap transition-all duration-100 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
```

Changes: `text-sm` → `text-xs` (12px default), add `duration-100` (motion-fast).

Then update the `size` variants from:

```ts
size: {
  default: 'h-9 px-4 py-2 has-[>svg]:px-3',
  xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
  sm: 'h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5',
  lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
  icon: 'size-9',
  'icon-xs': "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
  'icon-sm': 'size-8',
  'icon-lg': 'size-10',
},
```

To:

```ts
size: {
  default: 'h-8 px-3 py-2 has-[>svg]:px-2.5',
  xs: "h-6 gap-1 rounded-md px-2 text-[11px] has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
  sm: 'h-7 gap-1.5 rounded-md px-2 py-1 text-[11px] has-[>svg]:px-1.5',
  lg: 'h-10 rounded-md px-5 py-3 text-sm has-[>svg]:px-4',
  icon: 'size-8',
  'icon-xs': "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
  'icon-sm': 'size-7',
  'icon-lg': 'size-10',
},
```

- [ ] **Step 2: Run typecheck**

Run: `bun run --filter @future/ui typecheck`
Expected: Exit code 0

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/ui/button.tsx
git commit -m "feat(ui): compact button sizing per DESIGN.md

Default: h-8 px-3 text-xs. Small: h-7 px-2 text-[11px].
Large: h-10 px-5 text-sm. Added duration-100 for motion-fast."
```

---

### Task 6: Add Badge Status Variants

**Files:**

- Modify: `packages/ui/src/components/ui/badge.tsx`

- [ ] **Step 1: Add success, warning, danger, info variants**

In `packages/ui/src/components/ui/badge.tsx`, replace the `badgeVariants` definition.

Change the base classes from:

```
'inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3'
```

To:

```
'inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-[11px] font-medium whitespace-nowrap transition-[color,box-shadow] duration-100 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3'
```

Changes: `text-xs` → `text-[11px]`, add `duration-100`.

Then add the new variants to the `variant` object after `link`:

```ts
variant: {
  default: 'bg-primary text-primary-foreground [a&]:hover:bg-primary/90',
  secondary: 'bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90',
  destructive:
    'bg-destructive text-white focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40 [a&]:hover:bg-destructive/90',
  outline:
    'border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
  ghost: '[a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
  link: 'text-primary underline-offset-4 [a&]:hover:underline',
  success: 'bg-(--color-bg-success) text-(--color-text-success) border-(--color-border-success)',
  warning: 'bg-(--color-bg-warning) text-(--color-text-warning) border-(--color-border-warning)',
  danger: 'bg-(--color-bg-danger) text-(--color-text-danger) border-(--color-border-danger)',
  info: 'bg-(--color-bg-info) text-(--color-text-info)',
},
```

- [ ] **Step 2: Run typecheck**

Run: `bun run --filter @future/ui typecheck`
Expected: Exit code 0

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/ui/badge.tsx
git commit -m "feat(ui): add success/warning/danger/info badge variants

Semantic status badges using DESIGN.md status color tokens.
Base font pinned to 11px per spec."
```

---

### Task 7: Update Table Component

**Files:**

- Modify: `packages/ui/src/components/ui/table.tsx`

- [ ] **Step 1: Update TableHead styling**

In `packages/ui/src/components/ui/table.tsx`, find the `TableHead` function. Change the className from:

```
'h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]'
```

To:

```
'h-9 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] whitespace-nowrap text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]'
```

Changes: `h-10` → `h-9`, `px-2` → `px-3`, `font-medium` → `text-[11px] font-semibold uppercase tracking-[0.05em]`, `text-foreground` → `text-muted-foreground`.

- [ ] **Step 2: Update TableCell padding**

In the same file, find the `TableCell` function. Change the className from:

```
'p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]'
```

To:

```
'px-3 py-2.5 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]'
```

Changes: `p-2` → `px-3 py-2.5` (compact density default).

- [ ] **Step 3: Run typecheck**

Run: `bun run --filter @future/ui typecheck`
Expected: Exit code 0

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/components/ui/table.tsx
git commit -m "feat(ui): compact table styling per DESIGN.md

Headers: 11px, semibold, uppercase, tracking, muted color.
Cells: px-3 py-2.5 for compact ERP density."
```

---

### Task 8: Update Card Component

**Files:**

- Modify: `packages/ui/src/components/ui/card.tsx`

- [ ] **Step 1: Update Card, CardHeader, CardContent, CardFooter**

In `packages/ui/src/components/ui/card.tsx`:

**Card** — change className from:

```
'flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm'
```

To:

```
'flex flex-col gap-4 rounded-lg border bg-card py-5 text-card-foreground shadow-sm'
```

Changes: `gap-6` → `gap-4`, `rounded-xl` → `rounded-lg`, `py-6` → `py-5`.

**CardHeader** — change className from:

```
'@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6'
```

To:

```
'@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-5 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-5'
```

Changes: `px-6` → `px-5`, `pb-6` → `pb-5`.

**CardContent** — change className from:

```
'px-6'
```

To:

```
'px-5'
```

**CardFooter** — change className from:

```
'flex items-center px-6 [.border-t]:pt-6'
```

To:

```
'flex items-center px-5 [.border-t]:pt-5'
```

- [ ] **Step 2: Run typecheck**

Run: `bun run --filter @future/ui typecheck`
Expected: Exit code 0

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/ui/card.tsx
git commit -m "feat(ui): compact card sizing per DESIGN.md

Gap 16px, padding 20px, rounded-lg (8px). Tighter than shadcn
defaults for ERP information density."
```

---

### Task 9: Update Dialog Component

**Files:**

- Modify: `packages/ui/src/components/ui/dialog.tsx`

- [ ] **Step 1: Update DialogOverlay backdrop**

In `packages/ui/src/components/ui/dialog.tsx`, find `DialogOverlay`. Change className from:

```
'fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0'
```

To:

```
'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0'
```

Changes: `bg-black/50` → `bg-black/60`, add `backdrop-blur-sm`.

- [ ] **Step 2: Update DialogContent shadow and radius**

In the same file, find `DialogContent`. Change className from:

```
'fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg duration-200 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg'
```

To:

```
'fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-xl border bg-background p-6 shadow-lg duration-200 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg'
```

Changes: `rounded-lg` → `rounded-xl` (12px per DESIGN.md radius-xl for modals). Shadow already `shadow-lg`. Correct.

- [ ] **Step 3: Run typecheck**

Run: `bun run --filter @future/ui typecheck`
Expected: Exit code 0

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/components/ui/dialog.tsx
git commit -m "feat(ui): dialog backdrop blur + rounded-xl per DESIGN.md

Overlay: bg-black/60 with backdrop-blur-sm. Content: rounded-xl
(12px) for modal-level elevation."
```

---

### Task 10: Update Sidebar Width

**Files:**

- Modify: `packages/ui/src/components/ui/sidebar.tsx`

- [ ] **Step 1: Change sidebar width constant**

In `packages/ui/src/components/ui/sidebar.tsx`, find line 19:

```ts
const SIDEBAR_WIDTH = '16rem'
```

Change to:

```ts
const SIDEBAR_WIDTH = '220px'
```

This matches DESIGN.md's 220px sidebar width spec.

- [ ] **Step 2: Run typecheck**

Run: `bun run --filter @future/ui typecheck`
Expected: Exit code 0

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/ui/sidebar.tsx
git commit -m "feat(ui): sidebar width 220px per DESIGN.md

Was 16rem (256px). DESIGN.md specifies 220px fixed sidebar."
```

---

### Task 11: Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run full monorepo typecheck**

Run: `bun run typecheck`
Expected: All 23 tasks pass, exit code 0.

- [ ] **Step 2: Run prettier on all changed files**

Run: `bunx prettier --write packages/ui/src/ apps/*/src/app/layout.tsx apps/*/src/app/globals.css apps/web-shell/src/app/page.tsx`
Expected: All files formatted.

- [ ] **Step 3: Run typecheck again after formatting**

Run: `bun run typecheck`
Expected: All 23 tasks pass.

- [ ] **Step 4: Verify dark mode vars in globals.css are complete**

Manually verify that every shadcn var defined in `:root` also has a `.dark` override. Check the spec table in `docs/superpowers/specs/2026-04-11-component-design-system-update.md` Layer 1 for the complete mapping.

- [ ] **Step 5: Final commit if any formatting changes**

```bash
git add -A
git commit -m "chore(ui): format all design system changes"
```
