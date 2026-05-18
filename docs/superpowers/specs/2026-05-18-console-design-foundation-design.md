# Console design-system foundation

**Status:** Design approved, ready for implementation plan
**Date:** 2026-05-18
**Scope:** `platform/ui` shared primitives + tokens + CI guard. Per-page console application is **out of scope** for this spec and tracked in follow-up PRs (one per console page).

## Problem

The admin console (`apps/console`) does not follow `DESIGN.md`. Every page hand-rolls page headers, hardcodes pixel sizes (`text-[12px]`, `text-[13px]`, `text-2xl`), and re-rolls form layouts with ad-hoc spacing. The root cause is that the typography scale defined in `DESIGN.md §500-525` is **not wired into `platform/ui/tokens/tailwind-preset.ts`**, so no `text-body-md` / `text-caption` / `text-eyebrow` utilities exist for consumers to use. Existing shared primitives (`DataTable`, `StatusBadge`, `EmptyState`, `Select`, `Label`) also hardcode the same pixel sizes internally.

Result: every screen drifts independently, `tnum` is missing on all numeric cells, and there is nothing in CI to catch new hardcodes.

## Goal

Land **one foundation PR** that makes following `DESIGN.md` the path of least resistance and makes deviation a build error. After this PR merges, per-page work is mechanical token substitution.

## Non-goals

- Per-page application across the console (separate PRs after this one).
- Revising `DESIGN.md` itself — the spec is the source of truth; we are implementing it.
- New visual designs, new components beyond what's listed below.
- Touching `apps/studio` / `apps/agent-portal` — same primitives will benefit them but their migration is independent.

## Architecture

Six pieces land in one PR against `platform/ui`, plus a CI guard at the repo root.

### 1. Typography tokens

**File:** `platform/ui/src/tokens/tailwind-preset.ts`

**Approach:** Replace (not extend) Tailwind's `fontSize` map. Each entry packs `[size, { lineHeight, letterSpacing, fontWeight, fontFeatureSettings }]` into one utility class. A single class like `text-body-md` applies all four properties.

**Tailwind v4 note:** The repo is on Tailwind v4 (`apps/console` pins `4.3.0`) but uses v3-style config via `@config '../tailwind.config.ts'` in `styles.css`. The existing `setaPreset` works as-is in this hybrid mode. Implementation should verify that the `fontSize` tuple supports `fontFeatureSettings` under v4's v3-compat path; if not, fall back to v4-native `@theme` directives in `tokens.css` using `--text-<name>: 14px;`, `--text-<name>--font-weight: 400;` etc. The choice is mechanical and does not change the API consumers see (`text-body-md` either way).

**Token map** (verbatim from `DESIGN.md §500-525`):

| Utility | Size | Weight | Tracking | Font features |
|---|---|---|---|---|
| `text-display-lg` | 32px | 600 | -0.8px | — |
| `text-display-md` | 26px | 600 | -0.5px | — |
| `text-heading-lg` | 22px | 500 | -0.4px | — |
| `text-heading-md` | 18px | 500 | -0.2px | — |
| `text-heading-sm` | 15px | 500 | -0.1px | — |
| `text-body-lg` | 16px | 400 | -0.05px | — |
| `text-body-md` | 14px | 400 | 0 | — |
| `text-body-tabular` | 14px | 400 | -0.3px | `"tnum"` |
| `text-button-md` | 14px | 500 | 0 | — |
| `text-button-sm` | 13px | 500 | 0 | — |
| `text-caption` | 12px | 400 | 0 | `"tnum"` |
| `text-eyebrow` | 11px | 500 | +0.4px | — |

For monospace contexts (code, tool-call JSON per `DESIGN.md §520`) use the existing `font-mono` family utility paired with `text-button-sm` (13px / 500). No dedicated `text-mono` token — DESIGN.md's "mono" entry is a family + size pairing, not a separate scale step.

`tnum` is baked into `body-tabular` and `caption` via `fontFeatureSettings`, so consumers do not have to remember to add it.

**Body baseline:** `tokens.css` already applies `font-feature-settings: 'ss01'` on `html, body` (lines 57-60). No change needed.

**Existing `.tnum` class:** `tokens.css` already exports a `.tnum` utility (line 62). Keep it — used today by `DateRangePicker`, `NotificationBell`, `SidebarNavItem`, `TokenUsageBar` for non-typography contexts (badges, small inline counts) where wrapping with `body-tabular` would change the font size. The new `text-body-tabular` / `text-caption` tokens bake `tnum` in for the normal table-cell case; `.tnum` stays for the badge/inline case.

**Trade-off accepted:** Bundling weight into `text-*` is non-standard Tailwind (weight is typically a separate `font-*` utility). We accept this because it enforces the design system tuple and prevents partial application. `font-medium` / `font-semibold` defaults remain available for ad-hoc emphasis inside a body-md run.

### 2. `PageHeader` primitive

**File:** `platform/ui/src/components/layout/PageHeader.tsx` (new directory `layout/`).

**API (props-based):**

```tsx
interface PageHeaderProps {
  title: string
  description?: ReactNode
  actions?: ReactNode
}
```

**Render:**

```tsx
<header className="flex items-start justify-between gap-md pb-lg">
  <div className="flex flex-col gap-xs">
    <h1 className="text-display-lg text-ink">{title}</h1>
    {description && <p className="text-body-md text-ink-mute">{description}</p>}
  </div>
  {actions && <div className="flex items-center gap-sm shrink-0">{actions}</div>}
</header>
```

**Constraints:**
- All spacing comes from the existing spacing token scale (`gap-md`, `pb-lg`, etc.); no hardcoded values.
- Does **not** render a breadcrumb. `DESIGN.md §579` puts the breadcrumb in the TopBar, which `AppShell` already owns.
- Does **not** wrap page body content. PageHeader is rendered first inside the page; body follows as a sibling.
- Does **not** add its own outer padding. The AppShell content slot already provides `p-xl` (24px) per `DESIGN.md §613`.

**Test:** `PageHeader.test.tsx` covering title-only, with-description, with-actions, with both.

### 3. CI enforcement (prevent hardcodes)

Two layers.

**Layer A — Tailwind config narrowing.** In `tailwind-preset.ts`, replace `theme.fontSize` (not extend). This removes the default `text-xs` / `text-sm` / `text-base` / `text-lg` / `text-xl` / `text-2xl` / `text-3xl` utilities so they do not compile. The only valid text-size utilities are the named tokens from §1.

`fontWeight` is **not** narrowed — `font-medium` and `font-semibold` remain available for emphasis spans inside a body run.

`color`, `spacing`, `borderRadius` are already token-only via the existing extend; defaults still resolve, but Layer B catches raw hex/px values.

**Layer B — Repo CI guard.** New script `scripts/check-no-hardcoded-styles.ts`, wired into `pnpm lint` (or a sibling `check:design-tokens` script run by CI).

The script greps `.ts` / `.tsx` files under `apps/`, `modules/`, and `platform/ui/src/components/` for banned patterns:

| Pattern (regex) | Example caught | Message |
|---|---|---|
| `text-\[\d+px\]` | `text-[12px]` | Use a typography token. |
| `text-\[#[0-9a-fA-F]{3,8}\]` | `text-[#62666d]` | Use a named color token. |
| `(bg\|border)-\[#[0-9a-fA-F]{3,8}\]` | `bg-[#fff]` | Use a named color token. |
| `(p\|m\|gap)[xyltrb]?-\[\d+px\]` | `p-[10px]` | Use a spacing token. |
| inline `style=\{\{[^}]*(color\|background\|fontSize\|padding\|margin\|gap)` | `style={{ color: '#000' }}` | Use a Tailwind class with a token. |
| `font-feature-settings.*tnum` | hand-rolled tnum | Use `text-body-tabular` / `text-caption`. |

**No escape hatch.** Per `CLAUDE.md` "No shims, aliases, or 'for now' comments." If a genuine edge case appears (e.g. a chart with computed pixels, or a badge needing a size below the smallest typography token), the right answer is to add a named token to the design system and update `DESIGN.md` — not to bypass the check.

**Exempt paths:** `**/*.test.tsx`, `**/test/**`, `platform/ui/src/tokens/**` (the tokens themselves are allowed to contain raw values), `**/dist/**`, generated files.

**Output on failure:**
```
apps/console/src/pages/Members.tsx:85
  Found banned pattern: text-[13px]
  Use a typography token (text-body-md, text-caption, ...) instead.
```

### 4. Existing primitive fixes

Bundled into the same PR so CI (§3) does not fail against them.

- `platform/ui/src/components/data/StatusBadge.tsx` — replace `text-[11px] tracking-wider font-medium` with `text-eyebrow` (the token already carries 11/500/+0.4px). Keep `rounded-pill`, color variants, `uppercase`.
- `platform/ui/src/components/data/DataTable.tsx` — column header `text-[12px] font-medium text-ink-mute` → `text-caption text-ink-mute` (weight drops to 400 per `DESIGN.md §518`). Cell text gains an explicit `text-body-md` default. New column-definition prop `numeric?: boolean`; when true the cell renders with `text-body-tabular text-right` per `DESIGN.md §714`.
- `platform/ui/src/components/data/EmptyState.tsx` — heading uses `text-display-lg`, description uses `text-body-md text-ink-mute`, icon Lucide `size-6` per `DESIGN.md §722`.
- `platform/ui/src/components/forms/Select.tsx` — `text-[14px]` (lines 16 & 59) → `text-body-md`.
- `platform/ui/src/components/forms/Input.tsx` — replace any hardcoded text size with `text-body-md`.
- `platform/ui/src/components/forms/Button.tsx` — verify `md` and `sm` size variants apply `text-button-md` / `text-button-sm` per `DESIGN.md §219` and `§238`.
- `platform/ui/src/components/forms/Label.tsx` — replace any hardcoded `text-sm` with `text-caption text-ink-mute`.

Each touched component gets an assertion in its existing test confirming the token class is present, so a future regression to hardcoded sizes is caught immediately.

### 5. `Field` form-layout primitive

**File:** `platform/ui/src/components/forms/Field.tsx`.

**API:**

```tsx
interface FieldProps {
  label: string
  htmlFor: string
  description?: ReactNode
  error?: string
  required?: boolean
  children: ReactNode
}
```

**Render:**

```tsx
<div className="flex flex-col gap-xs">
  <label htmlFor={htmlFor} className="text-caption text-ink-mute">
    {label}
    {required && <span className="ml-0.5 text-error" aria-hidden>*</span>}
  </label>
  {children}
  {error
    ? <p className="text-caption text-error" role="alert">{error}</p>
    : description && <p className="text-caption text-ink-mute">{description}</p>}
</div>
```

**Rules:**
- `error` takes precedence over `description`; both never render together.
- `Field` is the public API for labelled inputs going forward. `Label.tsx` stays exported for non-Field uses (Switch row, FileUpload custom layouts).
- `Field` does **not** dictate field grouping or layout — that is the page's job. `Field` is the one-field unit.

**Test:** four states (basic, with description, with error, required).

### 6. Existing-callsite migration (same PR)

Per `CLAUDE.md` "No legacy, no backward compat. Pre-1.0. Change all callers + delete old shape in same PR." The `fontSize` narrowing in §3 Layer A removes `text-xs|sm|base|lg|xl|2xl|3xl` from the utility surface — every current usage of those classes must be replaced in this PR, otherwise the build breaks.

Audit found **19 usages** across the monorepo (no production paths in `modules/` — all in `apps/console` plus a few `platform/ui` shell pieces):

- `apps/console/src/pages/ConsentLandingPage.tsx` (lines 25, 30, 32)
- `apps/console/src/pages/ConnectorsPage.tsx` (lines 34, 45, 61, 80)
- `apps/console/src/routes/__root.tsx` (line 19)
- `apps/console/src/routes/_authed/index.tsx` (lines 19, 20, 29)
- `apps/console/src/routes/_authed/profile.tsx` (lines 18, 19)
- `apps/console/src/routes/_authed/members.tsx` (line 113)
- `apps/console/src/routes/no-workspace.tsx` (lines 9, 10)
- `apps/console/src/routes/_superadmin/admin/tenants.tsx` (lines 20, 78)

Replacement map: `text-2xl font-semibold` → `text-display-md` (26/600 — closest to 24); `text-xl font-semibold` → `text-heading-lg`; `text-lg font-medium` → `text-heading-md`; `text-sm` → `text-body-md`; `text-xs` → `text-caption`.

This callsite migration is **size-only and mechanical** — it does not yet apply `PageHeader` or `Field` (those are the per-page follow-up PRs). Its sole purpose is to keep the build green after `fontSize` narrowing.

### 7. Exports + changeset

`platform/ui/src/index.ts` exports `PageHeader` and `Field`. `pnpm changeset` adds an entry for `@seta/ui`.

## Out of scope (follow-up PRs)

After foundation lands, one PR per console page applies it:

- `Tenants.tsx`, `TenantsPage.tsx`
- `Members.tsx` (also switches raw `<select>` to `Select` + `Field`)
- `ConnectorsPage.tsx`
- `SsoConfigForm.tsx`, `SsoDomainsTable.tsx`
- `MailerConfigForm.tsx`
- `ProfilePage.tsx`
- `ConsentLandingPage.tsx`
- `ConsoleHome` (`index.tsx`)

Each follow-up PR is mechanical: wrap with `PageHeader`, replace hardcoded text sizes with tokens, wrap form rows with `Field`, tag numeric `DataTable` columns. The Layer B CI guard from §3 ensures none of these PRs reintroduce hardcodes.

## Testing strategy

- Unit tests for `PageHeader` and `Field` (vitest, RTL, co-located).
- Updated assertions in existing tests for `StatusBadge`, `DataTable`, `EmptyState`, `Select`, `Input`, `Button`, `Label` to verify token classes are applied.
- New script `scripts/check-no-hardcoded-styles.ts` is itself tested: a fixture file containing each banned pattern produces the expected error report, and the allowlist comment correctly suppresses.
- `pnpm typecheck` + `pnpm lint` + `pnpm test:unit` all pass.

## Risks

- **`fontSize` replacement breaks current callsites.** Quantified above: 19 callsites listed in §6, all in `apps/console` and `platform/ui/src/components/shell/*`. All migrated in this PR.
- **Tailwind v4 hybrid-mode quirks.** The repo is v4 with a v3 preset. The `fontSize` tuple including `fontFeatureSettings` works in v3 but is untested in v4 hybrid mode. Verification step before implementation: build the typography preset locally, inspect the generated CSS for the `tnum` `font-feature-settings` declaration on `text-body-tabular`. If missing, switch §1 to v4-native `@theme` in `tokens.css`.
- **CI guard false positives.** The inline `style=` regex is heuristic; complex template strings or legitimate dynamic styles (e.g. transform values, computed widths) might trigger. Mitigation: start with a conservative pattern (only the listed CSS properties: `color`, `background`, `fontSize`, `padding`, `margin`, `gap`), expand the exempt-path list if needed, and tighten over time. There is no escape-hatch comment — false positives are fixed by tightening the regex or expanding exempt paths.
- **Edge cases below the typography scale.** `NotificationBell.tsx` uses `text-[10px]` for an unread-count badge; this is below the smallest token (`eyebrow` at 11px). Decision for this PR: change it to `text-eyebrow` (11px). If 11px is visually too large in the badge context, a follow-up amends `DESIGN.md` to add a `text-counter` token — but we do **not** preserve the hardcode.

## Acceptance

- `text-body-md`, `text-caption`, `text-eyebrow`, `text-display-lg`, `text-body-tabular`, `text-display-md`, `text-heading-lg`, `text-heading-md`, `text-heading-sm`, `text-body-lg`, `text-button-md`, `text-button-sm` all compile and apply size + weight + tracking (+ `tnum` where specified).
- `text-sm`, `text-xs`, `text-base`, `text-lg`, `text-xl`, `text-2xl`, `text-3xl` do **not** compile.
- `PageHeader` and `Field` are exported from `@seta/ui` with tests.
- `StatusBadge`, `DataTable`, `EmptyState`, `Select`, `Input`, `Button`, `Label` contain no hardcoded text sizes.
- `scripts/check-no-hardcoded-styles.ts` runs in CI and fails on banned patterns; allowlist comments work.
- `pnpm typecheck` + `pnpm lint` + `pnpm test:unit` all pass.
