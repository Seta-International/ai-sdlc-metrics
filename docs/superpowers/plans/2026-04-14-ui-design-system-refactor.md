# UI Design System Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `packages/ui` to implement the design spec in `docs/superpowers/specs/2026-04-14-ui-design-system-refactor-design.md` — replace Geist fonts with Inter Variable + IBM Plex Mono, update all color tokens to the dark-mode-first indigo-violet palette, and rework `button`, `badge`, `card`, `input`, `textarea`, and `global-nav` components.

**Architecture:** Token-first. Update `globals.css` CSS variables and `fonts.ts` first — ~70% of the 57 components inherit the new look automatically via semantic tokens (`bg-background`, `border`, `text-muted-foreground`). Then make targeted edits to the six components with hardcoded Tailwind values. `data-table/` is Phase 2 and untouched.

**Tech Stack:** Next.js `next/font/google`, Tailwind CSS v4, CSS Custom Properties, CVA (`class-variance-authority`), Vitest + React Testing Library (`@testing-library/react`)

---

## File Map

| File                                            | Action | Responsibility                                                                                      |
| ----------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------- |
| `packages/ui/src/lib/fonts.ts`                  | Modify | Replace Geist with Inter Variable + IBM Plex Mono                                                   |
| `packages/ui/src/styles/globals.css`            | Modify | Color tokens, button CSS vars, `font-feature-settings`, typography utilities, `@theme` font weights |
| `packages/ui/src/components/ui/button.tsx`      | Modify | CVA variants rebuilt to spec                                                                        |
| `packages/ui/src/components/ui/button.spec.tsx` | Create | Smoke render test — all variants                                                                    |
| `packages/ui/src/components/ui/badge.tsx`       | Modify | Variants: `neutral` (pill), `success`, `subtle`                                                     |
| `packages/ui/src/components/ui/badge.spec.tsx`  | Create | Smoke render test — all variants                                                                    |
| `packages/ui/src/components/ui/card.tsx`        | Modify | Remove `shadow-sm` (depth via border, not shadow)                                                   |
| `packages/ui/src/components/ui/card.spec.tsx`   | Create | Smoke render test                                                                                   |
| `packages/ui/src/components/ui/input.tsx`       | Modify | Dark bg, updated focus ring                                                                         |
| `packages/ui/src/components/ui/textarea.tsx`    | Modify | Dark bg, updated focus ring                                                                         |
| `packages/ui/src/components/ui/input.spec.tsx`  | Create | Smoke render tests — input + textarea                                                               |
| `packages/ui/src/components/global-nav.tsx`     | Modify | Dark header, indigo avatar, updated AgentStrip                                                      |

---

### Task 1: Replace font setup

**Files:**

- Modify: `packages/ui/src/lib/fonts.ts`

- [ ] **Step 1: Replace `fonts.ts` with Inter Variable + IBM Plex Mono**

  Replace the entire file content:

  ```ts
  import { Inter, IBM_Plex_Mono } from 'next/font/google'

  export const inter = Inter({
    subsets: ['latin'],
    axes: ['wght'],
    variable: '--font-inter',
    display: 'swap',
  })

  export const ibmPlexMono = IBM_Plex_Mono({
    subsets: ['latin'],
    weight: ['400', '500'],
    variable: '--font-ibm-plex-mono',
    display: 'swap',
  })

  export const fontVariables = `${inter.variable} ${ibmPlexMono.variable}`
  ```

  > `axes: ['wght']` enables the full weight axis on Inter Variable, including weight 510.
  > `fontVariables` export signature is unchanged — all 13 app `layout.tsx` files consume it as-is.

- [ ] **Step 2: Run typecheck**

  ```bash
  cd packages/ui && bun run typecheck
  ```

  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add packages/ui/src/lib/fonts.ts
  git commit -m "feat(ui): replace Geist with Inter Variable + IBM Plex Mono"
  ```

---

### Task 2: Update globals.css — font variables, `font-feature-settings`, `@theme` font weights

**Files:**

- Modify: `packages/ui/src/styles/globals.css`

- [ ] **Step 1: Update `--font-family-body` and `--font-family-mono` vars, add `@theme` block, and add `font-feature-settings` to `body`**

  In `globals.css`, find and replace the font-family variables (currently inside `:root`, near the bottom):

  ```css
  /* before */
  --font-family-body: var(--font-geist, 'Geist'), -apple-system, system-ui, sans-serif;
  --font-family-mono: var(--font-geist-mono, 'Geist Mono'), 'Fira Code', monospace;
  ```

  Replace with:

  ```css
  --font-family-body: var(--font-inter, 'Inter'), -apple-system, system-ui, sans-serif;
  --font-family-mono:
    var(--font-ibm-plex-mono, 'IBM Plex Mono'), ui-monospace, 'SF Mono', Menlo, monospace;
  ```

  Find the `body` rule in `@layer base` (currently `@apply bg-background text-foreground;` + `font-family: var(--font-family-body)`):

  ```css
  /* before */
  body {
    @apply bg-background text-foreground;
    font-family: var(--font-family-body);
  }
  ```

  Replace with:

  ```css
  body {
    @apply bg-background text-foreground;
    font-family: var(--font-family-body);
    font-feature-settings: 'cv01', 'ss03';
  }
  ```

  Add a new `@theme` block at the top of the file (before `@layer base`), right after `@import 'tailwindcss';`:

  ```css
  @theme {
    --font-weight-medium-plus: 510;
    --font-weight-semibold-minus: 590;
  }
  ```

  > This registers `font-medium-plus` and `font-semibold-minus` as Tailwind utility classes usable throughout the codebase.

- [ ] **Step 2: Run typecheck**

  ```bash
  cd packages/ui && bun run typecheck
  ```

  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add packages/ui/src/styles/globals.css
  git commit -m "feat(ui): Inter Variable fonts, font-feature-settings cv01+ss03, custom weights 510/590"
  ```

---

### Task 3: Update globals.css — color tokens

**Files:**

- Modify: `packages/ui/src/styles/globals.css`

- [ ] **Step 1: Replace the entire `:root` block**

  Find the entire `:root { ... }` block (lines 4–64 in current file) and replace it with:

  ```css
  :root {
    /* Core surface */
    --background: #f7f8f8;
    --foreground: #0f1011;
    --card: #ffffff;
    --card-foreground: #0f1011;
    --popover: #ffffff;
    --popover-foreground: #0f1011;

    /* Brand */
    --primary: #5e6ad2;
    --primary-foreground: #ffffff;

    /* Secondary / subtle */
    --secondary: #f3f4f5;
    --secondary-foreground: #0f1011;

    /* Muted */
    --muted: #f5f6f7;
    --muted-foreground: #62666d;

    /* Accent */
    --accent: #5e6ad2;
    --accent-foreground: #ffffff;

    /* Destructive */
    --destructive: #ef4444;
    --destructive-foreground: #ffffff;

    /* Borders / inputs */
    --border: #d0d6e0;
    --input: #d0d6e0;
    --ring: #5e6ad2;

    /* Radius */
    --radius: 6px;

    /* Sidebar */
    --sidebar-background: #f3f4f5;
    --sidebar-foreground: #0f1011;
    --sidebar-primary: #5e6ad2;
    --sidebar-primary-foreground: #ffffff;
    --sidebar-accent: rgba(94, 106, 210, 0.1);
    --sidebar-accent-foreground: #5e6ad2;
    --sidebar-border: #d0d6e0;
    --sidebar-ring: #5e6ad2;

    /* Button surface vars (light mode) */
    --btn-ghost-bg: rgba(0, 0, 0, 0.04);
    --btn-ghost-bg-hover: rgba(0, 0, 0, 0.07);
    --btn-ghost-border: #d0d6e0;
    --btn-subtle-bg: rgba(0, 0, 0, 0.04);
    --btn-subtle-bg-hover: rgba(0, 0, 0, 0.07);

    /* Status (light) */
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
    --color-text-info: #5e6ad2;

    /* Motion */
    --motion-fast: 100ms;
    --motion-normal: 150ms;
    --motion-slow: 250ms;

    /* Font (vars set by next/font on html) */
    --font-family-body: var(--font-inter, 'Inter'), -apple-system, system-ui, sans-serif;
    --font-family-mono:
      var(--font-ibm-plex-mono, 'IBM Plex Mono'), ui-monospace, 'SF Mono', Menlo, monospace;
  }
  ```

- [ ] **Step 2: Replace the entire `.dark` block**

  Find the entire `.dark { ... }` block (lines 66–101 in current file) and replace it with:

  ```css
  .dark {
    /* Core surface */
    --background: #08090a;
    --foreground: #f7f8f8;
    --card: rgba(255, 255, 255, 0.02);
    --card-foreground: #f7f8f8;
    --popover: #191a1b;
    --popover-foreground: #f7f8f8;

    /* Brand */
    --primary: #5e6ad2;
    --primary-foreground: #ffffff;

    /* Secondary / subtle */
    --secondary: rgba(255, 255, 255, 0.04);
    --secondary-foreground: #d0d6e0;

    /* Muted */
    --muted: #191a1b;
    --muted-foreground: #8a8f98;

    /* Accent */
    --accent: #7170ff;
    --accent-foreground: #ffffff;

    /* Destructive */
    --destructive: #ef4444;
    --destructive-foreground: #ffffff;

    /* Borders / inputs */
    --border: rgba(255, 255, 255, 0.08);
    --input: rgba(255, 255, 255, 0.08);
    --ring: #7170ff;

    /* Sidebar */
    --sidebar-background: #0f1011;
    --sidebar-foreground: #d0d6e0;
    --sidebar-primary: #5e6ad2;
    --sidebar-primary-foreground: #ffffff;
    --sidebar-accent: rgba(113, 112, 255, 0.1);
    --sidebar-accent-foreground: #7170ff;
    --sidebar-border: rgba(255, 255, 255, 0.05);
    --sidebar-ring: #7170ff;

    /* Button surface vars (dark mode) */
    --btn-ghost-bg: rgba(255, 255, 255, 0.02);
    --btn-ghost-bg-hover: rgba(255, 255, 255, 0.05);
    --btn-ghost-border: rgba(255, 255, 255, 0.08);
    --btn-subtle-bg: rgba(255, 255, 255, 0.04);
    --btn-subtle-bg-hover: rgba(255, 255, 255, 0.07);

    /* Status (dark) */
    --color-bg-success: rgba(22, 163, 74, 0.1);
    --color-text-success: #4ade80;
    --color-border-success: rgba(22, 163, 74, 0.2);
    --color-bg-warning: rgba(217, 119, 6, 0.1);
    --color-text-warning: #fcd34d;
    --color-border-warning: rgba(217, 119, 6, 0.2);
    --color-bg-danger: rgba(220, 38, 38, 0.1);
    --color-text-danger: #fca5a5;
    --color-border-danger: rgba(220, 38, 38, 0.2);
    --color-bg-info: rgba(94, 106, 210, 0.1);
    --color-text-info: #7170ff;

    /* Dark sidebar bg (legacy alias kept) */
    --color-sidebar-bg: #0f1011;
  }
  ```

- [ ] **Step 3: Run typecheck**

  ```bash
  cd packages/ui && bun run typecheck
  ```

  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add packages/ui/src/styles/globals.css
  git commit -m "feat(ui): replace color tokens — dark indigo-violet palette + light neutrals"
  ```

---

### Task 4: Update globals.css — typography utility classes

**Files:**

- Modify: `packages/ui/src/styles/globals.css`

- [ ] **Step 1: Append typography utilities after the `@layer base` density block**

  Find the end of the file (after the `@media (prefers-reduced-motion: reduce)` block) and append:

  ```css
  /* ─── Typography Scale ───────────────────────────────────────────────────── */

  @layer utilities {
    .text-display-xl {
      font-size: 72px;
      font-weight: 510;
      line-height: 1;
      letter-spacing: -1.584px;
    }
    .text-display-lg {
      font-size: 64px;
      font-weight: 510;
      line-height: 1;
      letter-spacing: -1.408px;
    }
    .text-display {
      font-size: 48px;
      font-weight: 510;
      line-height: 1;
      letter-spacing: -1.056px;
    }
    .text-h1 {
      font-size: 32px;
      font-weight: 400;
      line-height: 1.13;
      letter-spacing: -0.704px;
    }
    .text-h2 {
      font-size: 24px;
      font-weight: 400;
      line-height: 1.33;
      letter-spacing: -0.288px;
    }
    .text-h3 {
      font-size: 20px;
      font-weight: 590;
      line-height: 1.33;
      letter-spacing: -0.24px;
    }
    .text-body-lg {
      font-size: 18px;
      font-weight: 400;
      line-height: 1.6;
      letter-spacing: -0.165px;
    }
    .text-body {
      font-size: 16px;
      font-weight: 400;
      line-height: 1.5;
      letter-spacing: normal;
    }
    .text-body-medium {
      font-size: 16px;
      font-weight: 510;
      line-height: 1.5;
      letter-spacing: normal;
    }
    .text-small {
      font-size: 15px;
      font-weight: 400;
      line-height: 1.6;
      letter-spacing: -0.165px;
    }
    .text-small-medium {
      font-size: 15px;
      font-weight: 510;
      line-height: 1.6;
      letter-spacing: -0.165px;
    }
    .text-caption-lg {
      font-size: 14px;
      font-weight: 510;
      line-height: 1.5;
      letter-spacing: -0.182px;
    }
    .text-caption {
      font-size: 13px;
      font-weight: 400;
      line-height: 1.5;
      letter-spacing: -0.13px;
    }
    .text-label {
      font-size: 12px;
      font-weight: 510;
      line-height: 1.4;
      letter-spacing: normal;
    }
    .text-micro {
      font-size: 11px;
      font-weight: 510;
      line-height: 1.4;
      letter-spacing: normal;
    }
    .text-mono {
      font-family: var(--font-family-mono);
      font-size: 14px;
      font-weight: 400;
      line-height: 1.5;
    }
    .text-mono-caption {
      font-family: var(--font-family-mono);
      font-size: 13px;
      font-weight: 400;
      line-height: 1.5;
    }
    .text-mono-label {
      font-family: var(--font-family-mono);
      font-size: 12px;
      font-weight: 400;
      line-height: 1.4;
    }
  }
  ```

- [ ] **Step 2: Run typecheck**

  ```bash
  cd packages/ui && bun run typecheck
  ```

  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add packages/ui/src/styles/globals.css
  git commit -m "feat(ui): add typography utility classes — display through mono-label"
  ```

---

### Task 5: Refactor `button.tsx` (TDD)

**Files:**

- Create: `packages/ui/src/components/ui/button.spec.tsx`
- Modify: `packages/ui/src/components/ui/button.tsx`

- [ ] **Step 1: Write the failing test**

  Create `packages/ui/src/components/ui/button.spec.tsx`:

  ```tsx
  import { describe, it, expect } from 'vitest'
  import { render, screen } from '@testing-library/react'
  import { Button } from './button'

  describe('Button', () => {
    it('renders default variant without error', () => {
      render(<Button>Click me</Button>)
      expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument()
    })

    it('renders primary variant without error', () => {
      render(<Button variant="primary">Primary</Button>)
      expect(screen.getByRole('button', { name: 'Primary' })).toBeInTheDocument()
    })

    it('renders secondary variant without error', () => {
      render(<Button variant="secondary">Secondary</Button>)
      expect(screen.getByRole('button', { name: 'Secondary' })).toBeInTheDocument()
    })

    it('renders ghost variant without error', () => {
      render(<Button variant="ghost">Ghost</Button>)
      expect(screen.getByRole('button', { name: 'Ghost' })).toBeInTheDocument()
    })

    it('renders outline variant without error', () => {
      render(<Button variant="outline">Outline</Button>)
      expect(screen.getByRole('button', { name: 'Outline' })).toBeInTheDocument()
    })

    it('renders destructive variant without error', () => {
      render(<Button variant="destructive">Delete</Button>)
      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    })

    it('renders icon variant without error', () => {
      render(
        <Button variant="icon" aria-label="icon action">
          +
        </Button>,
      )
      expect(screen.getByRole('button', { name: 'icon action' })).toBeInTheDocument()
    })

    it('renders link variant without error', () => {
      render(<Button variant="link">Link</Button>)
      expect(screen.getByRole('button', { name: 'Link' })).toBeInTheDocument()
    })

    it('passes data-slot="button" attribute', () => {
      render(<Button>Test</Button>)
      expect(screen.getByRole('button')).toHaveAttribute('data-slot', 'button')
    })

    it('is disabled when disabled prop is passed', () => {
      render(<Button disabled>Disabled</Button>)
      expect(screen.getByRole('button')).toBeDisabled()
    })
  })
  ```

- [ ] **Step 2: Run typecheck — expect TypeScript error on `variant="primary"` and `variant="icon"`**

  ```bash
  cd packages/ui && bun run typecheck
  ```

  Expected: TypeScript errors — `"primary"` and `"icon"` are not assignable to the current variant union. Verify the errors reference `button.spec.tsx`.

- [ ] **Step 3: Update `button.tsx` — rebuild CVA variants**

  Replace the entire `button.tsx` content:

  ```tsx
  import * as React from 'react'
  import { cva, type VariantProps } from 'class-variance-authority'
  import { Slot } from 'radix-ui'

  import { cn } from '../../lib/utils'

  const buttonVariants = cva(
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-xs whitespace-nowrap transition-all duration-100 outline-none disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    {
      variants: {
        variant: {
          // Ghost button — default interactive element
          default:
            'border border-(--btn-ghost-border) bg-(--btn-ghost-bg) text-foreground font-[510] hover:bg-(--btn-ghost-bg-hover) focus-visible:ring-2 focus-visible:ring-ring/50',
          // Primary CTA — brand indigo, use sparingly
          primary:
            'bg-[#5e6ad2] text-white font-[510] hover:bg-[#828fff] focus-visible:ring-2 focus-visible:ring-[#5e6ad2]/50',
          // Subtle — toolbar actions, slightly visible bg
          secondary:
            'bg-(--btn-subtle-bg) text-foreground font-[510] hover:bg-(--btn-subtle-bg-hover) focus-visible:ring-2 focus-visible:ring-ring/50',
          // Outline — explicit border, transparent bg
          outline:
            'border border-border bg-transparent text-foreground font-[510] hover:bg-(--btn-ghost-bg) focus-visible:ring-2 focus-visible:ring-ring/50',
          // Ghost — no border, no bg
          ghost:
            'text-muted-foreground font-[510] hover:bg-(--btn-ghost-bg) hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50',
          // Destructive
          destructive:
            'bg-destructive text-white font-[510] hover:bg-destructive/90 focus-visible:ring-2 focus-visible:ring-destructive/50',
          // Icon — circular icon button
          icon: 'rounded-full border border-(--btn-ghost-border) bg-[rgba(255,255,255,0.03)] text-foreground hover:bg-(--btn-ghost-bg-hover) focus-visible:ring-2 focus-visible:ring-ring/50',
          // Link
          link: 'text-primary underline-offset-4 hover:underline',
        },
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
      },
      defaultVariants: {
        variant: 'default',
        size: 'default',
      },
    },
  )

  function Button({
    className,
    variant = 'default',
    size = 'default',
    asChild = false,
    ...props
  }: React.ComponentProps<'button'> &
    VariantProps<typeof buttonVariants> & {
      asChild?: boolean
    }) {
    const Comp = asChild ? Slot.Root : 'button'

    return (
      <Comp
        data-slot="button"
        data-variant={variant}
        data-size={size}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    )
  }

  export { Button, buttonVariants }
  ```

  > **Breaking change note:** The `default` variant is now a ghost button (`rgba` bg + border) instead of the solid primary button. Any `<Button>` calls that expected brand-indigo color must be updated to `<Button variant="primary">`. Search the codebase: `grep -r 'variant.*default\|<Button>' apps/ --include="*.tsx"` and update as needed.

- [ ] **Step 4: Run typecheck**

  ```bash
  cd packages/ui && bun run typecheck
  ```

  Expected: no errors.

- [ ] **Step 5: Run tests**

  ```bash
  cd packages/ui && bun run test:unit -- button.spec
  ```

  Expected: all 10 tests pass.

- [ ] **Step 6: Commit**

  ```bash
  git add packages/ui/src/components/ui/button.tsx packages/ui/src/components/ui/button.spec.tsx
  git commit -m "feat(ui): rebuild button CVA variants — ghost default, primary CTA, icon circle"
  ```

---

### Task 6: Refactor `badge.tsx` (TDD)

**Files:**

- Create: `packages/ui/src/components/ui/badge.spec.tsx`
- Modify: `packages/ui/src/components/ui/badge.tsx`

- [ ] **Step 1: Write the failing test**

  Create `packages/ui/src/components/ui/badge.spec.tsx`:

  ```tsx
  import { describe, it, expect } from 'vitest'
  import { render, screen } from '@testing-library/react'
  import { Badge } from './badge'

  describe('Badge', () => {
    it('renders neutral variant (default) without error', () => {
      render(<Badge>Label</Badge>)
      expect(screen.getByText('Label')).toBeInTheDocument()
    })

    it('renders success variant without error', () => {
      render(<Badge variant="success">Active</Badge>)
      expect(screen.getByText('Active')).toBeInTheDocument()
    })

    it('renders subtle variant without error', () => {
      render(<Badge variant="subtle">v1.2</Badge>)
      expect(screen.getByText('v1.2')).toBeInTheDocument()
    })

    it('renders destructive variant without error', () => {
      render(<Badge variant="destructive">Error</Badge>)
      expect(screen.getByText('Error')).toBeInTheDocument()
    })

    it('renders warning variant without error', () => {
      render(<Badge variant="warning">Warning</Badge>)
      expect(screen.getByText('Warning')).toBeInTheDocument()
    })

    it('renders info variant without error', () => {
      render(<Badge variant="info">Info</Badge>)
      expect(screen.getByText('Info')).toBeInTheDocument()
    })

    it('passes data-slot="badge" attribute', () => {
      const { container } = render(<Badge>Test</Badge>)
      expect(container.firstChild).toHaveAttribute('data-slot', 'badge')
    })
  })
  ```

- [ ] **Step 2: Run typecheck — expect TypeScript error on `variant="subtle"`**

  ```bash
  cd packages/ui && bun run typecheck
  ```

  Expected: TypeScript error — `"subtle"` is not assignable to the current variant union. Confirm it references `badge.spec.tsx`.

- [ ] **Step 3: Update `badge.tsx` — rebuild variants**

  Replace the entire `badge.tsx` content:

  ```tsx
  import * as React from 'react'
  import { cva, type VariantProps } from 'class-variance-authority'
  import { Slot } from 'radix-ui'

  import { cn } from '../../lib/utils'

  const badgeVariants = cva(
    'inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap transition-[color,box-shadow] duration-100 focus-visible:ring-2 focus-visible:ring-ring/50',
    {
      variants: {
        variant: {
          // Neutral pill — default tag/filter chip
          default:
            'rounded-full border border-[#23252a] bg-transparent px-[10px] py-0 text-[12px] font-[510] text-[#d0d6e0]',
          // Success — green status pill
          success:
            'rounded-full border-transparent bg-[#10b981] px-[10px] py-0 text-[10px] font-[510] text-[#f7f8f8]',
          // Subtle — inline label, version tag
          subtle:
            'rounded-[2px] border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.05)] px-2 py-0 text-[10px] font-[510] text-[#f7f8f8]',
          // Status variants (use CSS vars from globals.css)
          destructive:
            'rounded-full border border-transparent bg-(--color-bg-danger) px-[10px] py-0 text-[11px] font-medium text-(--color-text-danger)',
          warning:
            'rounded-full border border-transparent bg-(--color-bg-warning) px-[10px] py-0 text-[11px] font-medium text-(--color-text-warning)',
          info: 'rounded-full border border-transparent bg-(--color-bg-info) px-[10px] py-0 text-[11px] font-medium text-(--color-text-info)',
        },
      },
      defaultVariants: {
        variant: 'default',
      },
    },
  )

  function Badge({
    className,
    variant = 'default',
    asChild = false,
    ...props
  }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
    const Comp = asChild ? Slot.Root : 'span'

    return (
      <Comp
        data-slot="badge"
        data-variant={variant}
        className={cn(badgeVariants({ variant }), className)}
        {...props}
      />
    )
  }

  export { Badge, badgeVariants }
  ```

- [ ] **Step 4: Run typecheck**

  ```bash
  cd packages/ui && bun run typecheck
  ```

  Expected: no errors.

- [ ] **Step 5: Run tests**

  ```bash
  cd packages/ui && bun run test:unit -- badge.spec
  ```

  Expected: all 7 tests pass.

- [ ] **Step 6: Commit**

  ```bash
  git add packages/ui/src/components/ui/badge.tsx packages/ui/src/components/ui/badge.spec.tsx
  git commit -m "feat(ui): rebuild badge variants — neutral pill, success, subtle; keep status variants"
  ```

---

### Task 7: Update `card.tsx` (TDD)

**Files:**

- Create: `packages/ui/src/components/ui/card.spec.tsx`
- Modify: `packages/ui/src/components/ui/card.tsx`

- [ ] **Step 1: Write the test**

  Create `packages/ui/src/components/ui/card.spec.tsx`:

  ```tsx
  import { describe, it, expect } from 'vitest'
  import { render, screen } from '@testing-library/react'
  import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
    CardFooter,
    CardAction,
  } from './card'

  describe('Card', () => {
    it('renders Card with all sub-components without error', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle>Title</CardTitle>
            <CardDescription>Description</CardDescription>
            <CardAction>Action</CardAction>
          </CardHeader>
          <CardContent>Content</CardContent>
          <CardFooter>Footer</CardFooter>
        </Card>,
      )
      expect(screen.getByText('Title')).toBeInTheDocument()
      expect(screen.getByText('Content')).toBeInTheDocument()
      expect(screen.getByText('Footer')).toBeInTheDocument()
    })

    it('passes data-slot="card" on Card root', () => {
      const { container } = render(<Card>body</Card>)
      expect(container.firstChild).toHaveAttribute('data-slot', 'card')
    })

    it('does not render a shadow class', () => {
      const { container } = render(<Card>body</Card>)
      expect((container.firstChild as HTMLElement).className).not.toContain('shadow')
    })
  })
  ```

- [ ] **Step 2: Run the test — verify it passes (existing code renders correctly)**

  ```bash
  cd packages/ui && bun run test:unit -- card.spec
  ```

  Expected: 2 tests pass, 1 fails (`shadow` test — `shadow-sm` is currently present).

- [ ] **Step 3: Update `card.tsx` — remove `shadow-sm`, use `bg-card` (inherits translucent token in dark)**

  Replace the `Card` function only (leave all others unchanged):

  ```tsx
  function Card({ className, ...props }: React.ComponentProps<'div'>) {
    return (
      <div
        data-slot="card"
        className={cn(
          'flex flex-col gap-4 rounded-lg border bg-card py-5 text-card-foreground',
          className,
        )}
        {...props}
      />
    )
  }
  ```

  > Removed `shadow-sm`. `bg-card` resolves to `rgba(255,255,255,0.02)` in dark mode (via the updated `--card` token) and `#ffffff` in light mode. `border` resolves to `rgba(255,255,255,0.08)` in dark — no hardcoded value needed.

- [ ] **Step 4: Run tests**

  ```bash
  cd packages/ui && bun run test:unit -- card.spec
  ```

  Expected: all 3 tests pass.

- [ ] **Step 5: Run typecheck**

  ```bash
  cd packages/ui && bun run typecheck
  ```

  Expected: no errors.

- [ ] **Step 6: Commit**

  ```bash
  git add packages/ui/src/components/ui/card.tsx packages/ui/src/components/ui/card.spec.tsx
  git commit -m "feat(ui): card — remove shadow-sm, depth via translucent bg-card + border token"
  ```

---

### Task 8: Update `input.tsx` and `textarea.tsx` (TDD)

**Files:**

- Create: `packages/ui/src/components/ui/input.spec.tsx`
- Modify: `packages/ui/src/components/ui/input.tsx`
- Modify: `packages/ui/src/components/ui/textarea.tsx`

- [ ] **Step 1: Write the test**

  Create `packages/ui/src/components/ui/input.spec.tsx`:

  ```tsx
  import { describe, it, expect } from 'vitest'
  import { render, screen } from '@testing-library/react'
  import { Input } from './input'
  import { Textarea } from './textarea'

  describe('Input', () => {
    it('renders without error', () => {
      render(<Input placeholder="Enter value" />)
      expect(screen.getByPlaceholderText('Enter value')).toBeInTheDocument()
    })

    it('passes data-slot="input"', () => {
      render(<Input />)
      expect(document.querySelector('[data-slot="input"]')).toBeInTheDocument()
    })

    it('is disabled when disabled prop passed', () => {
      render(<Input disabled placeholder="disabled" />)
      expect(screen.getByPlaceholderText('disabled')).toBeDisabled()
    })
  })

  describe('Textarea', () => {
    it('renders without error', () => {
      render(<Textarea placeholder="Enter text" />)
      expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument()
    })

    it('passes data-slot="textarea"', () => {
      render(<Textarea />)
      expect(document.querySelector('[data-slot="textarea"]')).toBeInTheDocument()
    })

    it('is disabled when disabled prop passed', () => {
      render(<Textarea disabled placeholder="disabled" />)
      expect(screen.getByPlaceholderText('disabled')).toBeDisabled()
    })
  })
  ```

- [ ] **Step 2: Run the test to confirm it passes (no code change yet)**

  ```bash
  cd packages/ui && bun run test:unit -- input.spec
  ```

  Expected: all 6 tests pass. (These are smoke tests — we run them before changes to establish the baseline.)

- [ ] **Step 3: Update `input.tsx`**

  Replace the entire `input.tsx` content:

  ```tsx
  import * as React from 'react'

  import { cn } from '../../lib/utils'

  function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
    return (
      <input
        type={type}
        data-slot="input"
        className={cn(
          'h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3.5 py-3 text-sm text-foreground shadow-none transition-[color,box-shadow] outline-none',
          'placeholder:text-muted-foreground',
          'selection:bg-primary selection:text-primary-foreground',
          'file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
          'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
          'dark:bg-[rgba(255,255,255,0.02)]',
          'focus-visible:outline-none focus-visible:shadow-[0_0_0_1px_rgba(113,112,255,0.3),_0_0_0_3px_rgba(113,112,255,0.1)]',
          'aria-invalid:border-destructive aria-invalid:shadow-[0_0_0_1px_rgba(239,68,68,0.3),_0_0_0_3px_rgba(239,68,68,0.1)]',
          className,
        )}
        {...props}
      />
    )
  }

  export { Input }
  ```

- [ ] **Step 4: Update `textarea.tsx`**

  Replace the entire `textarea.tsx` content:

  ```tsx
  import * as React from 'react'

  import { cn } from '../../lib/utils'

  function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
    return (
      <textarea
        data-slot="textarea"
        className={cn(
          'flex field-sizing-content min-h-16 w-full rounded-md border border-input bg-transparent px-3.5 py-3 text-sm text-foreground shadow-none transition-[color,box-shadow] outline-none',
          'placeholder:text-muted-foreground',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'dark:bg-[rgba(255,255,255,0.02)]',
          'focus-visible:outline-none focus-visible:shadow-[0_0_0_1px_rgba(113,112,255,0.3),_0_0_0_3px_rgba(113,112,255,0.1)]',
          'aria-invalid:border-destructive aria-invalid:shadow-[0_0_0_1px_rgba(239,68,68,0.3),_0_0_0_3px_rgba(239,68,68,0.1)]',
          className,
        )}
        {...props}
      />
    )
  }

  export { Textarea }
  ```

- [ ] **Step 5: Run tests**

  ```bash
  cd packages/ui && bun run test:unit -- input.spec
  ```

  Expected: all 6 tests pass.

- [ ] **Step 6: Run typecheck**

  ```bash
  cd packages/ui && bun run typecheck
  ```

  Expected: no errors.

- [ ] **Step 7: Commit**

  ```bash
  git add packages/ui/src/components/ui/input.tsx packages/ui/src/components/ui/textarea.tsx packages/ui/src/components/ui/input.spec.tsx
  git commit -m "feat(ui): input + textarea — dark translucent bg, indigo multi-layer focus ring"
  ```

---

### Task 9: Update `global-nav.tsx`

**Files:**

- Modify: `packages/ui/src/components/global-nav.tsx`

- [ ] **Step 1: Update `AgentStrip` — replace blue-600 palette with indigo-violet**

  Find and replace the `AgentStrip` `<div>` className:

  ```tsx
  // before
  className={cn(
    'flex h-7 flex-shrink-0 items-center gap-4 px-4 text-[11px]',
    'bg-blue-600/5 border-b border-blue-600/20 text-blue-700',
    'dark:bg-blue-500/6 dark:border-blue-500/15 dark:text-blue-400',
  )}
  ```

  Replace with:

  ```tsx
  className={cn(
    'flex h-7 flex-shrink-0 items-center gap-4 px-4 text-[11px]',
    'bg-[rgba(94,106,210,0.05)] border-b border-[rgba(94,106,210,0.2)] text-[#5e6ad2]',
    'dark:bg-[rgba(113,112,255,0.06)] dark:border-[rgba(113,112,255,0.15)] dark:text-[#7170ff]',
  )}
  ```

  Find and replace the two `<span className="text-slate-400">` separators inside `AgentStrip`:

  ```tsx
  // before
  <span className="text-slate-400" aria-hidden="true">
  ```

  Replace with:

  ```tsx
  <span className="text-muted-foreground" aria-hidden="true">
  ```

  Find and replace the audit log link in `AgentStrip`:

  ```tsx
  // before
  className = 'ml-auto text-[11px] text-blue-700 underline dark:text-blue-400'
  ```

  Replace with:

  ```tsx
  className = 'ml-auto text-[11px] text-[#5e6ad2] underline dark:text-[#7170ff]'
  ```

- [ ] **Step 2: Update topbar `<div>` background and border**

  Find the topbar `<div>` className in `GlobalNav`:

  ```tsx
  // before
  className={cn(
    'flex h-12 items-center gap-3 px-4',
    'bg-white border-b border-slate-200',
    'dark:bg-slate-900 dark:border-slate-800',
  )}
  ```

  Replace with:

  ```tsx
  className={cn(
    'flex h-12 items-center gap-3 px-4',
    'bg-card border-b border-border',
    'dark:bg-[#0f1011] dark:border-[rgba(255,255,255,0.05)]',
  )}
  ```

- [ ] **Step 3: Update the Search button**

  Find the Search `<button>` className:

  ```tsx
  // before
  className={cn(
    'ml-auto flex max-w-[260px] flex-1 items-center gap-2 rounded-md border px-3 py-1.5',
    'border-slate-200 bg-slate-100 text-xs text-slate-500',
    'transition-all hover:border-blue-400 hover:bg-blue-50',
    'dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400',
    'dark:hover:border-blue-700 dark:hover:bg-blue-950',
    'focus:outline-none focus:ring-2 focus:ring-blue-500',
  )}
  ```

  Replace with:

  ```tsx
  className={cn(
    'ml-auto flex max-w-[260px] flex-1 items-center gap-2 rounded-md border px-3 py-1.5',
    'border-border bg-(--btn-ghost-bg) text-xs text-muted-foreground',
    'transition-all hover:bg-(--btn-ghost-bg-hover) hover:border-[#5e6ad2]',
    'focus:outline-none focus:ring-2 focus:ring-ring/50',
  )}
  ```

- [ ] **Step 4: Update the Agent toggle and Notifications icon buttons**

  Find the Agent toggle `<button>` className:

  ```tsx
  // before
  className={cn(
    'flex h-7.5 w-7.5 items-center justify-center rounded-md',
    'text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-800',
    'dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200',
    'focus:outline-none focus:ring-2 focus:ring-blue-500',
  )}
  ```

  Replace with (apply to both Agent toggle AND Notifications buttons):

  ```tsx
  className={cn(
    'flex h-7.5 w-7.5 items-center justify-center rounded-md',
    'text-muted-foreground transition-all hover:bg-(--btn-ghost-bg) hover:text-foreground',
    'focus:outline-none focus:ring-2 focus:ring-ring/50',
  )}
  ```

- [ ] **Step 5: Update the Avatar button**

  Find the Avatar `<button>` className:

  ```tsx
  // before
  className={cn(
    'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full',
    'bg-[#1D4ED8] text-[11px] font-semibold text-white',
    'transition-all hover:bg-[#2563EB]',
    'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1',
  )}
  ```

  Replace with:

  ```tsx
  className={cn(
    'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full',
    'bg-[#5e6ad2] text-[11px] font-[510] text-white',
    'transition-all hover:bg-[#828fff]',
    'focus:outline-none focus:ring-2 focus:ring-[#5e6ad2]/50',
  )}
  ```

- [ ] **Step 6: Run typecheck**

  ```bash
  cd packages/ui && bun run typecheck
  ```

  Expected: no errors.

- [ ] **Step 7: Run all tests**

  ```bash
  cd packages/ui && bun run test:unit
  ```

  Expected: all tests pass (data-table spec included).

- [ ] **Step 8: Commit**

  ```bash
  git add packages/ui/src/components/global-nav.tsx
  git commit -m "feat(ui): global-nav — dark header, indigo avatar, indigo agent strip"
  ```

---

### Task 10: Final integration check

**Files:** none (read-only verification)

- [ ] **Step 1: Run full typecheck across all packages**

  ```bash
  bun run typecheck --filter "@future/*"
  ```

  Expected: no errors.

- [ ] **Step 2: Run all ui unit tests**

  ```bash
  cd packages/ui && bun run test:unit
  ```

  Expected: all tests pass.

- [ ] **Step 3: Check for `default` button variant usages that now render as ghost (may need `variant="primary"`)**

  ```bash
  grep -r '<Button' apps/ --include="*.tsx" -l
  ```

  Open each file and check: any `<Button>` without a `variant` prop (or with `variant="default"`) that is a primary CTA should be updated to `<Button variant="primary">`.

- [ ] **Step 4: Commit summary if any callers updated**

  ```bash
  git add apps/
  git commit -m "feat(ui): update button callers — primary CTAs use variant='primary'"
  ```

  > Skip this step if no callers needed updating.
