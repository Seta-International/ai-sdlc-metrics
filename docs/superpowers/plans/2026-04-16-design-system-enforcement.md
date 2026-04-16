# Design System Token Enforcement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all hardcoded Tailwind arbitrary color/spacing values, enforce this via ESLint + a lefthook pre-commit script, and migrate every existing violation in one sweep.

**Architecture:** This project uses **Tailwind v4**. Design tokens are CSS custom properties defined in `packages/ui/src/styles/globals.css` using Tailwind v4's `@theme inline` pattern (already used for shadcn tokens). `:root` holds light-mode values; `.dark` overrides hold dark-mode values. `tailwind.config.ts` is wired via `@config` in each zone's CSS entry point and lists color names so `eslint-plugin-tailwindcss` can validate them. A regex pre-commit script is the hard gate; ESLint provides IDE feedback. A one-shot migration script replaces all existing violations; the script is deleted after the run.

**Tech Stack:** Tailwind CSS v4, ESLint 10, eslint-plugin-tailwindcss, lefthook, Node.js (migration script — no extra deps)

---

## File Map

| File                                                                                                                | Action                       | Purpose                                                     |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------- |
| `packages/ui/src/styles/globals.css`                                                                                | Modify                       | Add token CSS vars to `:root`, `.dark`, and `@theme inline` |
| `tailwind.config.ts`                                                                                                | Modify                       | Add spacing tokens + color names for ESLint                 |
| `apps/web-{admin,finance,goals,hiring,insights,people,performance,planner,projects,shell,time}/src/app/globals.css` | Modify (11 files)            | Add `@config` directive                                     |
| `packages/eslint-config/package.json`                                                                               | Modify                       | Add `eslint-plugin-tailwindcss` dep                         |
| `packages/eslint-config/nextjs.ts`                                                                                  | Modify                       | Add `no-arbitrary-value` rule                               |
| `lefthook.yml`                                                                                                      | Modify                       | Add `design-tokens` pre-commit command                      |
| `scripts/check-design-tokens.js`                                                                                    | Create                       | Pre-commit regex validator                                  |
| `scripts/migrate-design-tokens.js`                                                                                  | Create (delete after Task 5) | One-shot migration script                                   |

---

## Task 1: Add design tokens to shared globals.css

**Files:**

- Modify: `packages/ui/src/styles/globals.css`

The file already uses this three-layer pattern for shadcn tokens:

1. `@theme inline` — maps `--color-*` names to CSS variables → Tailwind generates utilities
2. `:root` — defines CSS variables with light-mode values
3. `.dark` — overrides CSS variables for dark mode

We extend all three layers with design system tokens. **Do not remove or change any existing entries** — only append.

- [ ] **Step 1: Add `@theme inline` entries**

Inside the existing `@theme inline { ... }` block, append these lines before the closing `}` (currently around line 41):

```css
/* Design system tokens */
--color-canvas: var(--canvas);
--color-panel: var(--panel);
--color-surface: var(--surface);
--color-elevated: var(--elevated);
--color-fg-primary: var(--fg-primary);
--color-fg-secondary: var(--fg-secondary);
--color-fg-muted: var(--fg-muted);
--color-fg-subtle: var(--fg-subtle);
--color-divider: var(--divider);
--color-divider-md: var(--divider-md);
--color-divider-lg: var(--divider-lg);
--color-line-tint: var(--line-tint);
--color-line: var(--line);
--color-overlay: var(--overlay);
--color-brand: var(--brand);
--color-accent-hover: var(--accent-hover);
--color-security: var(--security);
--color-success-ds: var(--success-ds);
--color-emerald: var(--emerald);
```

- [ ] **Step 2: Add light-mode token values to `:root`**

Inside the existing `:root { ... }` block in `@layer base`, append these lines before the closing `}` (currently around line 120):

```css
/* Design system tokens — light mode */
--canvas: #f7f8f8;
--panel: #f3f4f5;
--surface: #ffffff;
--elevated: #f5f6f7;
--fg-primary: #0f1011;
--fg-secondary: #3c4655;
--fg-muted: #646e78;
--fg-subtle: #8c9198;
--divider: #e6e6e6;
--divider-md: #d6d6d6;
--divider-lg: #c8c8c8;
--line-tint: #f0f1f2;
--line: #eeeef0;
--overlay: #000000;
/* Static design tokens — same in both themes, defined once in :root */
--brand: #5e6ad2;
--accent-hover: #828fff;
--security: #7a7fad;
--success-ds: #27a644;
--emerald: #10b981;
```

Note: `success-ds` uses the `-ds` suffix to avoid a CSS variable name conflict with the existing status token `--color-bg-success`. `success` without the prefix would shadow shadcn usage.

- [ ] **Step 3: Add dark-mode token overrides to `.dark`**

Inside the existing `.dark { ... }` block in `@layer base`, append these lines before the closing `}` (currently around line 188):

```css
/* Design system tokens — dark mode overrides */
--canvas: #08090a;
--panel: #0f1011;
--surface: #191a1b;
--elevated: #28282c;
--fg-primary: #f7f8f8;
--fg-secondary: #d0d6e0;
--fg-muted: #8a8f98;
--fg-subtle: #62666d;
--divider: #23252a;
--divider-md: #34343a;
--divider-lg: #3e3e44;
--line-tint: #141516;
--line: #18191a;
--overlay: #ffffff;
/* Static tokens (brand, accent-hover, security, success-ds, emerald) are NOT
       overridden here — they inherit the :root values in both themes. */
```

- [ ] **Step 4: Verify tokens resolve correctly**

Add a temporary test element to `apps/web-people/src/components/org-chart-node.tsx` (or any convenient component):

```tsx
<div className="bg-canvas text-fg-primary border border-divider p-4">Token test — remove me</div>
```

Run `bun dev` in `apps/web-people`, open the browser. In dark mode the div should have background `#08090a`, text `#f7f8f8`, border `#23252a`. In light mode: background `#f7f8f8`, text `#0f1011`, border `#e6e6e6`.

Revert the temporary test element after verifying.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/styles/globals.css
git commit -m "feat: add design system color tokens to globals.css"
```

---

## Task 2: Update tailwind.config.ts and wire @config in zone CSS

**Files:**

- Modify: `tailwind.config.ts`
- Modify: 11 zone globals.css files

`tailwind.config.ts` currently exists but is not linked to any CSS entry point — no `@config` directive. Without it, Tailwind v4 ignores the file completely. Adding `@config` activates spacing tokens and lets `eslint-plugin-tailwindcss` auto-discover the custom color names.

- [ ] **Step 1: Replace tailwind.config.ts with the version that includes spacing and color names**

Write the full file:

```typescript
const config = {
  content: ['./apps/*/src/**/*.{js,ts,jsx,tsx,mdx}', './packages/*/src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Design system semantic tokens.
        // Values point to CSS variables defined in packages/ui/src/styles/globals.css.
        // Listed here so eslint-plugin-tailwindcss knows they are valid tokens.
        canvas: 'var(--color-canvas)',
        panel: 'var(--color-panel)',
        surface: 'var(--color-surface)',
        elevated: 'var(--color-elevated)',
        'fg-primary': 'var(--color-fg-primary)',
        'fg-secondary': 'var(--color-fg-secondary)',
        'fg-muted': 'var(--color-fg-muted)',
        'fg-subtle': 'var(--color-fg-subtle)',
        divider: 'var(--color-divider)',
        'divider-md': 'var(--color-divider-md)',
        'divider-lg': 'var(--color-divider-lg)',
        'line-tint': 'var(--color-line-tint)',
        line: 'var(--color-line)',
        overlay: 'var(--color-overlay)',
        brand: 'var(--color-brand)',
        'accent-hover': 'var(--color-accent-hover)',
        security: 'var(--color-security)',
        'success-ds': 'var(--color-success-ds)',
        emerald: 'var(--color-emerald)',
      },
      fontWeight: {
        /**
         * Custom font weights:
         * 510 - Medium Plus (emphasis weight)
         * 590 - Semibold Minus (strong emphasis weight)
         * Aligns with design system typography scale
         */
        510: '510',
        590: '590',
      },
      fontSize: {
        /**
         * Custom text sizes:
         * tiny - 10px (for minimal UI elements)
         * micro - 11px (for badges, labels, footnotes)
         * Complements standard Tailwind sizes (xs: 12px, sm: 14px, base: 16px, etc.)
         */
        tiny: ['10px', { lineHeight: '1.4', letterSpacing: 'normal' }],
        micro: ['11px', { lineHeight: '1.4', letterSpacing: 'normal' }],
      },
      // Non-standard spacing values from DESIGN.md optical micro-adjustments.
      // Standard Tailwind spacing (p-1=4px, p-2=8px, p-3=12px, p-4=16px, etc.) is unchanged.
      spacing: {
        '1.75': '7px',
        '2.75': '11px',
        '4.75': '19px',
        '5.5': '22px',
        '8.75': '35px',
      },
      maxHeight: {
        /**
         * Reusable content container heights:
         * Used for scrollable lists, command palettes, org charts
         */
        'content-lg': '500px',
        'content-md': '300px',
      },
      minHeight: {
        /**
         * Minimum heights for layout containers
         */
        'content-lg': '500px',
      },
    },
  },
  plugins: [],
}

export default config
```

- [ ] **Step 2: Add `@config` to all 11 zone globals.css files**

Each file currently contains exactly:

```css
@import 'tailwindcss';
@source "../../**/*.{tsx,ts,jsx,js}";
@import '@future/ui/src/styles/globals.css';
```

Add `@config '../../../../tailwind.config.ts';` as the third line. The path traverses 4 levels up from `apps/web-{zone}/src/app/` to the repo root.

Apply to all 11 files:

- `apps/web-admin/src/app/globals.css`
- `apps/web-finance/src/app/globals.css`
- `apps/web-goals/src/app/globals.css`
- `apps/web-hiring/src/app/globals.css`
- `apps/web-insights/src/app/globals.css`
- `apps/web-people/src/app/globals.css`
- `apps/web-performance/src/app/globals.css`
- `apps/web-planner/src/app/globals.css`
- `apps/web-projects/src/app/globals.css`
- `apps/web-shell/src/app/globals.css`
- `apps/web-time/src/app/globals.css`

Each file should become:

```css
@import 'tailwindcss';
@source "../../**/*.{tsx,ts,jsx,js}";
@config '../../../../tailwind.config.ts';
@import '@future/ui/src/styles/globals.css';
```

- [ ] **Step 3: Verify a spacing token works**

Add a temporary `className="p-1.75"` to any element in `apps/web-people`, run `bun dev`, inspect in DevTools. Expected: `padding: 7px`. Remove the temporary class.

- [ ] **Step 4: Commit**

```bash
git add tailwind.config.ts apps/web-admin/src/app/globals.css apps/web-finance/src/app/globals.css apps/web-goals/src/app/globals.css apps/web-hiring/src/app/globals.css apps/web-insights/src/app/globals.css apps/web-people/src/app/globals.css apps/web-performance/src/app/globals.css apps/web-planner/src/app/globals.css apps/web-projects/src/app/globals.css apps/web-shell/src/app/globals.css apps/web-time/src/app/globals.css
git commit -m "feat: add spacing tokens to tailwind.config.ts and wire @config in zone CSS"
```

---

## Task 3: Add ESLint enforcement

**Files:**

- Modify: `packages/eslint-config/package.json`
- Modify: `packages/eslint-config/nextjs.ts`

- [ ] **Step 1: Install eslint-plugin-tailwindcss**

Run from the repo root:

```bash
bun add -d eslint-plugin-tailwindcss --filter @future/eslint-config
```

Expected: `eslint-plugin-tailwindcss` appears in `packages/eslint-config/package.json` under `devDependencies`.

- [ ] **Step 2: Replace packages/eslint-config/nextjs.ts**

```typescript
import reactPlugin from '@eslint-react/eslint-plugin'
import nextPlugin from '@next/eslint-plugin-next'
import prettier from 'eslint-config-prettier'
import tailwindcss from 'eslint-plugin-tailwindcss'
import type { Linter } from 'eslint'
import base from './base.ts'

const config: Linter.Config[] = [
  ...base,
  // React rules — ESLint 10 compatible, replaces eslint-plugin-react + react-hooks
  reactPlugin.configs['recommended-typescript'] as Linter.Config,
  // Next.js-specific rules
  nextPlugin.configs['recommended'] as Linter.Config,
  // Tailwind CSS design system enforcement — bans all arbitrary values
  ...(tailwindcss.configs['flat/recommended'] as Linter.Config[]),
  {
    settings: {
      tailwindcss: {
        // Plugin auto-discovers tailwind.config.ts walking up from eslint config dir
        tailwindVersion: '4',
      },
    },
    rules: {
      'tailwindcss/no-arbitrary-value': 'error',
      // Class ordering handled by Prettier — disable to avoid conflicts
      'tailwindcss/classnames-order': 'off',
    },
  },
  prettier,
]

export default config
```

- [ ] **Step 3: Run lint to see the scope of current violations**

```bash
bun turbo lint 2>&1 | grep "no-arbitrary-value" | wc -l
```

Expected: a large number (hundreds of violations across all zones). This is expected — Task 5 migrates them all.

- [ ] **Step 4: Commit**

```bash
git add packages/eslint-config/
git commit -m "feat: add eslint-plugin-tailwindcss no-arbitrary-value enforcement"
```

---

## Task 4: Add lefthook pre-commit validation script

**Files:**

- Create: `scripts/check-design-tokens.js`
- Modify: `lefthook.yml`

- [ ] **Step 1: Create scripts/check-design-tokens.js**

```javascript
#!/usr/bin/env node
// Pre-commit hook: rejects staged files containing Tailwind arbitrary color
// or spacing values. Invoked by lefthook with staged file paths as arguments.

import { readFileSync } from 'node:fs'

const PATTERNS = [
  { regex: /\[#[0-9a-fA-F]{3,8}\]/g, desc: 'arbitrary hex color' },
  { regex: /\[rgba?\(/g, desc: 'arbitrary rgba/rgb color' },
  { regex: /\[\d+(\.\d+)?px\]/g, desc: 'arbitrary px value' },
]

const files = process.argv.slice(2).filter((f) => /\.(tsx?|jsx?)$/.test(f))
let hasViolations = false

for (const file of files) {
  let content
  try {
    content = readFileSync(file, 'utf-8')
  } catch {
    continue
  }
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    for (const { regex, desc } of PATTERNS) {
      regex.lastIndex = 0
      for (const match of lines[i].matchAll(regex)) {
        console.error(`${file}:${i + 1}: ${desc}: ${match[0]}`)
        hasViolations = true
      }
    }
  }
}

if (hasViolations) {
  console.error('\nDesign system violation: replace arbitrary values with named tokens.')
  console.error('See: docs/superpowers/specs/2026-04-16-design-system-enforcement-design.md')
  process.exit(1)
}
```

- [ ] **Step 2: Test the script manually before wiring it into lefthook**

```bash
echo 'const x = "bg-[#5e6ad2] border-[rgba(255,255,255,0.08)]"' > /tmp/test-violation.tsx
node scripts/check-design-tokens.js /tmp/test-violation.tsx
echo "exit: $?"
```

Expected output:

```
/tmp/test-violation.tsx:1: arbitrary hex color: [#5e6ad2]
/tmp/test-violation.tsx:1: arbitrary rgba/rgb color: [rgba(
Design system violation: replace arbitrary values with named tokens.
See: docs/superpowers/specs/2026-04-16-design-system-enforcement-design.md
exit: 1
```

```bash
echo 'const x = "bg-brand border-white/8"' > /tmp/test-ok.tsx
node scripts/check-design-tokens.js /tmp/test-ok.tsx
echo "exit: $?"
```

Expected: no output, `exit: 0`.

- [ ] **Step 3: Replace lefthook.yml**

```yaml
pre-commit:
  parallel: true
  commands:
    format-check:
      glob: '*.{ts,tsx,js,mjs,json,md}'
      run: bunx prettier --check {staged_files}
    design-tokens:
      glob: '*.{ts,tsx,js,jsx}'
      run: node scripts/check-design-tokens.js {staged_files}

pre-push:
  parallel: true
  commands:
    lint:
      run: bun turbo lint
    typecheck:
      run: bun turbo typecheck
    test:
      run: bun turbo test:unit
```

- [ ] **Step 4: Commit**

```bash
git add scripts/check-design-tokens.js lefthook.yml
git commit -m "feat: add design-tokens pre-commit validation script"
```

---

## Task 5: Write and run migration script, then commit clean state

**Files:**

- Create then delete: `scripts/migrate-design-tokens.js`

This script replaces every known hardcoded arbitrary value across the codebase with its named token equivalent. It is a one-shot tool — delete it after the migration commit.

- [ ] **Step 1: Create scripts/migrate-design-tokens.js**

```javascript
#!/usr/bin/env node
// One-shot migration: replaces all known Tailwind arbitrary color/spacing
// values with named design system tokens.
//
// Usage:
//   node scripts/migrate-design-tokens.js           # apply changes
//   node scripts/migrate-design-tokens.js --dry-run # preview only

import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { resolve, join, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const DRY_RUN = process.argv.includes('--dry-run')
const EXTS = new Set(['.tsx', '.ts', '.jsx', '.js'])
const SKIP = new Set(['node_modules', '.next', 'dist', '.git', '.turbo', 'scripts'])

// Replacements: [pattern, token-name]
// Order matters — longer/more-specific patterns must come before shorter ones.
const REPLACEMENTS = [
  // rgba values (allow optional spaces after commas)
  [/\[rgba\(255,\s*255,\s*255,\s*0\.01\)\]/g, 'overlay/1'],
  [/\[rgba\(255,\s*255,\s*255,\s*0\.02\)\]/g, 'overlay/2'],
  [/\[rgba\(255,\s*255,\s*255,\s*0\.03\)\]/g, 'overlay/3'],
  [/\[rgba\(255,\s*255,\s*255,\s*0\.04\)\]/g, 'overlay/4'],
  [/\[rgba\(255,\s*255,\s*255,\s*0\.05\)\]/g, 'overlay/5'],
  [/\[rgba\(255,\s*255,\s*255,\s*0\.08\)\]/g, 'overlay/8'],
  [/\[rgba\(255,\s*255,\s*255,\s*0\.1\)\]/g, 'overlay/10'],
  [/\[rgba\(113,\s*112,\s*255,\s*0\.04\)\]/g, 'accent/4'],
  [/\[rgba\(0,\s*0,\s*0,\s*0\.2\)\]/g, 'black/20'],
  [/\[rgba\(0,\s*0,\s*0,\s*0\.4\)\]/g, 'black/40'],
  [/\[rgba\(0,\s*0,\s*0,\s*0\.85\)\]/g, 'black/85'],
  // Hex colors (case-insensitive, 6-digit)
  [/\[#08090a\]/gi, 'canvas'],
  [/\[#0f1011\]/gi, 'panel'],
  [/\[#191a1b\]/gi, 'surface'],
  [/\[#28282c\]/gi, 'elevated'],
  [/\[#f7f8f8\]/gi, 'fg-primary'],
  [/\[#d0d6e0\]/gi, 'fg-secondary'],
  [/\[#8a8f98\]/gi, 'fg-muted'],
  [/\[#62666d\]/gi, 'fg-subtle'],
  [/\[#5e6ad2\]/gi, 'brand'],
  [/\[#7170ff\]/gi, 'accent'],
  [/\[#828fff\]/gi, 'accent-hover'],
  [/\[#7a7fad\]/gi, 'security'],
  [/\[#27a644\]/gi, 'success-ds'],
  [/\[#10b981\]/gi, 'emerald'],
  [/\[#23252a\]/gi, 'divider'],
  [/\[#34343a\]/gi, 'divider-md'],
  [/\[#3e3e44\]/gi, 'divider-lg'],
  [/\[#141516\]/gi, 'line-tint'],
  [/\[#18191a\]/gi, 'line'],
  [/\[#e2e4e7\]/gi, 'fg-secondary'],
]

// Pattern to detect any remaining unhandled arbitrary values after replacement
const UNHANDLED = /\[(?:#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|\d+(?:\.\d+)?px)\]/g

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory() && !SKIP.has(entry.name)) {
      yield* walk(full)
    } else if (entry.isFile() && EXTS.has(extname(entry.name))) {
      yield full
    }
  }
}

let scanned = 0
let modified = 0
const unhandled = []

for (const absPath of walk(join(ROOT, 'apps'))) {
  let content = readFileSync(absPath, 'utf-8')
  const original = content
  scanned++

  for (const [pattern, token] of REPLACEMENTS) {
    content = content.replace(pattern, token)
  }

  if (content !== original) {
    modified++
    if (!DRY_RUN) writeFileSync(absPath, content, 'utf-8')
    const rel = absPath.replace(ROOT + '/', '')
    console.log(`${DRY_RUN ? '[dry] ' : ''}${rel}`)
  }

  // Detect remaining unhandled values
  UNHANDLED.lastIndex = 0
  for (const match of content.matchAll(UNHANDLED)) {
    const line = content.slice(0, match.index).split('\n').length
    unhandled.push({ file: absPath.replace(ROOT + '/', ''), line, value: match[0] })
  }
}

// Also walk packages (excluding node_modules etc.)
for (const absPath of walk(join(ROOT, 'packages'))) {
  let content = readFileSync(absPath, 'utf-8')
  const original = content
  scanned++

  for (const [pattern, token] of REPLACEMENTS) {
    content = content.replace(pattern, token)
  }

  if (content !== original) {
    modified++
    if (!DRY_RUN) writeFileSync(absPath, content, 'utf-8')
    const rel = absPath.replace(ROOT + '/', '')
    console.log(`${DRY_RUN ? '[dry] ' : ''}${rel}`)
  }

  UNHANDLED.lastIndex = 0
  for (const match of content.matchAll(UNHANDLED)) {
    const line = content.slice(0, match.index).split('\n').length
    unhandled.push({ file: absPath.replace(ROOT + '/', ''), line, value: match[0] })
  }
}

console.log(`\nScanned : ${scanned} files`)
console.log(`Modified: ${modified} files`)

if (unhandled.length > 0) {
  console.warn('\nUnhandled arbitrary values (fix manually):')
  for (const { file, line, value } of unhandled) {
    console.warn(`  ${file}:${line}: ${value}`)
  }
  process.exit(1)
}
```

- [ ] **Step 2: Run dry-run to preview changes**

```bash
node scripts/migrate-design-tokens.js --dry-run 2>&1 | tail -30
```

Expected: a list of files that will be modified, followed by counts. If there are any "Unhandled arbitrary values" — add them to the REPLACEMENTS array in the script before proceeding.

- [ ] **Step 3: Run the migration**

```bash
node scripts/migrate-design-tokens.js
```

Expected: files listed, no "Unhandled" section. Exit code 0.

- [ ] **Step 4: Fix any remaining unhandled values manually**

If Step 3 printed unhandled values, open each file and replace the value using the token map in `docs/superpowers/specs/2026-04-16-design-system-enforcement-design.md`. If the value is genuinely new (not in the spec), add a CSS variable for it following the pattern in Task 1 and list it in `tailwind.config.ts`.

- [ ] **Step 5: Run lint — expect zero arbitrary-value errors**

```bash
bun turbo lint
```

Expected: 0 `tailwindcss/no-arbitrary-value` errors. If any remain, fix them manually using the token names.

- [ ] **Step 6: Run typecheck — expect no regressions**

```bash
bun turbo typecheck
```

Expected: 0 TypeScript errors.

- [ ] **Step 7: Delete migration script and commit everything**

```bash
rm scripts/migrate-design-tokens.js
git add -A
git commit -m "feat: migrate all hardcoded Tailwind arbitrary values to design system tokens

Replace [#hex] with named tokens (canvas, fg-primary, brand, etc.)
Replace [rgba(...)] with overlay/N opacity modifier syntax
All zones now use CSS variable-backed semantic tokens that switch with theme"
```

---

## Self-review checklist

- [x] **Token definitions** — Task 1 adds all tokens from the spec's hex and rgba migration maps
- [x] **Light/dark switching** — `:root` and `.dark` overrides cover all theme-switching tokens; static tokens (brand, status) only in `:root`
- [x] **@config wiring** — Task 2 applies `@config` to all 11 zones that have `globals.css` (`web-agents` lacks one, skip)
- [x] **ESLint** — Task 3 installs and configures `eslint-plugin-tailwindcss`; `tailwindcss/classnames-order` disabled to avoid Prettier conflicts
- [x] **Lefthook** — Task 4 adds `design-tokens` command as a parallel pre-commit check
- [x] **Migration** — Task 5 uses a pattern map that matches all known values from the codebase scan; dry-run step surfaces any gaps before applying
- [x] **`success-ds` naming** — avoids CSS variable collision with existing `--color-bg-success` shadcn token
- [x] **Delivery order** — each task is independently committable and leaves the codebase in a working state
