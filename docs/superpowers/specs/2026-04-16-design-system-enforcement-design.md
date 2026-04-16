# Design System Token Enforcement

**Date:** 2026-04-16
**Status:** Approved

## Goal

Eliminate all hardcoded color and spacing values from the codebase. Every color and non-standard spacing value must reference a named design token. Violations are caught at commit time (pre-commit script) and at lint time (ESLint rule), making it impossible to introduce new hardcoded values. All existing violations are migrated in one sweep via a migration script.

## Scope

- All files in `apps/*/src/**/*.{tsx,ts,jsx,js}` and `packages/*/src/**/*.{tsx,ts,jsx,js}`
- Tailwind arbitrary value syntax (`[#...]`, `[rgba(...)]`, `[12px]`, etc.) — all banned, not just colors
- Applies to new code going forward and all existing code (full migration)

---

## Architecture

### Layer 1 — CSS Custom Properties (`packages/ui/src/styles/tokens.css`)

Semantic color tokens are defined as CSS variables with RGB channel values (no commas), enabling Tailwind opacity modifiers (`bg-canvas/50`) to work correctly. `:root` defines light mode defaults; `.dark` overrides for dark mode.

```css
:root {
  /* Backgrounds */
  --color-canvas: 247 248 248; /* #f7f8f8 */
  --color-panel: 243 244 245; /* #f3f4f5 */
  --color-surface: 255 255 255; /* #ffffff */
  --color-elevated: 245 246 247; /* #f5f6f7 */

  /* Foreground / text — DESIGN.md does not define light mode text colors.
     Values below are derived inverses of the dark palette; adjust if a
     formal light mode typography spec is added to DESIGN.md. */
  --color-fg-primary: 15 16 17; /* #0f1011 — dark panel color inverted */
  --color-fg-secondary: 60 70 85; /* approximate */
  --color-fg-muted: 100 110 120; /* approximate */
  --color-fg-subtle: 140 145 152; /* approximate */

  /* Dividers */
  --color-divider: 230 230 230; /* #e6e6e6 */
  --color-divider-md: 214 214 214;
  --color-divider-lg: 200 200 200;
  --color-line-tint: 240 241 242;
  --color-line: 238 239 240;

  /* Overlay base (black in light, white in dark) */
  --color-overlay: 0 0 0;
}

.dark {
  /* Backgrounds */
  --color-canvas: 8 9 10; /* #08090a */
  --color-panel: 15 16 17; /* #0f1011 */
  --color-surface: 25 26 27; /* #191a1b */
  --color-elevated: 40 40 44; /* #28282c */

  /* Foreground / text */
  --color-fg-primary: 247 248 248; /* #f7f8f8 */
  --color-fg-secondary: 208 214 224; /* #d0d6e0 */
  --color-fg-muted: 138 143 152; /* #8a8f98 */
  --color-fg-subtle: 98 102 109; /* #62666d */

  /* Dividers */
  --color-divider: 35 37 42; /* #23252a */
  --color-divider-md: 52 52 58; /* #34343a */
  --color-divider-lg: 62 62 68; /* #3e3e44 */
  --color-line-tint: 20 21 22; /* #141516 */
  --color-line: 24 25 26; /* #18191a */

  /* Overlay base */
  --color-overlay: 255 255 255;
}
```

**Static tokens** (same in both themes — brand, accent, status) are hardcoded in `tailwind.config.ts` directly, no CSS variable needed.

**Import:** `tokens.css` is imported once in each zone's root layout (`apps/*/src/app/layout.tsx`).

---

### Layer 2 — Tailwind Config (`tailwind.config.ts`)

```typescript
const config = {
  content: ['./apps/*/src/**/*.{js,ts,jsx,tsx,mdx}', './packages/*/src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Semantic theme-aware tokens (CSS variables)
        canvas: 'rgb(var(--color-canvas) / <alpha-value>)',
        panel: 'rgb(var(--color-panel) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        elevated: 'rgb(var(--color-elevated) / <alpha-value>)',

        'fg-primary': 'rgb(var(--color-fg-primary) / <alpha-value>)',
        'fg-secondary': 'rgb(var(--color-fg-secondary) / <alpha-value>)',
        'fg-muted': 'rgb(var(--color-fg-muted) / <alpha-value>)',
        'fg-subtle': 'rgb(var(--color-fg-subtle) / <alpha-value>)',

        divider: 'rgb(var(--color-divider) / <alpha-value>)',
        'divider-md': 'rgb(var(--color-divider-md) / <alpha-value>)',
        'divider-lg': 'rgb(var(--color-divider-lg) / <alpha-value>)',
        'line-tint': 'rgb(var(--color-line-tint) / <alpha-value>)',
        line: 'rgb(var(--color-line) / <alpha-value>)',

        // Overlay: bg-overlay/5 = rgba(white or black, 0.05) depending on theme
        overlay: 'rgb(var(--color-overlay) / <alpha-value>)',

        // Static brand & accent (same in both themes)
        brand: '#5e6ad2',
        accent: '#7170ff',
        'accent-hover': '#828fff',
        security: '#7a7fad',

        // Static status
        success: '#27a644',
        emerald: '#10b981',

        // Light mode surfaces — use ONLY for components that are always
        // light regardless of theme (e.g. a modal that is always white).
        // For theme-aware surfaces, use the semantic tokens above (canvas,
        // panel, surface) which switch automatically via CSS variables.
        'light-bg': '#f7f8f8',
        'light-surface': '#f3f4f5',
        'light-border': '#d0d6e0',
        'light-border-alt': '#e6e6e6',
      },

      fontWeight: {
        510: '510',
        590: '590',
      },

      fontSize: {
        tiny: ['10px', { lineHeight: '1.4', letterSpacing: 'normal' }],
        micro: ['11px', { lineHeight: '1.4', letterSpacing: 'normal' }],
      },

      // Non-standard spacing values from DESIGN.md
      spacing: {
        '1.75': '7px', // optical micro-gap
        '2.75': '11px', // optical micro-gap
        '4.75': '19px',
        '5.5': '22px',
        '8.75': '35px',
      },

      maxHeight: {
        'content-lg': '500px',
        'content-md': '300px',
      },
      minHeight: {
        'content-lg': '500px',
      },
    },
  },
  plugins: [],
}

export default config
```

### rgba Migration Map

Existing arbitrary rgba values convert to Tailwind opacity modifier syntax:

| Old arbitrary value        | New syntax   |
| -------------------------- | ------------ |
| `[rgba(255,255,255,0.01)]` | `overlay/1`  |
| `[rgba(255,255,255,0.02)]` | `overlay/2`  |
| `[rgba(255,255,255,0.03)]` | `overlay/3`  |
| `[rgba(255,255,255,0.04)]` | `overlay/4`  |
| `[rgba(255,255,255,0.05)]` | `overlay/5`  |
| `[rgba(255,255,255,0.08)]` | `overlay/8`  |
| `[rgba(255,255,255,0.1)]`  | `overlay/10` |
| `[rgba(113,112,255,0.04)]` | `accent/4`   |
| `[rgba(0,0,0,0.2)]`        | `black/20`   |
| `[rgba(0,0,0,0.4)]`        | `black/40`   |
| `[rgba(0,0,0,0.85)]`       | `black/85`   |

### Hex Color Migration Map

| Old arbitrary value | New token      |
| ------------------- | -------------- |
| `[#08090a]`         | `canvas`       |
| `[#0f1011]`         | `panel`        |
| `[#191a1b]`         | `surface`      |
| `[#28282c]`         | `elevated`     |
| `[#f7f8f8]`         | `fg-primary`   |
| `[#d0d6e0]`         | `fg-secondary` |
| `[#8a8f98]`         | `fg-muted`     |
| `[#62666d]`         | `fg-subtle`    |
| `[#5e6ad2]`         | `brand`        |
| `[#7170ff]`         | `accent`       |
| `[#828fff]`         | `accent-hover` |
| `[#7a7fad]`         | `security`     |
| `[#27a644]`         | `success`      |
| `[#10b981]`         | `emerald`      |
| `[#23252a]`         | `divider`      |
| `[#34343a]`         | `divider-md`   |
| `[#3e3e44]`         | `divider-lg`   |
| `[#141516]`         | `line-tint`    |
| `[#18191a]`         | `line`         |
| `[#e2e4e7]`         | `fg-secondary` |

---

## Enforcement

### ESLint Rule (`packages/eslint-config`)

Add `eslint-plugin-tailwindcss` with `tailwindcss/no-arbitrary-value: 'error'` to the shared config. Bans **all** arbitrary values — colors, spacing, sizing — not just colors. Surfaces violations in IDE immediately.

```ts
// packages/eslint-config/nextjs.ts
import tailwindcss from 'eslint-plugin-tailwindcss'

export default [
  ...tailwindcss.configs['flat/recommended'],
  {
    settings: {
      // Path is relative to each app's eslint.config.ts; use path.resolve
      // with import.meta.dirname to point at the repo-root tailwind.config.ts
      tailwindcss: { config: path.resolve(import.meta.dirname, '../../tailwind.config.ts') },
    },
    rules: {
      'tailwindcss/no-arbitrary-value': 'error',
    },
  },
]
```

### Lefthook Pre-commit Script (`scripts/check-design-tokens.js`)

Runs on staged files only. Greps for:

- `\[#[0-9a-fA-F]{3,8}\]` — arbitrary hex
- `\[rgba?\(` — arbitrary rgba/rgb
- `\[\d+(\.\d+)?px\]` — arbitrary px values

Exits non-zero on any match with file path + line number. Added to `lefthook.yml` pre-commit alongside the existing prettier check.

---

## Migration

### One-shot migration script (`scripts/migrate-design-tokens.js`)

- Walks all `apps/*/src/**/*.{tsx,ts,jsx,js}` and `packages/*/src/**/*.{tsx,ts,jsx,js}`
- Applies hex and rgba replacement maps (see tables above)
- Applies non-standard spacing replacements: `[7px]` → `1.75`, `[11px]` → `2.75`, etc.
- Writes files in-place
- Prints a report of any unrecognized arbitrary values that need manual review

**After running:** delete the migration script, commit migrated files + deletion together.

---

## Delivery Order

1. Add `tokens.css` to `packages/ui/src/styles/`
2. Update `tailwind.config.ts` with all new tokens
3. Import `tokens.css` in each zone's root layout
4. Add `eslint-plugin-tailwindcss` to `packages/eslint-config`
5. Add `check-design-tokens.js` script and update `lefthook.yml`
6. Write and run `migrate-design-tokens.js`
7. Delete migration script, verify lint passes, commit
