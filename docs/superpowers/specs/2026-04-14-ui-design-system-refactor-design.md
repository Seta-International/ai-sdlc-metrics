# UI Design System Refactor — Design Spec

**Date:** 2026-04-14  
**Scope:** `packages/ui` — complete refactor of design tokens, typography, and component styling to match DESIGN.md  
**Out of scope (Phase 2):** `data-table/` system (11 files)

---

## Problem

The current `packages/ui` implementation diverges significantly from `DESIGN.md`:

| Dimension          | DESIGN.md specifies                                  | Currently implemented      |
| ------------------ | ---------------------------------------------------- | -------------------------- |
| Font               | Inter Variable + Berkeley Mono, `"cv01","ss03"`      | Geist + Geist Mono         |
| Weight             | 510 as signature                                     | Standard 400/500/600/700   |
| Backgrounds        | `#08090a`, `#0f1011`, `#191a1b` (near-black)         | `#0a0f1e` (dark navy-blue) |
| Accent color       | `#5e6ad2` / `#7170ff` indigo-violet                  | `#3b82f6` blue             |
| Borders            | `rgba(255,255,255,0.05–0.08)` semi-transparent white | Solid dark borders         |
| Button backgrounds | `rgba(255,255,255,0.02–0.05)` translucent            | Opaque backgrounds         |
| Letter-spacing     | Aggressive negative at display sizes                 | Not implemented            |

---

## Approach: Token-first, components inherit

1. Update `globals.css` and `fonts.ts` (tokens, fonts, utilities) — ~70% of components update automatically via CSS variable inheritance
2. Make targeted edits to the small set of components with hardcoded Tailwind values (button, badge, card, input, textarea, global-nav)
3. All 13 web apps inherit changes via their existing import of `@future/ui`

---

## Section 1: Fonts & Typography

### Font Replacement

| Role | Old                       | New                           |
| ---- | ------------------------- | ----------------------------- |
| Body | Geist (Google Fonts)      | Inter Variable (Google Fonts) |
| Mono | Geist Mono (Google Fonts) | IBM Plex Mono (Google Fonts)  |

**File:** `packages/ui/src/lib/fonts.ts`

- Replace `Geist` and `Geist_Mono` imports with `Inter` (variable, subsets: `latin`, axes: `wght`) and `IBM_Plex_Mono` (weights: 400, 500)
- Export `fontVariables` string as before — all 13 app layouts consume it unchanged

**File:** `packages/ui/src/styles/globals.css`  
Add to `body`:

```css
font-feature-settings: 'cv01', 'ss03';
```

### Typography Utility Classes

Define in `globals.css` as reusable classes:

| Class                | Size                 | Weight | Line Height | Letter Spacing |
| -------------------- | -------------------- | ------ | ----------- | -------------- |
| `.text-display-xl`   | 72px                 | 510    | 1.00        | -1.584px       |
| `.text-display-lg`   | 64px                 | 510    | 1.00        | -1.408px       |
| `.text-display`      | 48px                 | 510    | 1.00        | -1.056px       |
| `.text-h1`           | 32px                 | 400    | 1.13        | -0.704px       |
| `.text-h2`           | 24px                 | 400    | 1.33        | -0.288px       |
| `.text-h3`           | 20px                 | 590    | 1.33        | -0.24px        |
| `.text-body-lg`      | 18px                 | 400    | 1.60        | -0.165px       |
| `.text-body`         | 16px                 | 400    | 1.50        | normal         |
| `.text-body-medium`  | 16px                 | 510    | 1.50        | normal         |
| `.text-small`        | 15px                 | 400    | 1.60        | -0.165px       |
| `.text-small-medium` | 15px                 | 510    | 1.60        | -0.165px       |
| `.text-caption-lg`   | 14px                 | 510    | 1.50        | -0.182px       |
| `.text-caption`      | 13px                 | 400    | 1.50        | -0.13px        |
| `.text-label`        | 12px                 | 510    | 1.40        | normal         |
| `.text-micro`        | 11px                 | 510    | 1.40        | normal         |
| `.text-mono`         | 14px (IBM Plex Mono) | 400    | 1.50        | normal         |
| `.text-mono-caption` | 13px (IBM Plex Mono) | 400    | 1.50        | normal         |
| `.text-mono-label`   | 12px (IBM Plex Mono) | 400    | 1.40        | normal         |

---

## Section 2: Color Tokens

CSS variable names are **unchanged** (no breakage in 13 web apps). Values are replaced.

### Dark Mode (`.dark` class)

| Variable                   | Value                    | Role                              |
| -------------------------- | ------------------------ | --------------------------------- |
| `--background`             | `#08090a`                | Page canvas (marketing black)     |
| `--foreground`             | `#f7f8f8`                | Primary text                      |
| `--card`                   | `rgba(255,255,255,0.02)` | Card surface (translucent)        |
| `--card-foreground`        | `#f7f8f8`                | Card text                         |
| `--popover`                | `#191a1b`                | Elevated surfaces (Level 3)       |
| `--popover-foreground`     | `#f7f8f8`                | Popover text                      |
| `--primary`                | `#5e6ad2`                | Brand indigo (CTA backgrounds)    |
| `--primary-foreground`     | `#ffffff`                | Text on primary                   |
| `--secondary`              | `rgba(255,255,255,0.04)` | Subtle button background          |
| `--secondary-foreground`   | `#d0d6e0`                | Secondary text (silver-gray)      |
| `--muted`                  | `#191a1b`                | Muted surface                     |
| `--muted-foreground`       | `#8a8f98`                | Tertiary text                     |
| `--accent`                 | `#7170ff`                | Interactive accent (hover/active) |
| `--accent-foreground`      | `#ffffff`                | Text on accent                    |
| `--destructive`            | `#ef4444`                | Error/danger                      |
| `--destructive-foreground` | `#ffffff`                | Text on destructive               |
| `--border`                 | `rgba(255,255,255,0.08)` | Standard semi-transparent border  |
| `--input`                  | `rgba(255,255,255,0.08)` | Input border                      |
| `--ring`                   | `#7170ff`                | Focus ring                        |
| `--sidebar-background`     | `#0f1011`                | Panel/sidebar background          |
| `--sidebar-foreground`     | `#d0d6e0`                | Sidebar text                      |
| `--sidebar-primary`        | `#5e6ad2`                | Sidebar accent                    |
| `--sidebar-border`         | `rgba(255,255,255,0.05)` | Sidebar dividers                  |

### Light Mode (`:root`)

| Variable                   | Value     | Role                        |
| -------------------------- | --------- | --------------------------- |
| `--background`             | `#f7f8f8` | Page background             |
| `--foreground`             | `#0f1011` | Primary text                |
| `--card`                   | `#ffffff` | Card surface                |
| `--card-foreground`        | `#0f1011` | Card text                   |
| `--popover`                | `#ffffff` | Popover background          |
| `--popover-foreground`     | `#0f1011` | Popover text                |
| `--primary`                | `#5e6ad2` | Brand indigo (same as dark) |
| `--primary-foreground`     | `#ffffff` | Text on primary             |
| `--secondary`              | `#f3f4f5` | Subtle surface              |
| `--secondary-foreground`   | `#0f1011` | Secondary text              |
| `--muted`                  | `#f5f6f7` | Muted surface               |
| `--muted-foreground`       | `#62666d` | Quaternary text             |
| `--accent`                 | `#5e6ad2` | Accent                      |
| `--accent-foreground`      | `#ffffff` | Text on accent              |
| `--destructive`            | `#ef4444` | Error/danger                |
| `--destructive-foreground` | `#ffffff` | Text on destructive         |
| `--border`                 | `#d0d6e0` | Visible border              |
| `--input`                  | `#d0d6e0` | Input border                |
| `--ring`                   | `#5e6ad2` | Focus ring                  |
| `--sidebar-background`     | `#f3f4f5` | Panel/sidebar background    |
| `--sidebar-foreground`     | `#0f1011` | Sidebar text                |
| `--sidebar-primary`        | `#5e6ad2` | Sidebar accent              |
| `--sidebar-border`         | `#d0d6e0` | Sidebar dividers            |

---

## Section 3: Component Updates

Components that rely on `bg-background`, `border`, `text-foreground`, `text-muted-foreground` etc. will automatically inherit the new look. The following need direct edits:

### `button.tsx`

CVA variants rebuilt per the agreed spec. All sizes use 6px radius (`rounded-md`).

| Variant              | Background               | Text      | Border                   | Hover                         |
| -------------------- | ------------------------ | --------- | ------------------------ | ----------------------------- |
| `default` (ghost)    | `rgba(255,255,255,0.02)` | `#e2e4e7` | `rgba(255,255,255,0.08)` | bg → `rgba(255,255,255,0.05)` |
| `primary`            | `#5e6ad2`                | `#ffffff` | none                     | bg → `#828fff`                |
| `secondary` (subtle) | `rgba(255,255,255,0.04)` | `#d0d6e0` | none                     | bg → `rgba(255,255,255,0.07)` |
| `ghost`              | transparent              | `#d0d6e0` | none                     | bg → `rgba(255,255,255,0.04)` |
| `destructive`        | `#ef4444`                | `#ffffff` | none                     | bg → `#dc2626`                |
| `icon`               | `rgba(255,255,255,0.03)` | `#f7f8f8` | `rgba(255,255,255,0.08)` | rounded-full                  |

Light mode: variants use their CSS variable counterparts — `bg-primary`, `bg-secondary`, etc. — which resolve to the light token values.

### `badge.tsx`

| Variant             | Background               | Text      | Border                   | Radius | Font       |
| ------------------- | ------------------------ | --------- | ------------------------ | ------ | ---------- |
| `neutral` (default) | transparent              | `#d0d6e0` | `#23252a`                | 9999px | 12px / 510 |
| `success`           | `#10b981`                | `#f7f8f8` | none                     | 9999px | 10px / 510 |
| `subtle`            | `rgba(255,255,255,0.05)` | `#f7f8f8` | `rgba(255,255,255,0.05)` | 2px    | 10px / 510 |

### `card.tsx`

- Background: `bg-[rgba(255,255,255,0.02)]` (dark) / `bg-card` (light — resolves to white)
- Border: `border border-[rgba(255,255,255,0.08)]`
- Radius: `rounded-lg` (8px standard), add `rounded-xl` variant (12px for featured cards)
- No solid dark background — always translucent in dark mode

### `input.tsx` / `textarea.tsx`

- Background: `bg-[rgba(255,255,255,0.02)]`
- Border: `border border-[rgba(255,255,255,0.08)]`
- Text: `text-[#d0d6e0]`
- Placeholder: `placeholder:text-[#8a8f98]`
- Padding: `px-3.5 py-3` (matches 14px/12px spec)
- Radius: `rounded-md` (6px)
- Focus ring: multi-layer shadow stack (`shadow-[0_0_0_1px_rgba(113,112,255,0.3),0_0_0_3px_rgba(113,112,255,0.1)]`)

### `global-nav.tsx`

- Background: `bg-[#0f1011]`
- Bottom border: `border-b border-[rgba(255,255,255,0.05)]`
- Link text: 13px weight 510 `text-[#d0d6e0]` → hover `text-[#f7f8f8]`
- CTA button: `primary` button variant (brand indigo)
- Search trigger: tertiary text `text-[#8a8f98]`

### Primitives inheriting via CSS variables (no direct edits needed)

Popover, dropdown-menu, context-menu, dialog, alert-dialog, tooltip, hover-card, command, select, accordion, tabs, collapsible, sheet, drawer, separator, scroll-area, skeleton, spinner, alert, progress, slider, switch, checkbox, radio-group, toggle, navigation-menu, breadcrumb, pagination, kbd, sonner — all consume `--background`, `--border`, `--foreground`, `--muted-foreground`, `--primary`, `--ring` and will inherit the new tokens automatically.

---

## Border Radius Reference

Border radius scale:

| Scale       | Value  | Use                            |
| ----------- | ------ | ------------------------------ |
| Micro       | 2px    | Inline badges, toolbar buttons |
| Standard    | 4px    | Small containers, list items   |
| Comfortable | 6px    | Buttons, inputs                |
| Card        | 8px    | Cards, dropdowns               |
| Panel       | 12px   | Featured cards, panels         |
| Large       | 22px   | Large panel elements           |
| Full Pill   | 9999px | Chips, filter pills            |
| Circle      | 50%    | Icon buttons, avatars          |

---

## Shadow / Elevation Reference

| Level    | CSS                                                                | Use                          |
| -------- | ------------------------------------------------------------------ | ---------------------------- |
| Subtle   | `0 1.2px 0 rgba(0,0,0,0.03)`                                       | Toolbar micro-elevation      |
| Surface  | `rgba(255,255,255,0.05)` bg + `rgba(255,255,255,0.08)` border      | Cards, inputs                |
| Elevated | `0 2px 4px rgba(0,0,0,0.4)`                                        | Dropdowns, floating elements |
| Dialog   | Multi-layer stack                                                  | Modals, command palette      |
| Focus    | `0 0 0 1px rgba(113,112,255,0.3), 0 0 0 3px rgba(113,112,255,0.1)` | Keyboard focus               |

---

## Constraints

- No `.js` extensions in relative imports
- No manual `package.json` edits — use `bun add` for new font packages
- Both light and dark modes must be preserved
- `data-table/` system is **Phase 2** — excluded from this refactor
- CSS variable names unchanged — 13 web apps require no layout changes

---

## Success Criteria

- `packages/ui/src/styles/globals.css` tokens match the agreed color palette exactly
- `packages/ui/src/lib/fonts.ts` uses Inter Variable + IBM Plex Mono from Google Fonts
- `font-feature-settings: "cv01", "ss03"` applied globally on `body`
- Typography utility classes defined and usable from any web app
- `button.tsx`, `badge.tsx`, `card.tsx`, `input.tsx`, `textarea.tsx`, `global-nav.tsx` match the agreed component specs
- All other components inherit correct appearance via CSS variable updates
- Light mode renders correctly (same brand indigo accent, sensible light neutrals)
- `data-table/` untouched
