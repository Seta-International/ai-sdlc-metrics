# Embedded Agent — Plan 05: Layout & GlobalNav Integration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the agent panel and ambient strip into `@future/app-layout` and `@future/ui` GlobalNav. After this plan, every zone that uses `AppLayout` automatically gets the agent panel (toggle) and ambient strip (insights bar).

**Architecture:** `@future/app-layout` imports from `@future/agent` directly. `AppLayout` renders `AgentPanel` conditionally based on `useAgentState().panelOpen`. GlobalNav's Bot button toggles the panel. `AgentStrip` renders below the navbar.

**Tech Stack:** React 19, TypeScript

**Spec Reference:** `docs/superpowers/specs/2026-04-15-agent-embedded-design.md` — app-layout Integration, GlobalNav Integration, Layout Structure

**Depends On:** Plan 01, Plan 03 (panel), Plan 04 (ambient strip)

---

## File Structure

### Files to MODIFY

```
packages/app-layout/package.json                              → add @future/agent dependency
packages/app-layout/src/app-layout.tsx                         → add AgentPanel + panel state
packages/app-layout/src/navbar/navbar-renderer.tsx             → add AgentStrip below navbar
packages/app-layout/src/index.ts                               → re-export agent types if needed
packages/ui/src/components/global-nav.tsx                       → update Bot button to use useAgentState
```

---

### Task 1: Add @future/agent dependency to app-layout

**Files:**

- Modify: `packages/app-layout/package.json`

- [ ] **Step 1: Add dependency**

```bash
cd /Users/canh/Projects/Seta/future
bun add @future/agent --filter @future/app-layout
```

- [ ] **Step 2: Verify**

```bash
grep '@future/agent' packages/app-layout/package.json
```

Expected: `"@future/agent": "workspace:*"` in dependencies.

- [ ] **Step 3: Commit**

```bash
git add packages/app-layout/package.json bun.lock
git commit -m "chore(app-layout): add @future/agent dependency"
```

---

### Task 2: Integrate AgentPanel into AppLayout

**Files:**

- Modify: `packages/app-layout/src/app-layout.tsx`

- [ ] **Step 1: Read current AppLayout**

```bash
cat packages/app-layout/src/app-layout.tsx
```

Current structure (from scan):

```typescript
export interface AppLayoutProps extends Omit<NavbarRendererProps, 'config'> {
  config: NavigationConfig
  trpc: PermissionTrpcClient
  children: ReactNode
}

// Wraps: PermissionProvider → SidebarProvider → SidebarRenderer + SidebarInset → NavbarRenderer + main
```

- [ ] **Step 2: Add agent panel integration**

Modify `packages/app-layout/src/app-layout.tsx` to:

1. Import `useAgentState`, `AgentPanel`, `AgentStrip` from `@future/agent`
2. Read `panelOpen` from state
3. Conditionally render `AgentPanel` on the right
4. Compress `main` when panel is open
5. Render `AgentStrip` below the navbar

The exact diff depends on the current file content. The target structure is:

```typescript
import { useAgentState, AgentPanel, AgentStrip } from '@future/agent'

export function AppLayout({ config, trpc, children, ...navbarProps }: AppLayoutProps) {
  // Try-catch useAgentState since it may be used without AgentProvider during testing
  let panelOpen = false
  let togglePanel = () => {}
  try {
    const agentState = useAgentState()
    panelOpen = agentState.panelOpen
    togglePanel = agentState.togglePanel
  } catch {
    // AgentProvider not mounted — agent features disabled
  }

  return (
    <PermissionProvider trpc={trpc}>
      <SidebarProvider>
        <SidebarRenderer config={config.sidebar} />
        <SidebarInset>
          <NavbarRenderer
            config={config.navbar}
            {...navbarProps}
            onAgentClick={togglePanel}
          />
          <AgentStrip />
          <div className="flex flex-1 overflow-hidden">
            <main className={cn('flex-1 overflow-auto', panelOpen && 'mr-[400px]')}>
              {children}
            </main>
            {panelOpen && <AgentPanel />}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </PermissionProvider>
  )
}
```

Note: The try-catch around `useAgentState` is a safety net. In production, all zones wrap with `AgentProvider` — the catch path should never fire. But during unit tests of `AppLayout` itself (which may not wrap with `AgentProvider`), this prevents a crash.

- [ ] **Step 3: Verify build**

```bash
bun run --filter @future/app-layout build
```

Expected: Build succeeds.

- [ ] **Step 4: Run app-layout tests (if any exist)**

```bash
bun vitest run --config packages/app-layout/vitest.config.ts 2>/dev/null || echo "No tests found"
```

If tests exist, ensure they still pass. If the existing tests don't wrap with `AgentProvider`, the try-catch ensures they don't break.

- [ ] **Step 5: Commit**

```bash
git add packages/app-layout/src/app-layout.tsx
git commit -m "feat(app-layout): integrate AgentPanel and AgentStrip"
```

---

### Task 3: Update NavbarRenderer to pass agent toggle

**Files:**

- Modify: `packages/app-layout/src/navbar/navbar-renderer.tsx`

- [ ] **Step 1: Read current NavbarRenderer**

```bash
cat packages/app-layout/src/navbar/navbar-renderer.tsx
```

Current `NavbarRendererProps`:

```typescript
export interface NavbarRendererProps {
  config: NavbarConfig
  userInitials?: string
  onNotificationsClick?: () => void
  onAgentClick?: () => void
  onSearchClick?: () => void
  onProfileClick?: () => void
}
```

The `onAgentClick` prop already exists. Verify that it's wired to the GlobalNav's Bot button. If GlobalNav is rendered inside NavbarRenderer, the `onAgentClick` should be passed through.

- [ ] **Step 2: Verify wiring**

Check that `NavbarRenderer` passes `onAgentClick` to `GlobalNav`:

```bash
grep -n 'onAgentClick' packages/app-layout/src/navbar/navbar-renderer.tsx
```

If `onAgentClick` is already passed to `GlobalNav`, no change needed. If not, add it.

- [ ] **Step 3: Commit (if changes made)**

```bash
git add packages/app-layout/src/navbar/navbar-renderer.tsx
git commit -m "feat(app-layout): wire agent toggle through NavbarRenderer"
```

---

### Task 4: Verify full build chain

- [ ] **Step 1: Build all workspace packages**

```bash
bun run --filter "@future/*" build
```

Expected: All packages build successfully, including the new dependency chain: `@future/agent` → `@future/app-layout`.

- [ ] **Step 2: Run all workspace tests**

```bash
bun run --filter "@future/*" test:unit
```

Expected: All tests pass.

- [ ] **Step 3: Verify type exports**

```bash
cd apps/web-people && npx tsc --noEmit --pretty
```

Expected: No type errors — web-people can see agent types through app-layout.

- [ ] **Step 4: Commit if any fixups needed**

```bash
git add -A
git commit -m "fix: resolve build issues from agent-layout integration"
```
