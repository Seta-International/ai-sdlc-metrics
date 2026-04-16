# Design System Enforcement & Migration

**Date:** 2026-04-16  
**Scope:** Enforce design system compliance across the codebase by formalizing DESIGN.md into Tailwind config, disabling arbitrary values, and migrating all existing hardcoded colors/spacing/radius/shadows to design tokens.

---

## 1. Overview

### Problem

The codebase contains scattered hardcoded colors, spacing, and border radii (e.g., `text-[#f7f8f8]`, `bg-[rgba(255,255,255,0.05)]`, `p-[12px]`) despite DESIGN.md defining the complete system. This leads to:

- Inconsistent styling and visual drift from the design system
- Difficult maintenance when design tokens change
- Onboarding friction for developers who must manually reference DESIGN.md

### Solution

1. **Formalize design tokens** in `tailwind.config.ts` — extract all colors, spacing, border radii, and shadows from DESIGN.md
2. **Enforce via Tailwind** — disable arbitrary values so invalid tokens cannot be used
3. **Enforce via ESLint** — catch violations during development with actionable messages
4. **Migrate in one shot** — replace all existing hardcoded values with tokens in a single commit

### Success Criteria

- ✓ All colors from DESIGN.md defined in `tailwind.config.ts`
- ✓ All spacing values (8px scale) defined in `tailwind.config.ts`
- ✓ All border radii variants defined in `tailwind.config.ts`
- ✓ All shadows defined in `tailwind.config.ts`
- ✓ ESLint rule catches arbitrary color/spacing/radius/shadow values in className
- ✓ Tailwind `corePlugins` disables arbitrary values as a hard constraint
- ✓ Zero hardcoded values remaining in source files (`.tsx`, `.ts`)
- ✓ All `.tsx` files use only defined design tokens
- ✓ CI/CD lint gate enforces compliance on PRs

---

## 2. Tailwind Config Extension

### 2.1 Color Organization (Semantic, from DESIGN.md)

All colors mapped directly from DESIGN.md sections 2 & 9:

**Background Surfaces**

- `bg-marketing-black`: `#010102` / `#08090a`
- `bg-panel-dark`: `#0f1011`
- `bg-surface-level-3`: `#191a1b`
- `bg-secondary-surface`: `#28282c`

**Text & Content**

- `text-primary-text`: `#f7f8f8`
- `text-secondary-text`: `#d0d6e0`
- `text-tertiary-text`: `#8a8f98`
- `text-quaternary-text`: `#62666d`

**Brand & Accent**

- `text-brand-indigo`: `#5e6ad2` (for brand mark text, if needed)
- `bg-brand-indigo`: `#5e6ad2` (primary CTA background)
- `text-accent-violet`: `#7170ff` (interactive accents)
- `text-accent-hover`: `#828fff` (hover states on accent)
- `text-security-lavender`: `#7a7fad` (security-specific elements)

**Status Colors**

- `bg-status-green`: `#27a644` (in-progress indicator)
- `bg-status-emerald`: `#10b981` (completion/success)

**Borders & Dividers**

- `border-primary`: `#23252a`
- `border-secondary`: `#34343a`
- `border-tertiary`: `#3e3e44`
- `border-subtle`: `rgba(255, 255, 255, 0.05)` (default)
- `border-standard`: `rgba(255, 255, 255, 0.08)` (cards, inputs)
- `border-line-tint`: `#141516`
- `border-line-tertiary`: `#18191a`

**Light Mode (for light theme contexts)**

- `bg-light`: `#f7f8f8`
- `bg-light-surface`: `#f3f4f5` / `#f5f6f7`
- `border-light`: `#d0d6e0`
- `border-light-alt`: `#e6e6e6`
- `bg-white`: `#ffffff`

**Overlay**

- `bg-overlay-primary`: `rgba(0, 0, 0, 0.85)`

### 2.2 Spacing System (8px Base Unit)

Extend Tailwind's default spacing with DESIGN.md's scale:

```ts
spacing: {
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  7: '28px',
  8: '32px',
  9: '35px',  // Optical adjustment
  10: '36px',
  11: '40px',
  12: '44px',
  13: '48px',
  // ... extend as needed
}
```

Use Tailwind's default scale (4, 8, 12, 16, etc.) as the base; add custom values (7, 9, 11) for DESIGN.md's micro-adjustments.

### 2.3 Border Radius Scale

From DESIGN.md section 5:

```ts
borderRadius: {
  'micro': '2px',
  'standard': '4px',
  'comfortable': '6px',
  'card': '8px',
  'panel': '12px',
  'large': '22px',
  'pill': '9999px',
  'circle': '50%',
}
```

Usage: `rounded-micro`, `rounded-comfortable`, `rounded-pill`, etc.

### 2.4 Shadows (Complete Stack)

From DESIGN.md section 6 (Depth & Elevation):

```ts
boxShadow: {
  'flat': 'none',
  'subtle': 'rgba(0, 0, 0, 0.03) 0px 1.2px 0px',
  'surface': 'rgba(255, 255, 255, 0.05) 0px 0px 0px 0px inset',
  'inset': 'rgba(0, 0, 0, 0.2) 0px 0px 12px 0px inset',
  'ring': 'rgba(0, 0, 0, 0.2) 0px 0px 0px 1px',
  'elevated': 'rgba(0, 0, 0, 0.4) 0px 2px 4px',
  'dialog': '
    rgba(0, 0, 0, 0) 0px 8px 2px,
    rgba(0, 0, 0, 0.01) 0px 5px 2px,
    rgba(0, 0, 0, 0.04) 0px 3px 2px,
    rgba(0, 0, 0, 0.07) 0px 1px 1px,
    rgba(0, 0, 0, 0.08) 0px 0px 1px
  ',
  'focus': 'rgba(0, 0, 0, 0.1) 0px 4px 12px',
}
```

Usage: `shadow-subtle`, `shadow-elevated`, `shadow-dialog`, etc.

### 2.5 Disable Arbitrary Values

In `tailwind.config.ts`, add:

```ts
corePlugins: {
  // Prevent: text-[#f7f8f8], bg-[rgba(...)], p-[12px], etc.
  arbitrary: false,
}
```

Or selectively disable by category:

```ts
corePlugins: {
  // Don't allow arbitrary color values
  textOpacity: false,
  backgroundOpacity: false,
  // ... others as needed
}
```

This ensures that if a developer tries to use `text-[#f00]` or `bg-[arbitrary]`, Tailwind will not generate the class, failing at build time.

---

## 3. ESLint Enforcement

### 3.1 Rule Configuration

Use `eslint-plugin-tailwindcss` or create a custom rule to detect and report:

**Patterns to catch:**

- `className="text-[#...]"` or `className="text-[rgb(...)]"` → suggest `text-primary-text` or appropriate token
- `className="bg-[#...]"` → suggest `bg-surface-level-3` or token
- `className="border-[#...]"` → suggest `border-subtle` or token
- `className="p-[12px]"` → suggest `p-3` (from spacing scale)
- `className="m-[24px]"` → suggest `m-6`
- `className="rounded-[8px]"` → suggest `rounded-card`
- `className="shadow-[...]"` → suggest `shadow-subtle`, `shadow-elevated`, etc.

### 3.2 Error Message Template

```
Arbitrary Tailwind value detected: 'text-[#f7f8f8]'
Use design system token instead: 'text-primary-text'
See DESIGN.md section 2 for color reference or tailwind.config.ts for valid values.
```

### 3.3 Rule Application

- Apply to all `.tsx` and `.jsx` files
- Scope: className attributes only (standard practice)
- Severity: `error` (fail lint, block PR)

---

## 4. Migration Strategy

### 4.1 Scope

All `.tsx` and `.ts` files in `apps/*/src` and `packages/*/src`.

### 4.2 Approach

1. Create a migration script that:
   - Finds all instances of `text-[#...]`, `bg-[...]`, `p-[...]`, etc.
   - Maps to nearest design token using DESIGN.md color names and spacing scale
   - Performs safe string replacement with validation

2. Manual fixes for edge cases:
   - Custom rgba values that don't map to a standard token → add to config first
   - Inline `style` attributes (not in scope, but flag for review)

3. One-commit migration:
   - Run the script
   - Review the diff
   - Commit with message: `refactor: migrate all hardcoded values to design system tokens`

### 4.3 Mapping Examples

| Hardcoded                         | Design Token           | Reason                                    |
| --------------------------------- | ---------------------- | ----------------------------------------- |
| `text-[#f7f8f8]`                  | `text-primary-text`    | Primary heading/text color from DESIGN.md |
| `text-[#d0d6e0]`                  | `text-secondary-text`  | Body text color                           |
| `text-[#8a8f98]`                  | `text-tertiary-text`   | Muted/placeholder color                   |
| `bg-[rgba(255,255,255,0.05)]`     | `bg-surface-secondary` | Near-transparent surface                  |
| `border-[rgba(255,255,255,0.08)]` | `border-standard`      | Standard card/input border                |
| `p-[12px]`                        | `p-3`                  | 12px = 1.5 × 8px scale                    |
| `rounded-[8px]`                   | `rounded-card`         | Card radius from DESIGN.md                |

---

## 5. Implementation Plan (High-Level)

1. **Update `tailwind.config.ts`**
   - Add `colors`, `spacing`, `borderRadius`, `boxShadow` extensions
   - Disable arbitrary values via `corePlugins`

2. **Configure ESLint**
   - Add rule to detect arbitrary Tailwind values
   - Set to error severity

3. **Run migration script**
   - Scan all source files
   - Replace hardcoded values with tokens
   - Generate diff for review

4. **Test**
   - Run `bun run build` to ensure no build errors
   - Run ESLint to confirm no violations remain
   - Spot-check visual consistency in running app

5. **Commit**
   - Single commit: "refactor: migrate all hardcoded values to design system tokens"

6. **CI/CD Gate**
   - Ensure ESLint fails on PRs with arbitrary values
   - Document in CLAUDE.md that design tokens are mandatory

---

## 6. Edge Cases & Considerations

### 6.1 Dynamic Styling

If components need dynamic colors (e.g., status-dependent), use CSS-in-JS or pass token names as props:

```tsx
// Good
const statusColor = status === 'active' ? 'bg-status-green' : 'bg-tertiary-text';
<div className={statusColor} />

// Avoid
<div style={{ backgroundColor: status === 'active' ? '#27a644' : '#8a8f98' }} />
```

### 6.2 Custom Components

If a base component (e.g., from `packages/ui`) uses a hardcoded color, it should be updated as part of this migration.

### 6.3 Third-Party Components

If a third-party component (Radix UI, etc.) has hardcoded styling, wrap it with a design-compliant layer rather than duplicating tokens.

---

## 7. Rollout & Enforcement

### Immediate (This Sprint)

- Update `tailwind.config.ts` with all tokens
- Configure ESLint rule
- Run migration script
- Commit all changes

### Ongoing

- ESLint rule blocks any new arbitrary values
- Tailwind config prevents build-time violations
- Code review enforces design system during PR review

### Documentation

- Update CLAUDE.md with:
  - Design system is mandatory (no exceptions)
  - Color/spacing/radius reference (link to DESIGN.md + config)
  - How to add new tokens (rare, requires design sign-off)

---

## 8. Success Metrics

- ✅ Zero hardcoded colors/spacing/radius/shadows in source files
- ✅ ESLint lint passes with no violations
- ✅ `bun run build` succeeds without errors
- ✅ Visual regression test shows no unintended changes
- ✅ New PRs are blocked if they contain arbitrary Tailwind values
