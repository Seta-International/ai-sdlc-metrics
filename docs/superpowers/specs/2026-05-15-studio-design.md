# Studio + @seta/ui Design Spec

**Date:** 2026-05-15
**Scope:** `@seta/ui` (Seta Workspace design system) + `apps/studio` (P2 admin SPA)
**Status:** Approved for implementation planning
**Design source:** `DESIGN.md` at repo root (Linear-inspired, `npx getdesign@latest add linear.app`)

---

## 1. Context & Goals

Studio is the web admin/observability UI for Seta-managed tenants (P2). It is the first consumer of `@seta/ui`, the shared design system that will also serve Timesheet, PMO, and Finance modules as they ship. Each **Seta Workspace** module is a separate Vite SPA sharing `@seta/ui` components and a Tailwind token preset — no cross-app shell yet (future phase).

**Goals for this design:**
- Establish a token layer and AppShell that every future Workspace module inherits without redesign.
- Ship Studio P2's four functional areas (tenant/connector admin, agent run viewer, RAG corpus management, audit log viewer) on top of the Linear-inspired Seta Workspace design.
- Wire the right-side Agent panel into the AppShell — available in all modules from day one.
- Reference Mastra's React SDK patterns for hooks, streaming, and component composition — adapt, not copy.

---

## 2. Design Foundation

### 2.1 Design Inspiration

**Linear-inspired** — sourced via `npx getdesign@latest add linear.app` → `/tmp/linear.app/DESIGN.md`. Adapted for a light-canvas admin SPA (Linear's marketing site is dark; our main content area stays white for data readability).

Full token reference: `DESIGN.md` at repo root. All implementation must reference that file.

### 2.2 Token Summary

**Primary accent:** Lavender-blue `#5e6ad2` — active nav, primary button, focus ring, link emphasis. Scarce: one filled button per view section.

**Sidebar:** Dark navy `#1c1e54` with a three-step surface ladder inside (`#232558` hover · `#2d2f6b` active).

**Main canvas:** White `#ffffff` — ERP data views need light backgrounds.

**Body text:** Ink `#1a1a2e`. Not pure black.

**Font:** Inter (Google Fonts). `font-feature-settings: "ss01"` on `<body>`. `font-feature-settings: "tnum"` per numeric cell.

**Typography weights:** 600 display · 500 headings + buttons · 400 body.

**Buttons:** `rounded-md` 8px — **never pill**. Pill shape for status badges only.

**Icons:** Lucide React — tree-shaken named imports, `stroke-[1.5]`, `size-4` default.

**Semantic palette:**

| Intent | Text | Background | Use |
|---|---|---|---|
| success | `#27a644` | `#dcfce7` | Consented, approved, completed |
| warning | `#d97706` | `#fef3c7` | Pending, expiring, needs review |
| error | `#dc2626` | `#fee2e2` | Failed, token-expired, rejected |
| info | `#5e6ad2` | `#eef0fb` | Running, in-progress |
| neutral | `#8a8f98` | `#f1f2f4` | Draft, archived |

**Spacing:** 2 / 4 / 8 / 12 / 16 / 24 / 32 / 64px.

**Elevation:** Level 1 `rgba(15,23,42,0.08) 0 1px 3px` cards · Level 2 float for popovers/dialogs · 2px `primary-focus` outline for focus.

---

## 3. @seta/ui Package

### 3.1 Package Structure

```
platform/ui/                     # @seta/ui ("private": true, workspace dep)
  src/
    tokens/
      tailwind-preset.ts         # Tailwind v4 @theme block — all CSS vars
      index.css                  # :root { --color-primary: ... } global token sheet
    components/
      shell/
        AppShell.tsx             # three-column layout root
        Sidebar.tsx              # left sidebar, collapsible
        SidebarNav.tsx
        SidebarNavItem.tsx
        CollapseToggle.tsx       # PanelLeft icon, toggles sidebar
        TenantSwitcher.tsx
        AppSwitcher.tsx          # LayoutGrid waffle → Radix Popover 2×2 tile grid
        TopBar.tsx               # 56px bar, breadcrumb + right actions
        Breadcrumb.tsx
        NotificationBell.tsx     # Bell icon + error badge
        AgentPanel.tsx           # right panel, inline desktop / drawer mobile
        AgentPanelHeader.tsx
        AgentMessageList.tsx
        AgentInput.tsx           # Textarea + SendHorizonal button
      data/
        DataTable.tsx            # overflow-x:auto, sortable, pinned col mobile
        StatusBadge.tsx          # five semantic variants, pill shape
        Card.tsx
        EmptyState.tsx
        Timeline.tsx             # agent run event list
        TimelineEvent.tsx        # tool_call / model_call / error / memory variants
        TokenUsageBar.tsx
        Code.tsx                 # JetBrains Mono, Shiki highlight, copy button
      forms/
        Button.tsx               # primary / secondary / ghost / on-dark
        Input.tsx
        Select.tsx
        DateRangePicker.tsx      # bottom-sheet on mobile
        FileUpload.tsx
      feedback/
        Toast.tsx
        Toaster.tsx
        Dialog.tsx
        Tooltip.tsx              # Radix-based, side="right" for sidebar collapsed
    hooks/
      useAgentRun.ts             # SSE streaming — adapted from Mastra useStreamWorkflow
      useSession.ts              # GET /me → TanStack Query, staleTime: Infinity
      useAgentPanel.ts           # open/close state + localStorage persistence
      useSidebar.ts              # collapsed state + localStorage persistence
    provider/
      SetaProvider.tsx           # AgentClient context + QueryClientProvider
      useAgentClient.ts          # context hook
    index.ts
  package.json
  tsconfig.json
  vitest.config.ts
```

`@seta/ui` lives under `platform/ui/` per CLAUDE.md boundary rules.

### 3.2 Tailwind Integration

```ts
// apps/studio/tailwind.config.ts
import { setaPreset } from '@seta/ui/tokens/tailwind-preset'
export default { presets: [setaPreset] }
```

### 3.3 Provider Pattern (adapted from Mastra)

```tsx
export function SetaProvider({ children }: { children: React.ReactNode }) {
  const client = useMemo(() => new AgentClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL,
    credentials: 'include',
  }), [])
  return (
    <AgentClientContext value={client}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </AgentClientContext>
  )
}
```

### 3.4 AppShell — Three-Column Layout

```tsx
<AppShell nav={studioNav} agentContext={{ page: 'runs', tenantId }}>
  <RouterOutlet />
</AppShell>
```

**Three columns:**
```
[Sidebar 240/56px] [TopBar 56px + Main flex-1] [AgentPanel 360/320px or drawer]
```

**Sidebar collapsed state:** `localStorage["seta:sidebar:collapsed"]`.
**Agent panel state:** `localStorage["seta:agent-panel:open"]`.

**Sidebar nav item states (Linear surface ladder):**
```
default  transparent · on-sidebar-subtle text/icon
hover    sidebar-surface-1 bg · on-sidebar-muted text/icon
active   sidebar-surface-2 bg · primary-hover text/icon · weight 500
```

**TopBar right actions** (36×36px, `rounded-md`):
- `Search` — global search (P3)
- `Bell` — notifications
- `Bot` — **agent panel toggle** (active = `primary-subtle` bg + `primary` icon)
- `CircleUser` — user dropdown

**AppSwitcher:** `LayoutGrid` icon → Radix Popover 2×2 tile grid. Active tile: lavender ring. Inactive tiles: opacity-25, `pointer-events-none`, "Coming soon" Tooltip.

### 3.5 Agent Panel

Available in every Workspace module. Mounted inside `AppShell`, receives `agentContext` prop from the current route (tenant id, current page, selected record).

**Desktop (≥1024px):** Inline, 360px, pushes main content. `border-left: hairline`.
**Tablet (768–1023px):** Inline 320px, switches to overlay if total width < 800px.
**Mobile (<768px):** Right drawer (Radix Dialog, `w-[85vw] max-w-[360px]`, slides from right).

Streaming via `useAgentRun()` hook → `parseSseStream` from `@seta/agent-sdk`. AbortController cleaned up on drawer close.

---

## 4. Studio SPA Architecture

### 4.1 Tech Stack (pinned at kickoff via `pnpm view`)

- React 19+ · Vite 7+ · TanStack Router · TanStack Query
- `zod@4.4.3` (workspace catalog pin)
- Tailwind CSS 4+ · `@seta/ui@workspace:*`
- `@seta/agent-sdk@workspace:*` · `@seta/connector-registry@workspace:*` (type-only) · `@seta/identity@workspace:*` (type-only)
- `lucide-react` (tree-shaken subset — pinned version via `pnpm view lucide-react version` at kickoff)
- Recharts (run timeline + audit trend charts)
- Vitest 4.1.5 · React Testing Library · MSW 2+ · Playwright

### 4.2 Route Tree

```
/login
/login/:provider/callback
/tenants
/tenants/:id/setup
/tenants/:id/connectors
/tenants/:id/connectors/:connectorId/consent
/tenants/:id/runs
/tenants/:id/runs/:runId
/tenants/:id/corpus
/tenants/:id/corpus/:sourceId
/tenants/:id/audit
/me
```

All routes under `/tenants/:id/*` guard via TanStack Router `beforeLoad` → calls `/me`, redirects to `/login` if unauthenticated. Tenant id is always a URL param — never global state.

### 4.3 Server-State Pattern

```
TanStack Query (queryKey per endpoint)
  └── useAgentClient() → AgentClient (@seta/agent-sdk)
        └── fetch (credentials: 'include') → apps/api
              └── Zod response validation (SDK-exported schemas)
```

### 4.4 SSE Streaming (adapted from Mastra)

Adapted from Mastra's `useStreamWorkflow` (`client-sdks/react/src/workflows/use-stream-workflow.ts`) — same `ReadableStreamDefaultReader` ref pattern and AbortController cleanup:

```ts
export function useAgentRun(runId: string) {
  const client = useAgentClient()
  const readerRef = useRef<ReadableStreamDefaultReader | null>(null)
  const [chunks, setChunks] = useState<KernelChunk[]>([])
  const [status, setStatus] = useState<RunStatus>('idle')

  useEffect(() => {
    if (status !== 'running') return
    const controller = new AbortController()
    client.streamRun(runId, { signal: controller.signal })
      .then(stream => parseSseStream(stream, chunk => {
        setChunks(prev => [...prev, chunk])
        if (chunk.type === 'run_end') setStatus('completed')
        if (chunk.type === 'run_error') setStatus('failed')
      }))
    return () => { controller.abort(); readerRef.current?.cancel() }
  }, [runId, status])

  return { chunks, status, tokenUsage: deriveTokenUsage(chunks) }
}
```

### 4.5 Timeline Component (adapted from Mastra's Entity)

Adapted from `client-sdks/react/src/ui/Entity/` — expandable rows with variant colors:

```tsx
<Timeline chunks={chunks} isStreaming={status === 'running'}>
  {chunks.map(chunk => (
    <TimelineEvent
      key={chunk.id}
      variant={chunkVariant(chunk.type)}  // tool_call→info, model_call→primary, error→error, memory→success
      label={chunk.toolName ?? chunk.model}
      timestamp={chunk.ts}
      duration={chunk.durationMs}
      expandable
    >
      <Code lang="json">{JSON.stringify(chunk.input, null, 2)}</Code>
    </TimelineEvent>
  ))}
</Timeline>
```

`Code` component adapted from Mastra's `client-sdks/react/src/ui/Code/` — Shiki + copy button, `{typography.mono}` (JetBrains Mono).

---

## 5. Studio Functional Areas

### 5.1 Tenant + Connector Admin

**`/tenants`** — `DataTable` of tenants. Columns: name, connector count, last activity (`body-tabular` + tnum). `EmptyState` with `Building2` icon.

**`/tenants/:id/connectors`** — `DataTable` of connectors. Each row: connector name, scopes, `StatusBadge`, last-consented. "Grant consent" `button-primary` → `POST /oauth/:provider/consent-url` → `window.location.href` (intentional OAuth redirect — the only `window.location.href` exception).

**`/tenants/:id/connectors/:connectorId/consent`** — post-consent landing. Confirms updated status, renders `StatusBadge` + next steps.

### 5.2 Agent Run / Thread Viewer

**`/tenants/:id/runs`** — `DataTable`. Columns: run id, status (`StatusBadge`), agent, duration, token count, started-at (all `body-tabular` + tnum). `refetchInterval: 5000` when any row is `running`.

**`/tenants/:id/runs/:runId`** — `Card` with run metadata + `<Timeline>` driven by `useAgentRun()`. SSE opens when `status === 'running'`. `TokenUsageBar` below timeline.

### 5.3 RAG Corpus Management

**`/tenants/:id/corpus`** — `DataTable`. Columns: source name, type, chunk count (tnum), ingest status, last-indexed. "Upload" → `Dialog` with `FileUpload`. Optimistic row insert with info `StatusBadge`. `refetchInterval: 3000` while indexing.

**`/tenants/:id/corpus/:sourceId`** — chunk count, metadata, "Re-index" `button-secondary`.

### 5.4 Audit Log Viewer

**`/tenants/:id/audit`** — Filter bar (tenant, user, tool, event type, date range) + `DataTable`. Cursor-based pagination. "Export CSV" `button-ghost`. Read-only.

---

## 6. Auth Flow

`/login` — lavender gradient (`auth-gradient-hero`) full-viewport. `card-dark` centered. "Sign in with Microsoft" + "Sign in with Google" as `button-primary`.

`useSession()`: `useQuery({ queryKey: ['me'], queryFn: client.getMe, staleTime: Infinity })`.

---

## 7. Responsive Behaviour (AppShell)

| Breakpoint | Left Sidebar | Agent Panel | TopBar |
|---|---|---|---|
| ≥1440px | 240px expanded or 56px collapsed | 360px inline | Full |
| 1024–1439px | Expanded or 56px collapsed | 320px inline | Full |
| 768–1023px | 56px collapsed | 320px inline or overlay | Full, search hidden |
| <768px | Hidden → left drawer (`PanelLeft` hamburger) | Right drawer (`Bot` button) | Minimal: hamburger + logo + Bot + user |

Touch targets: 36×36px desktop · 44×44px touch. All `DataTable` instances wrapped in `overflow-x: auto`. Forms stack single-column below 768px.

---

## 8. Test Strategy

**Component tests** (Vitest + RTL + MSW): co-located `src/**/*.test.tsx`. MSW intercepts at `fetch`. Fixtures in `src/__recordings__/`. No `@seta/*` module mocking — CLAUDE.md rule.

**E2E** (Playwright at `/tests/e2e/studio/`): full stack — dockerized `apps/api` + Postgres + Jaeger. Covers: login, tenant switch, connector consent, corpus upload, run timeline, audit filter. `@axe-core/playwright` per route.

**Bundle budget:** ≤250 kB gzipped main · ≤100 kB per route chunk. CI Vite analyzer gate.

---

## 9. Open Questions Resolved

| Question | Decision |
|---|---|
| `@seta/ui` ownership | Co-develop with Studio in P2. No post-launch extraction. |
| `@seta/identity` vs `@seta/auth` | Dedicated `@seta/identity` — keeps argon2/KMS separate from web-session lifecycle. |
| RAG corpus storage | Postgres-only P2 (bytea ≤100MB). Object storage P3. |
| Light/dark theme | Deferred P3. Token layer is CSS-var ready. |
| i18n | Deferred P3. |
| Studio URL | `studio.os.seta-international.com` — decided at deploy time. |
| Icon library | Lucide React — tree-shaken, `stroke-[1.5]`, `size-4` default. |
| Agent panel availability | All modules from day one — mounted in AppShell, receives `agentContext` from route. |

---

## 10. Mastra Reference Patterns

| Seta component | Mastra reference file |
|---|---|
| `SetaProvider` / `useAgentClient()` | `client-sdks/react/src/mastra-react-provider.tsx` + `mastra-client-context.tsx` |
| `useAgentRun()` SSE hook | `client-sdks/react/src/workflows/use-stream-workflow.ts` |
| `AgentPanel` streaming + AbortController | `client-sdks/react/src/agent/hooks.ts` |
| `TimelineEvent` expandable rows | `client-sdks/react/src/ui/Entity/` |
| `Code` syntax block | `client-sdks/react/src/ui/Code/` |
| `Tooltip` | `client-sdks/react/src/ui/Tooltip/` |

Adapt, don't copy: Mastra uses a custom `useMutation()` and `mastra:` Tailwind namespace. Seta uses TanStack Query and owns the SPA — no namespace needed.

---

## 11. Boundaries & Constraints

- `@seta/ui` → `platform/ui/` — depends on nothing in `modules/` or `apps/`.
- Studio imports: `@seta/agent-sdk`, `@seta/ui`, `@seta/connector-registry` (type-only), `@seta/identity` (type-only). No server-only packages.
- All API calls through `AgentClient` — no raw `fetch` URL strings.
- `localStorage` for `seta:sidebar:collapsed` and `seta:agent-panel:open` only.
- `window.location.href` for OAuth consent redirect only.
- Auth gradient on `/login` only — never inside the AppShell.
- Lucide: named imports only — never the full bundle.
