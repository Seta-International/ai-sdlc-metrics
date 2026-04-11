# Future — Design System

> **For AI agents:** Read this file before any visual or UI decision. All font choices, colors,
> spacing, radii, motion, and component rules are defined here. Do not deviate without explicit
> user approval. In QA mode, flag any code that does not match these specifications.

---

## 1. Product Context

| Field                   | Value                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| **What it is**          | Agent-native enterprise OS — replaces fragmented HR/Time/Hiring/Projects/Finance tools       |
| **Who it's for**        | SETA (300+ person IT outsourcing company) as customer zero; target: Vietnamese SMEs + global |
| **Space/industry**      | Project-based IT outsourcing / professional services ERP                                     |
| **Project type**        | Web app — data-dense dashboard + transactional forms across 11 zones                         |
| **Competing reference** | Linear, Notion (quality bar) — not SAP, not legacy ERP gray                                  |

### Primary Personas (optimize in this order)

| Persona                    | Primary screens                              | What they care about                  |
| -------------------------- | -------------------------------------------- | ------------------------------------- |
| **Project Manager (PM)**   | Project dashboard, resource allocation, risk | Health at a glance, action speed      |
| **Delivery Lead / COO**    | Executive dashboard, utilization reports     | Margins, pipeline vs. capacity        |
| **Finance / Accounting**   | Billing, invoices, payroll, budget           | Accuracy, auditability, cash flow     |
| **HR / Talent**            | People, hiring pipeline, bench               | Skills inventory, compliance          |
| **Developer / Consultant** | Timesheet entry, task list, schedule         | Speed, minimum clicks, clear feedback |

---

## 2. Aesthetic Direction

- **Direction:** Industrial / Engineering-Modern
- **Decoration level:** Minimal — typography and data do all the work
- **Mood:** Authoritative, inspectable, fast. A system built by engineers who respect data.
  Not a chatbot UI. Not legacy ERP gray. Closer to "Vercel dashboard" than "Salesforce".

### Design Philosophy

The core product promise is _governed agent work on canonical data_. The visual language
must make that legible — not hide it behind a magical assistant persona. Every action surface
should feel **accountable and inspectable**.

> **AI rule:** When generating UI, optimize first for clarity and speed for the personas
> above, not for visual novelty. Every pixel must help users see data, take action, or
> understand state.

---

## 3. Typography

### Font Families

| Role                    | Font         | Rationale                                                                                                                                                                       |
| ----------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Display / UI / Body** | `Geist`      | Engineering credibility. Excellent legibility at small sizes, strong tabular number support. Distinct from the Inter/Roboto commodity SaaS baseline. Open-source (Vercel, OFL). |
| **Code / Monospace**    | `Geist Mono` | Same family, consistent feel. Used for code, data values, IDs, tabular numbers.                                                                                                 |

**Loading:** Google Fonts CDN or Bunny Fonts for privacy.

```html
<link
  href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500&display=swap"
  rel="stylesheet"
/>
```

**Font blacklist (never use):** Papyrus, Comic Sans, Lobster, Impact, Courier New (body),
Bradley Hand, Brush Script, Hobo, Trajan, Bleeding Cowboys.

**Overused (never use as primary):** Inter, Roboto, Arial, Helvetica, Open Sans, Lato,
Montserrat, Poppins, Raleway.

### Type Scale

| Token           | Size | Weight  | Usage                                        |
| --------------- | ---- | ------- | -------------------------------------------- |
| `font-size-xs`  | 11px | 500     | Micro captions, agent strip, badge labels    |
| `font-size-sm`  | 12px | 500/600 | Table headers (uppercase + tracking), labels |
| `font-size-md`  | 14px | 400     | Body text default, form inputs, table cells  |
| `font-size-lg`  | 16px | 500     | Card titles, tab labels                      |
| `font-size-xl`  | 20px | 600     | Page titles                                  |
| `font-size-2xl` | 24px | 600     | Section headings                             |
| `font-size-3xl` | 30px | 700     | KPI metric values, hero numbers              |

```css
/* CSS custom properties */
--font-family-body: 'Geist', -apple-system, system-ui, sans-serif;
--font-family-mono: 'Geist Mono', 'Fira Code', monospace;

--font-size-xs: 11px;
--font-size-sm: 12px;
--font-size-md: 14px;
--font-size-lg: 16px;
--font-size-xl: 20px;
--font-size-2xl: 24px;
--font-size-3xl: 30px;

--font-weight-regular: 400;
--font-weight-medium: 500;
--font-weight-semibold: 600;
--font-weight-bold: 700;

--line-height-tight: 1.25;
--line-height-normal: 1.5;
--line-height-relaxed: 1.75;
```

### Typography Rules (for AI)

- Default body text: `font-size-md` (14px). Only use `font-size-lg` for key card titles or tab labels.
- Never create custom font-size values (no 13px, 17px) — only use defined tokens.
- Table headers: `font-size-sm` + `font-weight-semibold` + `text-transform: uppercase` + `letter-spacing: 0.05em`.
- KPI/metric values: `font-size-3xl` + `font-weight-bold` + `font-variant-numeric: tabular-nums`.
- All data values, IDs, prices, timestamps: `font-family-mono` + `font-variant-numeric: tabular-nums`.

---

## 4. Color System

**Approach:** Restrained — one accent color + semantic colors. Color signals state and
hierarchy; it is never decorative.

### CSS Custom Properties

```css
/* ── Primitive tokens ── */
--color-navy-950: #0a0f1e;
--color-navy-900: #0f1b2d;
--color-navy-800: #1e3a5f;
--color-navy-700: #1d4ed8; /* primary accent */
--color-navy-600: #2563eb; /* accent hover */
--color-navy-500: #3b82f6; /* dark mode accent */
--color-navy-100: #dbeafe;
--color-navy-50: #eff6ff;

--color-gray-950: #0f172a;
--color-gray-900: #1e293b;
--color-gray-800: #334155;
--color-gray-700: #475569;
--color-gray-600: #64748b;
--color-gray-500: #94a3b8;
--color-gray-400: #cbd5e1;
--color-gray-300: #e2e8f0;
--color-gray-200: #f1f3f6;
--color-gray-100: #f8f9fb;
--color-white: #ffffff;

--color-green-700: #15803d;
--color-green-600: #16a34a;
--color-green-100: #dcfce7;
--color-amber-700: #b45309;
--color-amber-600: #d97706;
--color-amber-100: #fef3c7;
--color-red-700: #b91c1c;
--color-red-600: #dc2626;
--color-red-100: #fee2e2;

/* ── Semantic tokens — light mode ── */
--color-bg-page: #f8f9fb; /* page background (warm-cool off-white) */
--color-bg-surface: #ffffff; /* cards, panels */
--color-bg-subtle: #f1f3f6; /* table row hover bg, section backgrounds */
--color-bg-hover: #f1f3f6;
--color-bg-active: #eff6ff;

--color-text-primary: #0f1b2d;
--color-text-secondary: #475569;
--color-text-muted: #64748b;
--color-text-disabled: #94a3b8;
--color-text-inverse: #ffffff;
--color-text-accent: #1d4ed8;

--color-border-subtle: #e2e8f0;
--color-border-strong: #cbd5e1;
--color-border-accent: #1d4ed8;

--color-accent: #1d4ed8; /* primary CTA, active states, links */
--color-accent-hover: #2563eb;
--color-accent-subtle: #eff6ff;
--color-accent-muted: #dbeafe;

/* ── Status semantic tokens ── */
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

/* ── Sidebar tokens ── */
--color-sidebar-bg: #0f1b2d; /* deep navy — NOT generic charcoal */
--color-sidebar-text: #94a3b8;
--color-sidebar-hover: rgba(255, 255, 255, 0.07);
--color-sidebar-active: rgba(29, 78, 216, 0.25);
--color-sidebar-accent: #3b82f6;
```

### Dark Mode

```css
[data-theme='dark'] {
  --color-bg-page: #0a0f1e; /* deep navy — NOT generic #18181B */
  --color-bg-surface: #111827;
  --color-bg-subtle: #1f2937;
  --color-bg-hover: #1f2937;
  --color-bg-active: rgba(59, 130, 246, 0.15);

  --color-text-primary: #f1f5f9;
  --color-text-secondary: #cbd5e1;
  --color-text-muted: #94a3b8;
  --color-text-disabled: #475569;

  --color-border-subtle: #1e293b;
  --color-border-strong: #334155;

  --color-accent: #3b82f6;
  --color-accent-hover: #2563eb;
  --color-accent-subtle: rgba(59, 130, 246, 0.1);
  --color-accent-muted: rgba(59, 130, 246, 0.15);

  --color-bg-success: rgba(22, 163, 74, 0.1);
  --color-text-success: #4ade80;
  --color-bg-warning: rgba(217, 119, 6, 0.1);
  --color-text-warning: #fcd34d;
  --color-bg-danger: rgba(220, 38, 38, 0.1);
  --color-text-danger: #fca5a5;

  --color-sidebar-bg: #080d1a;
}
```

### Color Rules (for AI)

- Use status colors **only** for status (badges, toasts, alerts) — never for decoration.
- Never place text on a colored background without contrast ≥ 4.5:1 (normal text) or ≥ 3:1 (large headings).
- Accent (#1D4ED8) is for one primary CTA per view. Do not repeat it decoratively.
- The sidebar is always `--color-sidebar-bg` (#0F1B2D). Never change the sidebar background.
- Dark mode uses `#0A0F1E` (deep navy) as page background — not a gray. This is intentional.
- Never use purple, violet, or gradient accents. These are explicitly banned.

---

## 5. Spacing

**Base unit:** 4px grid.
**Density:** Compact — ERP users want data, not air. Target Linear/GitHub density, not Notion margins.

```css
--space-0: 0px;
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;
--space-12: 48px;
--space-16: 64px;

/* Semantic spacing */
--space-inset-sm: 8px 12px; /* padding inside small components (badges, small buttons) */
--space-inset-md: 12px 16px; /* padding inside standard components (inputs, buttons) */
--space-inset-lg: 16px 24px; /* padding inside cards, panels */

--space-stack-xs: 4px; /* tightest vertical gap (label → value) */
--space-stack-sm: 8px; /* label → input, hint below input */
--space-stack-md: 16px; /* between form fields */
--space-stack-lg: 24px; /* between sections within a page */
--space-stack-xl: 32px; /* between major page sections */

--space-inline-sm: 8px; /* gap between icon and label in a button */
--space-inline-md: 16px; /* gap between items in a row */
--space-inline-lg: 24px; /* gap between columns in a form layout */
```

### Spacing Rules (for AI)

- Vertical spacing between related elements (label → input → hint): `space-stack-sm`.
- Section spacing between large blocks: `space-stack-xl`.
- Never invent pixel values. Find the closest token.
- Table row padding: `12px 12px` (`space-3`).
- Card body padding: `20px` (`space-5`).
- Page content padding: `20px 24px` (`space-5 / space-6`).

---

## 6. Border Radius

```css
--radius-sm: 4px; /* inline badges inside tables, tight elements */
--radius-md: 6px; /* buttons, inputs, dropdowns */
--radius-lg: 8px; /* cards, panels */
--radius-xl: 12px; /* app shell (outermost wrapper), modals */
--radius-pill: 9999px; /* status badges, avatars, pills */
```

**Rules:**

- Buttons and inputs: `radius-md`.
- Cards: `radius-lg`.
- Status badges: `radius-pill`.
- Do not use arbitrary values like `10px`, `14px`, `20px`.

---

## 7. Shadows

```css
--shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
--shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
--shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.05);
```

**Rules:**

- Cards: `shadow-sm`.
- Modals and dropdowns: `shadow-lg`.
- Never use `box-shadow` for decorative purposes — only for elevation.
- Dark mode: multiply opacity by 3-4x (dark surfaces make shadows less visible).

---

## 8. Motion

```css
--motion-fast: 100ms; /* micro-interactions: hover states, badge appearance */
--motion-normal: 150ms; /* standard transitions: button state, input focus */
--motion-slow: 250ms; /* larger transitions: modal/drawer open, theme switch */

--ease-in: cubic-bezier(0.4, 0, 1, 1);
--ease-out: cubic-bezier(0, 0, 0.2, 1);
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
```

**Approach:** Minimal-functional only.

**Rules:**

- State changes (hover, focus, active): `motion-fast` + `ease-out`.
- Panel/drawer open/close: `motion-slow` + `ease-out` (open), `ease-in` (close).
- No decorative animations. No scroll-driven effects. No entrance animations on data tables.
- Use `prefers-reduced-motion` to disable all transitions for users who request it.

---

## 9. Layout

### App Shell

Every screen lives inside the same shell. Do not invent new global navigation patterns.

```
┌─────────────────────────────────────────────────┐
│  Topbar (48px) — brand · breadcrumb · search · user  │
├─────────────────────────────────────────────────┤
│  Agent context strip (28px) — agent · data · authority  │ ← unique to Future
├──────────────┬──────────────────────────────────┤
│              │                                  │
│  Sidebar     │  Content area                    │
│  (220px)     │  (12-col grid, 24px gutters)     │
│              │                                  │
└──────────────┴──────────────────────────────────┘
```

**Agent context strip:** A slim persistent band below the topbar, always visible. Shows:

- Which agent is active (e.g., `Agent: Kernel v2.1`)
- Data freshness (`Data: live` or `snapshot 5m ago`)
- Current authority scope (`Authority: read · dept: Engineering`)
- Link to audit log

This is the visual anchor for Future's "governed agent work" promise. It differentiates
the product from generic ERP and makes the kernel's authority model visible to users.

### Breakpoints

| Breakpoint | Width      | Layout                                                      |
| ---------- | ---------- | ----------------------------------------------------------- |
| Mobile     | < 768px    | 1 column; sidebar → top/bottom drawer                       |
| Tablet     | 768–1024px | sidebar collapsible (icon-only collapsed); 2-column layouts |
| Desktop    | ≥ 1024px   | fixed 220px sidebar + flexible content grid                 |

### Grid

- Desktop: 12 columns, 24px gutters, `max-width: 1440px` content area.
- Content padding: `20px 24px`.
- Dashboard metrics row: 4 columns (3 on tablet, 2 on mobile stacked).

### Layout Rules (for AI)

- When designing a new page, always place it inside the existing shell (sidebar + topbar + agent strip). Do not invent new global navigation layouts.
- On desktop, prefer 2–3 columns of content. On mobile, 1 column only (stacked).
- Do not create horizontal scroll for primary flows (except data tables on small screens).
- Cross-zone navigation uses `<a>` tags (hard reload), never `next/link`.

---

## 10. Component Specifications

Components are classified by level. Compose higher-level patterns from lower-level ones.

| Level         | Type                     | Examples                                                            |
| ------------- | ------------------------ | ------------------------------------------------------------------- |
| 1 (Primitive) | Built from tokens        | Text, Icon, Box, Stack, Button, Input, Checkbox                     |
| 2 (Core)      | Commonly reused          | Card, Table, Form, Modal, Tabs, SidebarNav, Topbar                  |
| 3 (Pattern)   | Task-oriented assemblies | ProjectOverviewHeader, ResourceAllocationBoard, TimesheetEntryPanel |

### 10.1 Buttons

| Variant       | Usage                             | Rule                                        |
| ------------- | --------------------------------- | ------------------------------------------- |
| `primary`     | Main CTA in a view                | One per logical section or modal            |
| `secondary`   | Non-destructive secondary actions | Default for most toolbar actions            |
| `ghost`       | Low-emphasis, filter/view actions | Use in dense toolbars and table row actions |
| `destructive` | Delete, archive, irreversible     | Must be preceded by a confirmation modal    |

States: `default` · `hover` · `active` · `disabled` · `loading`

```css
/* Button base */
padding: 8px 12px;           /* space-inset-sm */
font-size: var(--font-size-sm);
font-weight: var(--font-weight-medium);
border-radius: var(--radius-md);
transition: all var(--motion-fast) var(--ease-out);

/* Sizes */
.btn-sm: padding 4px 8px, font-size 11px
.btn-md: padding 8px 12px, font-size 12px  (default)
.btn-lg: padding 12px 20px, font-size 14px
```

**Rules:** Always include an accessible label. Icons alone are never enough. One primary
button per logical section.

### 10.2 Inputs & Forms

Components: `TextInput`, `NumberInput`, `Textarea`, `Select`, `MultiSelect`,
`DatePicker`, `Checkbox`, `RadioGroup`, `Toggle`.

**Form layout:**

- Label above input, with `space-stack-xs` (4px) gap.
- Help/validation text below input, with `space-stack-xs` (4px) gap.
- On desktop: 2-column grid for dense admin forms; 1 column on mobile.
- Group related fields into named sections with a section title and separator.

**Rules:**

- Never omit labels. Placeholders are not labels.
- Validation error: red border (`var(--color-red-600)`) + error text in `color-text-danger` below.
- Focus ring: `box-shadow: 0 0 0 3px var(--color-accent-muted)`.

### 10.3 Tables

ERP is table-heavy. Tables are first-class components with these features:

| Column type           | Alignment | Font                      |
| --------------------- | --------- | ------------------------- |
| Text (name, label)    | Left      | body                      |
| Numeric (hours, $, %) | Right     | Geist Mono + tabular-nums |
| Date                  | Right     | Geist Mono                |
| Status                | Left      | badge component           |
| Actions               | Right     | ghost buttons             |

**Table header:** `font-size-sm` + `font-weight-semibold` + `uppercase` + `letter-spacing: 0.05em` + `color-text-muted`.

**Row height:** Compact — 44px minimum (touch target). Do not inflate with extra padding.

**Controls:** Search (left), Filters (left), Column visibility (right), Export (right).

**Rules:**

- Use Table for any dataset > 7 rows or where sorting/filtering is needed.
- On mobile: convert to card list where each card = one row (key fields only).
- Row hover: `background: var(--color-bg-hover)`.

### 10.4 Cards

Structure: `header` (title + optional badge) · `body` (key info) · `footer` (actions/chips).

Variants:

| Variant       | Usage                                         |
| ------------- | --------------------------------------------- |
| `Card/metric` | KPI tiles (Utilization, Revenue, Bench count) |
| `Card/entity` | Project, client, resource summary blocks      |
| `Card/list`   | List of items in a panel                      |

**Rules:** One clear primary action per card. No action overload in card footers.

### 10.5 Navigation

- `SidebarNav`: icons + labels, supports one level of nesting. Background: `--color-sidebar-bg`.
- `Tabs`: sub-sections within a page (Overview, Tasks, Financials, Risks). Never nest tabs inside tabs.
- `Breadcrumbs`: deep hierarchy pages (Client → Project → Sprint).

**Rules:**

- Never place more than one navigation pattern at the same level.
- New routes live in the sidebar. Sub-sections within a page use Tabs.

### 10.6 Overlays: Modals, Drawers, Toasts

| Component | When to use                                                                                |
| --------- | ------------------------------------------------------------------------------------------ |
| `Modal`   | Short, focused tasks that must block context (create invoice, confirm delete)              |
| `Drawer`  | View/edit details without leaving main view (edit resource allocation, project side panel) |
| `Toast`   | Transient success/info messages only — never for critical errors                           |

**Rules:**

- Any destructive action: modal with explicit copy + destructive button.
- Never open modal inside modal. Limit to one open modal at a time.
- Toast duration: 4s auto-dismiss for success/info. Errors stay until dismissed.

### 10.7 Empty States, Skeletons, Errors

**Empty state structure:**

```
[Icon/illustration in bg-subtle box]
[Title — concise, specific to this context]
[Description — what it means and what to do]
[Primary action button]
```

**Skeleton:** Matches the structural shape of the final content (not a generic spinner).

**Error messages:** Specific and actionable. "Could not load projects. Retry or contact support."
Never generic. Never "Something went wrong."

**Rules:**

- For every new list/table/card view, define the empty state and skeleton loading state.

---

## 11. Page Blueprints (Level 3 Patterns)

### 11.1 Executive Dashboard

```
[Topbar] [Agent strip]
[Page header: title + date + action buttons]
[4× Metric cards: Utilization · Active Projects · Bench Count · MRR]
[2-col: Project health table (left, 60%) | Overdue invoices + upcoming milestones (right, 40%)]
```

**AI rule:** Always surface at-risk items prominently — projects over budget, late invoices,
below-threshold utilization. These are the most important things on this page.

### 11.2 Project Detail

```
[Page header: project name · client · status badge · budget % · PM · Edit / Archive buttons]
[Tabs: Overview · Tasks · Team · Financials · Risks]
[Overview tab: 4 KPI tiles · timeline bar · recent activity feed]
```

**AI rule:** Place primary project actions ("Log Time", "Add Milestone") near top-right
of the content area.

### 11.3 Resource Allocation

```
[Filter row: role · skill · client · project · billable/non-billable]
[Heatmap grid: rows = people · columns = weeks · cells = allocation %]
[Color intensity = allocation level (not multiple hues) — light = low · dark = overloaded]
```

**AI rule:** Use single-hue intensity for allocation level. Colorblind-safe — do not use
green/red for low/high. Use the accent blue palette at different opacities.

### 11.4 Timesheet Entry

```
[Week selector + status + total hours]
[Action row: ← Prev week · Duplicate last week · Submit for approval]
[Grid: rows = projects · columns = Mon–Fri · cells = editable hours]
[Totals row: daily totals + weekly total]
```

**AI rule:** Reduce cognitive load — no deep navigation, only essential fields. Fast
tab-navigation between cells. Monospace font for hour values.

### 11.5 Invoice / Billing List

```
[Page header: Billing · date range picker · + New invoice]
[Filter: All · Draft · Sent · Overdue · Paid]
[Table: invoice # · client · project · amount · due date · status · actions]
[Footer: page totals — outstanding balance]
```

---

## 12. Accessibility

| Rule                                  | Value                                                              |
| ------------------------------------- | ------------------------------------------------------------------ |
| Text contrast (normal)                | ≥ 4.5:1                                                            |
| Text contrast (large headings ≥ 18px) | ≥ 3:1                                                              |
| Body text alignment                   | Left-aligned                                                       |
| Line length                           | 45–72 characters                                                   |
| Touch targets (mobile)                | ≥ 44×44px                                                          |
| Keyboard navigation                   | All interactive elements reachable via Tab                         |
| Focus styles                          | Visible ring: `box-shadow: 0 0 0 3px var(--color-accent-muted)`    |
| Icons                                 | Always include accessible label via text, `aria-label`, or tooltip |

---

## 13. AI Integration Rules

### Token Usage (strict)

```
Padding inside components  → inset tokens (space-inset-*)
Vertical gap between items → stack tokens (space-stack-*)
Horizontal gap             → inline tokens (space-inline-*)
```

Each token category has a single purpose. Do not reuse spacing tokens for radius or
font-size.

If you find a hardcoded value:

1. Find the closest matching token in this document.
2. Replace the hardcoded value with the token.
3. Flag any case where a new token might be needed.

### What AI Must Not Do

- Introduce new color hex codes, font families, or arbitrary pixel values.
- Create new layout primitives (random sidebars, stacked navs) that conflict with the defined shell.
- Use purple, violet, or gradient accents anywhere in the UI.
- Bypass existing Level 1/2 components to hand-roll buttons, inputs, or tables.
- Use `inter`, `roboto`, `arial`, `helvetica`, `system-ui` as the primary font family.
- Design a screen without also defining its empty state and skeleton loader.
- Use generic error copy ("Something went wrong"). Always be specific.

### Component Documentation AI Prompts

Use these as prompts when generating code for components:

```
"Generate a ProjectTable component using data-table tokens and patterns defined in DESIGN.md.
Numeric columns must use Geist Mono + tabular-nums. Status column uses badge variants."

"Audit spacing and color tokens in TimesheetForm and list any hardcoded values.
Replace with the closest token from DESIGN.md."

"Generate the empty state for the ResourceAllocationBoard. Include icon, title, description,
and primary action. Follow the empty state structure in DESIGN.md §10.7."
```

---

## 14. Decisions Log

| Date       | Decision                         | Rationale                                                                                      |
| ---------- | -------------------------------- | ---------------------------------------------------------------------------------------------- |
| 2026-04-11 | Geist as primary font            | Engineering credibility, tabular number support, distinct from Inter/Roboto commodity baseline |
| 2026-04-11 | Restrained color (1 accent)      | ERP users work in the tool 8 hrs/day — color should signal state, not fatigue                  |
| 2026-04-11 | Deep navy sidebar (#0F1B2D)      | Anchors the chrome, makes content-area data the visual foreground                              |
| 2026-04-11 | Dark mode bg: #0A0F1E (not gray) | Premium authority feel — matches "canonical data authority" product positioning                |
| 2026-04-11 | Agent context strip              | Makes governed agent work visible at all times — unique product differentiator                 |
| 2026-04-11 | Compact spacing density          | ERP users optimize for information density, not whitespace aesthetics                          |
| 2026-04-11 | No purple/gradient accents       | Explicitly anti-slop. These patterns appear in 90% of generic SaaS products.                   |
| 2026-04-11 | Initial system created           | Generated by /design-consultation from product vision, CLAUDE.md, and user brief               |
| 2026-04-11 | App switcher as command palette  | 11 zones need fast switching; a grid/drawer is slower than ⌘K search                           |
| 2026-04-11 | Agent chat as right drawer       | Keeps data context visible while conversing with the agent                                     |
| 2026-04-11 | Tool call cards inline in chat   | Transparency — user sees exactly what the agent did, not just the answer                       |

---

## 15. App Switcher

The platform has 11 zones. Users switch between them frequently. The switcher must be fast and keyboard-first.

### Pattern: Command Palette + Grid Hybrid

- **Trigger:** Click the brand mark (top-left "F") OR press `⌘K` / `Ctrl+K`
- **Overlay:** Full-screen dimmed backdrop, centered modal, `max-width: 560px`
- **Two tabs:** "Apps" (module grid) and "Search" (global search across all data)
- On "Apps" tab: 4-column icon grid of all 11 modules + Settings
- On "Search" tab: inline search input with live results (people, projects, clients, tasks)
- Current active module is highlighted with accent border

### Module Grid Layout

```
┌────────────────────────────────────────┐
│  ⌘K   Switch app or search…       [✕] │
│  ─────────────────────────────────────│
│  [Apps]  [Search]                      │
│  ─────────────────────────────────────│
│  [👥 People]  [⏱ Time]   [💼 Hiring] [📊 Perf]  │
│  [📁 Projects][💰 Finance][🎯 Goals] [📈 Insights]│
│  [🤖 Agents]  [📋 Planner][⚙ Admin]             │
│  ─────────────────────────────────────│
│  Currently in: Projects               │
└────────────────────────────────────────┘
```

### Module Tile Spec

```
width: 120px;  height: 80px
background: var(--color-bg-subtle)
border: 1px solid var(--color-border-subtle)
border-radius: var(--radius-lg)
padding: var(--space-4)
display: flex; flex-direction: column; align-items: center; gap: var(--space-2)
cursor: pointer
transition: all var(--motion-fast) var(--ease-out)

/* Active module */
border-color: var(--color-accent)
background: var(--color-accent-subtle)

/* Hover */
background: var(--color-bg-hover)
box-shadow: var(--shadow-sm)
```

Icon: 24px, neutral (not colored per module — color is reserved for status).
Label: `font-size-xs`, `font-weight-medium`, centered.

### CSS Custom Properties

```css
--app-switcher-width: 560px;
--app-switcher-grid: repeat(4, 1fr);
--app-tile-size: 80px;
```

### Rules (for AI)

- Trigger with `⌘K` (mac) and `Ctrl+K` (windows/linux). Do not hide it behind a secondary menu.
- Cross-zone navigation uses `<a>` (hard reload), not `router.push`.
- The switcher closes on ESC, on tile click, and on backdrop click.
- Show the current zone name at the bottom: "Currently in: Projects."
- Do not use colored module icons — all modules use the same muted icon color.
- The Search tab in the switcher is the **global search** — it searches across all zones via the `apps/api` tRPC `search.*` procedures, never by querying zones directly.

---

## 16. Agent UI / UX

The `agents` module surfaces in two ways: the **Agent Context Strip** (always visible, defined in §9) and the **Agent Panel** (on-demand chat + session management). This section defines the panel.

### 16.1 Agent Panel (Right Drawer)

- **Trigger:** Click the robot icon (🤖) in the topbar, or navigate to `/agents`
- **Width:** 420px fixed drawer from the right edge, overlaying content with a dimmed backdrop
- **Header:** Agent name + version, session ID (truncated UUID), status dot (live/idle/error)
- **Body:** Scrollable message thread
- **Footer:** Compose area — textarea (auto-grows, max 4 lines) + Send button + voice icon

```
┌─────────────────────────────────────────┐
│ 🤖 Kernel Agent v2.1  · #01926f…  ● live │ [✕]
│ ─────────────────────────────────────── │
│                                         │
│  [USER] 09:14                           │
│  What's the bench count this week?      │
│                                         │
│  [AGENT] 09:14                          │
│  The bench count is 8 engineers.        │
│  ┌─────────────────────────────────┐    │
│  │ 🔧 Tool: people_query_bench      │    │
│  │ Auth: read · dept: all          │    │
│  │ Result: 8 (↑2 vs last week)     │    │
│  │ 12ms · 2026-04-11T09:14:03Z    │    │
│  └─────────────────────────────────┘    │
│                                         │
│  [AGENT STREAMING] 09:15 ▌              │
│                                         │
│ ─────────────────────────────────────── │
│  Ask anything about your organization…  │
│                                    [→]  │
└─────────────────────────────────────────┘
```

### 16.2 Message Types

| Type               | Visual treatment                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------- |
| **User message**   | Right-aligned, `bg-accent-subtle`, `border-radius: radius-lg radius-lg radius-sm radius-lg` |
| **Agent response** | Left-aligned, `bg-surface`, `border: 1px solid border-subtle`                               |
| **Tool call card** | Inset card inside agent message — see §16.3                                                 |
| **System message** | Centered, `font-size-xs`, `color-text-muted`, no bubble                                     |
| **Error message**  | Left-aligned, `bg-danger`, `color-text-danger`                                              |
| **Streaming**      | Left-aligned agent bubble with animated `▌` cursor at end                                   |

### 16.3 Tool Call Card

The most distinctive UI element in Future. Every tool call the agent makes is shown inline as a collapsed card. Transparency is the feature.

```
┌────────────────────────────────────────────┐
│ 🔧  people_query_bench          [▼ expand] │
│ Authority: read · tenant: seta             │
│ 12ms · 2026-04-11T09:14:03Z               │
└────────────────────────────────────────────┘

Expanded:
┌────────────────────────────────────────────┐
│ 🔧  people_query_bench          [▲ collapse]│
│ ──────────────────────────────────────────│
│ Input                                      │
│ { "week": "2026-W15", "status": "bench" }  │
│ ──────────────────────────────────────────│
│ Result                                     │
│ { "count": 8, "delta": +2, "people": […] } │
│ ──────────────────────────────────────────│
│ Authority: read · dept: all                │
│ Audit: 01926f-abc123 → view log            │
└────────────────────────────────────────────┘
```

**Card spec:**

```css
background: var(--color-bg-subtle);
border: 1px solid var(--color-border-subtle);
border-left: 3px solid var(--color-accent);
border-radius: var(--radius-md);
padding: var(--space-3) var(--space-4);
font-size: var(--font-size-xs);
font-family: var(--font-family-mono); /* input/output values */
```

Header row: tool name (`font-weight-medium`, `font-size-sm`) + timing (`font-size-xs`, `color-text-muted`) + expand toggle.
Input/output values: `font-family-mono`, `font-size-xs`, `color-text-secondary`.
Authority line: `badge badge-neutral` for each scope token.
Audit link: `color-text-accent`, underline on hover.

### 16.4 Agent Session List (full `/agents` page)

```
[Page header: Agent Sessions]
[Filter: All · Active · Completed · Errors]
[Table:]
  Session ID | Agent | User | Channel | Started | Messages | Status | Actions
```

| Column     | Type                                  | Width |
| ---------- | ------------------------------------- | ----- |
| Session ID | `font-family-mono`, truncated UUID    | 140px |
| Agent      | text                                  | 140px |
| User       | avatar + name                         | 160px |
| Channel    | badge (web / teams / slack / trigger) | 100px |
| Started    | relative time                         | 120px |
| Messages   | number, right-aligned                 | 80px  |
| Status     | badge (active / completed / error)    | 100px |
| Actions    | ghost buttons (view, export)          | 80px  |

### 16.5 Session Detail (drawer or full page)

Opens when clicking a session row. Shows:

1. **Header:** session metadata (agent, user, channel, duration, message count)
2. **Exposure contract panel** (collapsible): what access the agent was granted
3. **Full message thread** — identical rendering to the Agent Panel (§16.1)
4. **Audit trail** — every tool call in chronological order, expandable

### 16.6 Exposure Contract Panel

Shows the agent's current access grant. Surfaces in session detail and in the agent strip tooltip.

```
┌──────────────────────────────────────────────────┐
│ Exposure Contract · Kernel Agent v2.1            │
│ ──────────────────────────────────────────────── │
│ Scope      read-only                             │
│ Modules    people, time, projects                │
│ Dept       Engineering                           │
│ Expires    2026-04-11T18:00:00Z (6h remaining)  │
│ Granted by Canh Ta · 2026-04-11T12:00:00Z       │
│ ──────────────────────────────────────────────── │
│ Tools allowed (3)                                │
│  ✓ people_query_bench                            │
│  ✓ projects_list_active                          │
│  ✓ time_summary_utilization                     │
└──────────────────────────────────────────────────┘
```

**Spec:**

- Background: `color-bg-surface`, border: `1px solid color-border-subtle`
- Scope/module/dept rows: label (`color-text-muted`, `font-size-sm`) + value (`color-text-primary`, `font-size-sm`)
- Expiry with time remaining: use `badge-warning` if < 1h remaining, `badge-danger` if expired
- Tool list: `font-family-mono`, `font-size-xs`, checkmark in `color-text-success`

### 16.7 Channel Badges

| Channel         | Badge color     | Label   |
| --------------- | --------------- | ------- |
| Web (panel)     | `badge-accent`  | Web     |
| Microsoft Teams | `badge-accent`  | Teams   |
| Slack           | `badge-neutral` | Slack   |
| Event trigger   | `badge-warning` | Trigger |
| API             | `badge-neutral` | API     |

### Rules (for AI)

- Every agent response that involved tool calls MUST show tool call cards inline. Never hide them.
- Tool call cards are collapsed by default (show name + timing). Expand on click.
- The audit link in each card must point to a real `audit_event` record (never stub it).
- Streaming responses show an animated `▌` cursor — use CSS animation, not a spinner.
- Never auto-scroll to the bottom if the user has scrolled up (they are reading history).
- The compose textarea grows to `max-height: 120px` then scrolls — do not use a fixed single-line input.
- User messages are right-aligned. Agent messages are left-aligned. Do not reverse this.
- Do not use avatar images for the agent — use a colored icon mark (🤖 or a styled square).
- The agent panel is a drawer, not a modal. It does not block the main content backdrop entirely — use `opacity: 0.4` on the backdrop, not `1`.
- Error states in the agent panel: show the error in the message thread as an error bubble, plus a "Retry" button. Do not show a page-level error toast for agent failures.
- Exposure contract is always visible in session detail. It is never hidden behind a "show more" toggle — users must be able to see it to trust the agent.
