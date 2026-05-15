---
version: alpha
name: seta-workspace-design-system
description: "Seta Workspace design language — Linear-inspired: lavender-blue accent (#5e6ad2), rounded-md buttons, surface-ladder depth, weight-400/500/600 Inter type. Three-column AppShell: dark navy left sidebar (collapsible) + white main canvas + right agent panel (toggleable via TopBar Bot button). Lucide React icons. Covers Studio, Timesheet, PMO, Finance modules as separate SPAs sharing one token layer."

colors:
  # Primary — Linear lavender-blue
  primary: "#5e6ad2"
  primary-hover: "#828fff"
  primary-focus: "#5e69d1"
  primary-subtle: "#eef0fb"
  on-primary: "#ffffff"

  # Main canvas — light (admin data views need light backgrounds)
  canvas: "#ffffff"
  canvas-soft: "#f7f8f8"
  canvas-subtle: "#f1f2f4"

  # Text on light canvas
  ink: "#1a1a2e"
  ink-secondary: "#3d3d5c"
  ink-mute: "#62666d"
  ink-subtle: "#8a8f98"

  # Sidebar — dark navy (user decision)
  sidebar-bg: "#1c1e54"
  sidebar-surface-1: "#232558"
  sidebar-surface-2: "#2d2f6b"
  sidebar-hairline: "rgba(255,255,255,0.08)"
  on-sidebar: "#f7f8f8"
  on-sidebar-muted: "#d0d6e0"
  on-sidebar-subtle: "#8a8f98"

  # Agent panel — light, slightly tinted
  agent-bg: "#fafafa"
  agent-surface: "#f1f2f4"

  # Borders (light canvas)
  hairline: "#e5e7eb"
  hairline-strong: "#c8cdd5"
  hairline-input: "#c8cdd5"

  # Elevation shadow base
  shadow-base: "rgba(15, 23, 42, 0.08)"

  # Semantic — status signals across all modules
  success: "#27a644"
  success-soft: "#dcfce7"
  warning: "#d97706"
  warning-soft: "#fef3c7"
  error: "#dc2626"
  error-soft: "#fee2e2"
  info: "#5e6ad2"
  info-soft: "#eef0fb"
  neutral: "#8a8f98"
  neutral-soft: "#f1f2f4"

  # Auth page only
  overlay: "rgba(0,0,0,0.45)"

typography:
  # Display — Inter 600, aggressive negative tracking (Linear)
  display-lg:
    fontFamily: "Inter, 'SF Pro Display', system-ui, -apple-system, sans-serif"
    fontSize: 32px
    fontWeight: 600
    lineHeight: 1.10
    letterSpacing: -0.8px
    fontFeature: "ss01"
  display-md:
    fontFamily: "Inter, 'SF Pro Display', system-ui, -apple-system, sans-serif"
    fontSize: 26px
    fontWeight: 600
    lineHeight: 1.12
    letterSpacing: -0.5px
    fontFeature: "ss01"

  # Headings — Inter 500
  heading-lg:
    fontFamily: "Inter, 'SF Pro Display', system-ui, -apple-system, sans-serif"
    fontSize: 22px
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: -0.4px
    fontFeature: "ss01"
  heading-md:
    fontFamily: "Inter, 'SF Pro Display', system-ui, -apple-system, sans-serif"
    fontSize: 18px
    fontWeight: 500
    lineHeight: 1.30
    letterSpacing: -0.2px
    fontFeature: "ss01"
  heading-sm:
    fontFamily: "Inter, 'SF Pro Display', system-ui, -apple-system, sans-serif"
    fontSize: 15px
    fontWeight: 500
    lineHeight: 1.40
    letterSpacing: -0.1px
    fontFeature: "ss01"

  # Body — Inter 400 (Linear: regular weight)
  body-lg:
    fontFamily: "Inter, 'SF Pro Display', system-ui, -apple-system, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.50
    letterSpacing: -0.05px
    fontFeature: "ss01"
  body-md:
    fontFamily: "Inter, 'SF Pro Display', system-ui, -apple-system, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.50
    letterSpacing: 0
    fontFeature: "ss01"
  body-tabular:
    fontFamily: "Inter, 'SF Pro Display', system-ui, -apple-system, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.40
    letterSpacing: -0.3px
    fontFeature: "tnum"

  # Buttons — Inter 500 (Linear button weight)
  button-md:
    fontFamily: "Inter, 'SF Pro Display', system-ui, -apple-system, sans-serif"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.20
    letterSpacing: 0
    fontFeature: "ss01"
  button-sm:
    fontFamily: "Inter, 'SF Pro Display', system-ui, -apple-system, sans-serif"
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.20
    letterSpacing: 0
    fontFeature: "ss01"

  # Supporting
  caption:
    fontFamily: "Inter, 'SF Pro Display', system-ui, -apple-system, sans-serif"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.40
    letterSpacing: 0
    fontFeature: "tnum"
  eyebrow:
    fontFamily: "Inter, 'SF Pro Display', system-ui, -apple-system, sans-serif"
    fontSize: 11px
    fontWeight: 500
    lineHeight: 1.30
    letterSpacing: 0.4px
    fontFeature: "ss01"
  mono:
    fontFamily: "JetBrains Mono, 'SF Mono', ui-monospace, Menlo, monospace"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.50
    letterSpacing: 0

rounded:
  xs: 4px
  sm: 6px
  md: 8px      # default — buttons, inputs, nav items
  lg: 12px     # cards, dialogs
  xl: 16px     # large modals, panels
  pill: 9999px # status badges and tab toggles ONLY — never buttons

spacing:
  xxs: 2px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px
  huge: 64px

icons:
  library: "lucide-react"
  import: "tree-shaken — import named icons only, never the full bundle"
  size-sm: 14px    # inline icons in badges, captions
  size-md: 16px    # default — nav items, buttons, toolbar
  size-lg: 20px    # topbar actions, section headers
  size-xl: 24px    # empty-state illustrations
  stroke-width: 1.5
  key-icons:
    app-switcher: "LayoutGrid"
    agent-toggle: "Bot"
    sidebar-collapse: "PanelLeft"
    agent-panel-toggle: "PanelRight"
    notification: "Bell"
    user: "CircleUser"
    tenant: "Building2"
    connector: "Plug"
    run: "Play"
    corpus: "BookOpen"
    audit: "ClipboardList"
    timesheet: "Clock"
    pmo: "Kanban"
    finance: "BarChart3"
    close: "X"
    send: "SendHorizonal"
    chevron-left: "ChevronLeft"
    chevron-right: "ChevronRight"
    chevron-down: "ChevronDown"
    search: "Search"
    upload: "Upload"
    download: "Download"
    settings: "Settings"
    logout: "LogOut"

components:
  # --- Buttons (rounded-md — NOT pill) ---
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-md}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
    minHeight: 36px
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-primary-pressed:
    backgroundColor: "{colors.primary-focus}"
  button-secondary:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    border: "1px solid {colors.hairline-strong}"
    typography: "{typography.button-md}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
    minHeight: 36px
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-mute}"
    typography: "{typography.button-sm}"
    rounded: "{rounded.md}"
    padding: "6px 10px"
    minHeight: 32px
  button-on-dark:
    backgroundColor: "rgba(255,255,255,0.10)"
    textColor: "{colors.on-sidebar}"
    border: "1px solid rgba(255,255,255,0.12)"
    typography: "{typography.button-sm}"
    rounded: "{rounded.md}"
    padding: "6px 12px"

  # --- Inputs ---
  text-input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    placeholderColor: "{colors.ink-subtle}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    border: "1px solid {colors.hairline-input}"
    minHeight: 36px
  text-input-focused:
    outline: "2px solid {colors.primary-focus}"
    outlineOffset: "0px"
  text-input-error:
    border: "1px solid {colors.error}"

  # --- Cards ---
  card:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: 24px
    border: "1px solid {colors.hairline}"
    shadow: "{colors.shadow-base} 0 1px 3px"
  card-inset:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: 16px
    border: "1px solid {colors.hairline}"
  card-dark:
    backgroundColor: "{colors.sidebar-bg}"
    textColor: "{colors.on-sidebar}"
    rounded: "{rounded.lg}"
    padding: 24px

  # --- Status badges (pill — exception to rounded-md rule) ---
  status-badge-success:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.success}"
    typography: "{typography.eyebrow}"
    rounded: "{rounded.pill}"
    padding: "3px 8px"
  status-badge-warning:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.warning}"
    typography: "{typography.eyebrow}"
    rounded: "{rounded.pill}"
    padding: "3px 8px"
  status-badge-error:
    backgroundColor: "{colors.error-soft}"
    textColor: "{colors.error}"
    typography: "{typography.eyebrow}"
    rounded: "{rounded.pill}"
    padding: "3px 8px"
  status-badge-info:
    backgroundColor: "{colors.info-soft}"
    textColor: "{colors.info}"
    typography: "{typography.eyebrow}"
    rounded: "{rounded.pill}"
    padding: "3px 8px"
  status-badge-neutral:
    backgroundColor: "{colors.neutral-soft}"
    textColor: "{colors.neutral}"
    typography: "{typography.eyebrow}"
    rounded: "{rounded.pill}"
    padding: "3px 8px"

  # --- AppShell: Left Sidebar ---
  sidebar:
    backgroundColor: "{colors.sidebar-bg}"
    width-expanded: 240px
    width-collapsed: 56px
    transition: "width 200ms ease"
    localStorage-key: "seta:sidebar:collapsed"
  sidebar-nav-item-default:
    backgroundColor: "transparent"
    textColor: "{colors.on-sidebar-subtle}"
    iconColor: "{colors.on-sidebar-subtle}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: "7px 10px"
    minHeight: 36px
  sidebar-nav-item-hover:
    backgroundColor: "{colors.sidebar-surface-1}"
    textColor: "{colors.on-sidebar-muted}"
    iconColor: "{colors.on-sidebar-muted}"
  sidebar-nav-item-active:
    backgroundColor: "{colors.sidebar-surface-2}"
    textColor: "{colors.primary-hover}"
    iconColor: "{colors.primary-hover}"
    typography: "{typography.button-md}"
  sidebar-divider:
    color: "{colors.sidebar-hairline}"
    margin: "6px 10px"
  app-switcher-tile-active:
    backgroundColor: "rgba(94,106,210,0.15)"
    border: "1.5px solid {colors.primary}"
    textColor: "{colors.on-sidebar}"
    typography: "{typography.caption}"
    rounded: "{rounded.md}"
    padding: 12px
  app-switcher-tile-inactive:
    backgroundColor: "rgba(255,255,255,0.03)"
    border: "1px solid rgba(255,255,255,0.06)"
    textColor: "rgba(255,255,255,0.25)"
    typography: "{typography.caption}"
    rounded: "{rounded.md}"
    padding: 12px
    pointerEvents: none

  # --- AppShell: Top Bar ---
  top-bar:
    backgroundColor: "{colors.canvas}"
    borderBottom: "1px solid {colors.hairline}"
    height: 56px
    padding: "0 20px"
  top-bar-action:
    backgroundColor: "transparent"
    textColor: "{colors.ink-mute}"
    rounded: "{rounded.md}"
    padding: "6px 8px"
    size: 36px
  top-bar-action-active:
    backgroundColor: "{colors.primary-subtle}"
    textColor: "{colors.primary}"

  # --- AppShell: Agent Panel (right) ---
  agent-panel:
    backgroundColor: "{colors.agent-bg}"
    borderLeft: "1px solid {colors.hairline}"
    width-desktop: 360px
    width-tablet: 320px
    transition: "transform 200ms ease, width 200ms ease"
    localStorage-key: "seta:agent-panel:open"
  agent-panel-header:
    backgroundColor: "{colors.canvas}"
    borderBottom: "1px solid {colors.hairline}"
    height: 48px
    padding: "0 16px"
  agent-panel-message-user:
    backgroundColor: "{colors.primary-subtle}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
  agent-panel-message-agent:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
    border: "1px solid {colors.hairline}"
  agent-panel-input:
    backgroundColor: "{colors.canvas}"
    borderTop: "1px solid {colors.hairline}"
    padding: "12px 16px"

  # --- Auth ---
  auth-card:
    backgroundColor: "{colors.canvas}"
    rounded: "{rounded.xl}"
    padding: 40px
    shadow: "{colors.shadow-base} 0 8px 32px"
    maxWidth: 400px
  auth-gradient-hero:
    background: "linear-gradient(135deg, #eef0fb 0%, #c7d2fe 35%, #a5b4fc 65%, #5e6ad2 100%)"
---

## Overview

Seta Workspace uses a **Linear-inspired** design language adapted for a multi-module admin SPA platform. The signature lavender-blue `{colors.primary}` (#5e6ad2) is the single chromatic accent — used on active nav items, primary buttons, focus rings, and link emphasis. Scarce: one filled button per view section.

The AppShell is **three-column**: dark navy left sidebar (collapsible) + white main canvas + right agent panel (toggleable). Every module — Studio, Timesheet, PMO, Finance — mounts the same AppShell with its own `nav` items. The **Agent panel** is always available via the `Bot` icon in the TopBar; it gives every user an AI assistant contextualised to the current page and tenant.

**Icons: Lucide React** — tree-shaken named imports only. Stroke width 1.5, sized via Tailwind `size-*` classes.

**Typography: Inter** (Google Fonts). `font-feature-settings: "ss01"` on `<body>`. `font-feature-settings: "tnum"` per-element on all numeric cells — hours, amounts, timestamps, counts.

**Buttons are `{rounded.md}` 8px — never pill.** Pill shape is reserved for status badges only.

## Colors

### Brand & Accent
- **Lavender-blue** (`{colors.primary}` `#5e6ad2`): Active nav, primary button, focus ring, link emphasis.
- **Lavender hover** (`{colors.primary-hover}` `#828fff`): Button hover, active nav text/icon.
- **Lavender focus** (`{colors.primary-focus}` `#5e69d1`): 2px focus ring on inputs and buttons.
- **Lavender subtle** (`{colors.primary-subtle}` `#eef0fb`): Selected row, agent user bubble, primary-tinted backgrounds.

### Canvas (Main content — always light)
- **Canvas** (`{colors.canvas}` `#ffffff`): Main content area, cards, inputs.
- **Canvas soft** (`{colors.canvas-soft}` `#f7f8f8`): Alternating table rows, top bar, page sub-sections.
- **Canvas subtle** (`{colors.canvas-subtle}` `#f1f2f4`): Row hover, inset panels, agent panel background.

### Sidebar (Dark navy)
- **Sidebar bg** (`{colors.sidebar-bg}` `#1c1e54`): Left sidebar background.
- **Sidebar surface 1** (`{colors.sidebar-surface-1}` `#232558`): Hovered nav item.
- **Sidebar surface 2** (`{colors.sidebar-surface-2}` `#2d2f6b`): Active nav item.
- **Sidebar hairline** (`{colors.sidebar-hairline}` `rgba(255,255,255,0.08)`): Dividers inside sidebar.

### Text
- **Ink** (`{colors.ink}` `#1a1a2e`): Default body text.
- **Ink secondary** (`{colors.ink-secondary}` `#3d3d5c`): Secondary labels.
- **Ink mute** (`{colors.ink-mute}` `#62666d`): Helper text, column headers, captions.
- **Ink subtle** (`{colors.ink-subtle}` `#8a8f98`): Disabled, placeholder, footnotes.
- **On sidebar** (`{colors.on-sidebar}` `#f7f8f8`): Primary text on dark sidebar.
- **On sidebar muted** (`{colors.on-sidebar-muted}` `#d0d6e0`): Secondary text on sidebar.
- **On sidebar subtle** (`{colors.on-sidebar-subtle}` `#8a8f98`): Inactive nav labels.

### Semantic Status
| Token | Hex | Soft bg | Modules |
|---|---|---|---|
| `{colors.success}` | `#27a644` | `#dcfce7` | Consented, approved, completed, closed |
| `{colors.warning}` | `#d97706` | `#fef3c7` | Pending, expiring, needs review |
| `{colors.error}` | `#dc2626` | `#fee2e2` | Failed, rejected, token-expired |
| `{colors.info}` | `#5e6ad2` | `#eef0fb` | Running, in-progress, open |
| `{colors.neutral}` | `#8a8f98` | `#f1f2f4` | Draft, unknown, archived |

## Icons

**Library:** `lucide-react` — tree-shaken named imports only.
```ts
import { Bot, LayoutGrid, PanelLeft, PanelRight, Bell } from 'lucide-react'
```
Never import the full bundle. Pin the version in `@seta/ui/package.json`.

**Sizes** (via Tailwind `size-*`): `size-3.5` (14px inline) · `size-4` (16px default) · `size-5` (20px topbar) · `size-6` (24px empty-state).

**Stroke width:** `stroke-[1.5]` globally — matches Linear's icon weight.

**Key icon assignments:**
| UI element | Lucide icon |
|---|---|
| AppSwitcher waffle | `LayoutGrid` |
| Agent panel toggle | `Bot` |
| Sidebar collapse | `PanelLeft` |
| Agent panel toggle (right) | `PanelRight` |
| Notifications | `Bell` |
| User/profile | `CircleUser` |
| Tenant | `Building2` |
| Connector | `Plug` |
| Agent run | `Play` |
| RAG corpus | `BookOpen` |
| Audit log | `ClipboardList` |
| Timesheet | `Clock` |
| PMO | `Kanban` |
| Finance | `BarChart3` |
| Agent send | `SendHorizonal` |

## Typography

### Font Family
**Inter** (Google Fonts). Apply `font-feature-settings: "ss01"` on `<body>`. Apply `font-feature-settings: "tnum"` per-element on any numeric cell.

### Hierarchy
| Token | Size | Weight | Tracking | Use |
|---|---|---|---|---|
| `{typography.display-lg}` | 32px | 600 | -0.8px | Page title, empty-state headline |
| `{typography.display-md}` | 26px | 600 | -0.5px | Section opener |
| `{typography.heading-lg}` | 22px | 500 | -0.4px | Card title, dialog heading |
| `{typography.heading-md}` | 18px | 500 | -0.2px | Sub-section heading |
| `{typography.heading-sm}` | 15px | 500 | -0.1px | Panel label |
| `{typography.body-lg}` | 16px | 400 | -0.05px | Lead paragraph |
| `{typography.body-md}` | 14px | 400 | 0 | Default UI text, nav labels, table cells |
| `{typography.body-tabular}` | 14px | 400 | -0.3px | All numeric cells (`tnum`) |
| `{typography.button-md}` | 14px | 500 | 0 | Button labels |
| `{typography.button-sm}` | 13px | 500 | 0 | Ghost / compact buttons |
| `{typography.caption}` | 12px | 400 | 0 | Column headers, helper text (`tnum`) |
| `{typography.eyebrow}` | 11px | 500 | +0.4px | Status badge label |
| `{typography.mono}` | 13px | 400 | 0 | Code / tool call JSON |

### Principles
- 600 display · 500 headings + buttons · 400 body.
- Negative tracking on headings; positive tracking on eyebrow/badge labels only.
- `tnum` on every numeric cell — hours, amounts, timestamps, token counts, IDs.
- `ss01` globally on `<body>`.

## Layout

### AppShell — Three-Column Structure

```
┌──────────────────────────────────────────────────────────────────────┐
│ SIDEBAR (240/56px)  │ TOP BAR (56px, full width of main+agent)       │
│                     ├─────────────────────────────┬──────────────────┤
│ SidebarLogo         │                             │ AGENT PANEL      │
│ CollapseToggle      │  MAIN CONTENT               │ (360px desktop   │
│ ─────────────────── │  (flex-1, overflow-y-auto)  │  320px tablet    │
│ TenantSwitcher      │                             │  drawer mobile)  │
│ ─────────────────── │  Page routes render here    │                  │
│ SidebarNav          │                             │ AgentPanelHeader │
│  • nav items        │                             │ MessageList      │
│                     │                             │ AgentInput       │
│ ─────────────────── │                             │                  │
│ AppSwitcher         │                             │                  │
│ SidebarUser         │                             │                  │
└─────────────────────┴─────────────────────────────┴──────────────────┘
```

### Left Sidebar
- **Expanded:** 240px. **Collapsed:** 56px (icon-only + Radix tooltips).
- `transition: width 200ms ease`.
- State in `localStorage["seta:sidebar:collapsed"]`.
- `<CollapseToggle>`: `PanelLeft` icon, top-right of sidebar header.
- At < 1024px: sidebar hides entirely; `PanelLeft` in TopBar opens it as a full-height **left drawer** (Radix Dialog, `z-50`).

**Nav item states:**
```
default  transparent bg · on-sidebar-subtle text/icon
hover    sidebar-surface-1 bg · on-sidebar-muted text/icon
active   sidebar-surface-2 bg · primary-hover text/icon · button-md weight
```
Collapsed: icon only (16px, stroke-1.5) + Radix Tooltip `side="right"`.

**TenantSwitcher:** Expanded = `Building2` icon + tenant name + `ChevronDown` → dropdown. Collapsed = initials avatar + Radix tooltip.

**AppSwitcher:** `LayoutGrid` icon + "Apps" label (expanded) / icon + tooltip (collapsed). Opens Radix Popover with 2×2 tile grid:
```
┌──────────────────────┐
│ [S] Studio      ●    │  ← active: primary border ring
│ [T] Timesheet        │  ← inactive: opacity-25, pointer-events-none
│ [P] PMO              │     Radix Tooltip "Coming soon"
│ [F] Finance          │
└──────────────────────┘
```

### Top Bar
- Height 56px. `canvas` background. `hairline` bottom border.
- **Left:** Breadcrumb (`caption`, `ink-mute`).
- **Right (actions, 36×36px each, `rounded-md`):**
  - `Search` — global search (P3).
  - `Bell` — notifications, error badge overlay.
  - `Bot` — **agent panel toggle**. Active state: `top-bar-action-active` (primary-subtle bg, primary icon).
  - `CircleUser` — user dropdown (profile, logout).
- On mobile (< 768px): TopBar shows only `PanelLeft` hamburger + logo + `Bot` + `CircleUser`. Breadcrumb hidden.

### Right Agent Panel
Available in **all modules** — Studio, Timesheet, PMO, Finance.

- Toggled by `Bot` button in TopBar. State in `localStorage["seta:agent-panel:open"]`.
- **Desktop (≥ 1024px):** Inline, 360px width, pushes main content. `border-left: hairline`.
- **Tablet (768–1023px):** Inline, 320px. On very tight screens (agent + collapsed sidebar + main < 800px), switches to overlay.
- **Mobile (< 768px):** Full-height **right drawer** overlay (Radix Dialog, slides from right, `w-[85vw] max-w-[360px]`). Backdrop `rgba(0,0,0,0.45)`.

**Agent panel anatomy:**
```
AgentPanelHeader (48px)
  [Bot icon] "Seta Agent"        [X close]

MessageList (flex-1, overflow-y-auto, p-4, gap-3)
  AgentMessage  (agent bubble — canvas bg, hairline border, rounded-lg)
  UserMessage   (user bubble — primary-subtle bg, rounded-lg, self-end)
  StreamingIndicator (3-dot pulse while SSE active)

AgentInput (border-top hairline, p-3)
  Textarea (auto-grow, max 4 rows, body-md)
  [SendHorizonal button — primary]
```

Context is auto-injected from the current route (tenant id, page, selected record) so users can ask: "Summarise this week's timesheet", "Why did this agent run fail?", "Show overdue PMO tasks".

### Spacing (Admin dashboard density — not marketing)
- Content area padding: 24px.
- Card padding: 24px standard · 16px compact.
- Table cell: `10px 14px`.
- Button: `8px 14px`.
- Input: `8px 12px`.

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| 0 — flat | No shadow, no border | Default canvas, sidebar (uses surface ladder) |
| 1 — card | `rgba(15,23,42,0.08) 0 1px 3px` + `hairline` border | Cards on white canvas |
| 2 — float | `rgba(15,23,42,0.08) 0 8px 24px, rgba(15,23,42,0.04) 0 2px 6px` | Popovers, dropdowns, dialogs |
| focus | `2px solid {colors.primary-focus}` outline | Focused inputs and buttons |

Sidebar depth = surface ladder (`sidebar-surface-1` hover / `sidebar-surface-2` active). No drop shadows on dark surfaces.

## Shapes

| Token | Value | Use |
|---|---|---|
| `{rounded.xs}` | 4px | Tiny chips, table chrome |
| `{rounded.sm}` | 6px | Inline tags |
| `{rounded.md}` | 8px | **All buttons, inputs, nav items** |
| `{rounded.lg}` | 12px | Cards, dialogs, message bubbles |
| `{rounded.xl}` | 16px | Large modals, agent panel drawer |
| `{rounded.pill}` | 9999px | Status badges, tab toggles — **not buttons** |

## Responsive Behavior

### Breakpoints

| Name | Width | Left Sidebar | Agent Panel | TopBar |
|---|---|---|---|---|
| Wide | ≥ 1440px | Expanded 240px (or user-collapsed 56px) | Inline 360px | Full |
| Desktop | 1024–1439px | Expanded or collapsed 56px | Inline 320px | Full |
| Tablet | 768–1023px | Collapsed 56px (hidden < 900px tight) | Inline 320px or overlay | Full, search hidden |
| Mobile | < 768px | Hidden — left drawer via hamburger | Right drawer overlay | Minimal: hamburger + logo + Bot + user |

### Column Behaviour Matrix

```
Wide desktop (≥1440px):
  [sidebar 240px] + [main flex-1] + [agent 360px if open]
  Total: 240 + main + 360 — comfortable at 1440px

Desktop (1280px, sidebar collapsed):
  [56px] + [main flex-1] + [agent 360px if open]

Tablet (1024px):
  [56px] + [main flex-1] + [agent 320px if open]
  If agent open + main < 400px → agent becomes right drawer overlay

Mobile (<768px):
  [main 100%] — both sidebars are drawers
  Left sidebar: Radix Dialog, slides from left, w-64
  Agent panel: Radix Dialog, slides from right, w-[85vw] max-w-[360px]
  Backdrop: rgba(0,0,0,0.45), click-outside closes
```

### Touch Targets
- All interactive elements: min `36×36px` desktop · `44×44px` touch.
- Sidebar nav items: `minHeight: 36px` (desktop), grows to `44px` on touch.
- Agent send button: `44×44px` on mobile.
- TopBar action icons: `36×36px` desktop · `44×44px` mobile.

### Data Tables on Small Screens
- `overflow-x: auto` wrapper on all `DataTable` instances.
- Pinned first column (entity name/id) on mobile — other columns scroll horizontally.
- Row actions collapse to a `MoreHorizontal` (`...`) button at < 768px.

### Forms on Small Screens
- Single-column layout below 768px for all multi-column forms.
- Timesheet entry, PMO task forms, corpus upload: stack fields vertically.
- `DateRangePicker` uses a bottom sheet (Radix Dialog anchored bottom) on mobile.

## Components

### Buttons
All `{rounded.md}` 8px. Pill forbidden on buttons.

- **`button-primary`** — lavender fill. One per view section maximum.
- **`button-secondary`** — white canvas, `hairline-strong` border. Secondary CTAs.
- **`button-ghost`** — transparent, `ink-mute`. Toolbar, pagination, tertiary actions.
- **`button-on-dark`** — white/10 fill. Sidebar surfaces only.

### Status Badges
`{rounded.pill}` — the only pill-shaped element. Five variants: success / warning / error / info / neutral. `{typography.eyebrow}` (11px, 500, +0.4px tracking).

Usage by module:
- **Studio**: connector consent (`consented`→success, `pending`→warning, `failed/token-expired`→error), run status (`running`→info, `completed`→success, `failed`→error)
- **Timesheet**: entry approval (`approved`→success, `pending`→warning, `rejected`→error)
- **PMO**: task/project status
- **Finance**: period close (`closed`→success, `open`→info)

### Agent Panel
Present in every module. Mounted in `AppShell`. Module passes a `agentContext` prop (current page, tenant, selected record) so the agent has context without user having to re-explain it.

Streaming via `useAgentRun()` hook (`parseSseStream` from `@seta/agent-sdk`). `AbortController` cleaned up on drawer close or component unmount.

### Data Tables
- Cell text: `{typography.body-tabular}` with `tnum`.
- Column headers: `{typography.caption}` with `tnum`, `ink-mute` color.
- Row hover: `canvas-subtle` bg.
- Selected: `primary-subtle` bg.
- `overflow-x: auto` wrapper always present.
- Pagination: `button-ghost` prev/next.

### Empty States
Every list view has an `EmptyState`: centered `display-lg` heading + `body-md` description in `ink-mute` + optional `button-primary`. Icon from Lucide at `size-6`. Never a blank white area.

## Do's and Don'ts

### Do
- Use `{colors.primary}` for active nav text/icon, primary button, focus ring, link emphasis. One filled button per view section.
- Use `{rounded.md}` (8px) for ALL buttons and inputs.
- Use `{rounded.pill}` ONLY for status badges and tab toggles.
- Apply `tnum` to every numeric cell — hours, amounts, timestamps, token counts.
- Apply `ss01` on `<body>` globally.
- Show `Bot` icon in TopBar on every module — agent panel is always available.
- Use Radix Tooltip `side="right"` for every sidebar nav item when collapsed.
- Persist sidebar + agent panel state in `localStorage` (the only accepted use).
- Wrap every `DataTable` in `overflow-x: auto`.
- Show `EmptyState` for every empty list — never a blank white area.
- Use Lucide named imports — tree-shaken only.

### Don't
- Don't pill-round buttons — `{rounded.md}` only.
- Don't use weight 300 for body — use 400.
- Don't use `{colors.primary}` as body-text color — CTA and link emphasis only.
- Don't add new accent colors outside the semantic palette.
- Don't store tenant id, session id, or role in `localStorage`.
- Don't navigate via `window.location.href` except for the OAuth consent redirect.
- Don't show the auth gradient inside the authenticated AppShell.
- Don't import server-only packages into SPA bundles.
- Don't make inactive AppSwitcher tiles navigable until the module ships.
- Don't import the full Lucide bundle — named imports only.

## Modules

| Module | App | Status | Key nav icons |
|---|---|---|---|
| Studio | `apps/studio` | P2 — first consumer | `Plug` `Play` `BookOpen` `ClipboardList` |
| Timesheet | `apps/timesheet` | Future | `Clock` `CheckSquare` |
| PMO | `apps/pmo` | Future | `Kanban` `Target` |
| Finance | `apps/finance` | Future | `BarChart3` `Receipt` |

All modules share `@seta/ui`, the Tailwind preset, and the AppShell. Each passes its own `nav` items and `agentContext` prop. No module knows another module's routes.

## Iteration Guide

1. Focus on ONE component at a time.
2. Reference tokens directly: `{colors.primary}`, `{rounded.md}`, `{spacing.xl}`.
3. Buttons always `{rounded.md}` — never pill.
4. Default body to `{typography.body-md}` (14px, 400); switch to `{typography.body-tabular}` for numeric cells.
5. New status variants use `status-badge-*` — never new accent colors.
6. New modules inherit AppShell unchanged; pass their own `nav` and `agentContext`.
7. Auth gradient on `/login` only — never in the authenticated AppShell.
8. Icon imports: named only from `lucide-react`, `stroke-[1.5]`, `size-4` default.
