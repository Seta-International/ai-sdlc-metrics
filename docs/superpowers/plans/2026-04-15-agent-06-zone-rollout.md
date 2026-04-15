# Embedded Agent — Plan 06: Zone Rollout & Cleanup

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate `AgentProvider` into all 11 zones, add `AgentContextProvider` + inline actions to entity pages, delete `web-agents` zone, and add agent config pages to `web-admin` navigation.

**Architecture:** Every zone wraps its layout with `AgentProvider`. Every entity page wraps with `AgentContextProvider` and adds `AgentBadge`, `AgentBanner`, and `AgentInlineAction`. `web-agents` is deleted entirely. Agent config nav items are added to `web-admin`.

**Tech Stack:** Next.js 16, React 19, TypeScript

**Spec Reference:** `docs/superpowers/specs/2026-04-15-agent-embedded-design.md` — Zone Integration, Migration, Delete web-agents, Agent Config in web-admin

**Depends On:** Plan 01-05 (all prior plans)

---

## File Structure

### Files to MODIFY

```
# All zone layout-client.tsx files (add AgentProvider)
apps/web-people/src/app/layout-client.tsx
apps/web-time/src/app/layout-client.tsx
apps/web-hiring/src/app/layout-client.tsx
apps/web-performance/src/app/layout-client.tsx
apps/web-projects/src/app/layout-client.tsx
apps/web-finance/src/app/layout-client.tsx
apps/web-goals/src/app/layout-client.tsx
apps/web-insights/src/app/layout-client.tsx
apps/web-planner/src/app/layout-client.tsx
apps/web-admin/src/app/layout-client.tsx
apps/web-shell/src/app/layout-client.tsx  (if it has one — shell may differ)

# All zone package.json files (add @future/agent dependency)
apps/web-people/package.json
apps/web-time/package.json
apps/web-hiring/package.json
apps/web-performance/package.json
apps/web-projects/package.json
apps/web-finance/package.json
apps/web-goals/package.json
apps/web-insights/package.json
apps/web-planner/package.json
apps/web-admin/package.json

# Admin navigation
apps/web-admin/src/navigation.ts

# UI app registry
packages/ui/src/components/app-launcher.tsx (or wherever FUTURE_APPS / LOCAL_FUTURE_APPS is defined)
```

### Files to DELETE

```
apps/web-agents/  (entire directory)
```

---

### Task 1: Add @future/agent to all zone package.json files

**Files:**

- Modify: All `apps/web-*/package.json`

- [ ] **Step 1: Add dependency to all zones**

```bash
cd /Users/canh/Projects/Seta/future
bun add @future/agent --filter @future/web-people
bun add @future/agent --filter @future/web-time
bun add @future/agent --filter @future/web-hiring
bun add @future/agent --filter @future/web-performance
bun add @future/agent --filter @future/web-projects
bun add @future/agent --filter @future/web-finance
bun add @future/agent --filter @future/web-goals
bun add @future/agent --filter @future/web-insights
bun add @future/agent --filter @future/web-planner
bun add @future/agent --filter @future/web-admin
```

Note: `web-shell` may not need `@future/agent` if it doesn't render entity pages — check first.

- [ ] **Step 2: Verify**

```bash
grep -l '@future/agent' apps/web-*/package.json
```

Expected: All 10 zone package.json files listed.

- [ ] **Step 3: Install**

```bash
bun install
```

- [ ] **Step 4: Commit**

```bash
git add apps/web-*/package.json bun.lock
git commit -m "chore: add @future/agent dependency to all zones"
```

---

### Task 2: Add AgentProvider to all zone layouts

**Files:**

- Modify: All `apps/web-*/src/app/layout-client.tsx`

Every zone follows the same pattern. Read each file first, then apply the same transformation.

- [ ] **Step 1: Read current pattern**

```bash
cat apps/web-people/src/app/layout-client.tsx
```

Current:

```typescript
import { AppLayout, PermissionTrpcClient } from '@future/app-layout'
import { trpc } from '../lib/trpc'
import { peopleNavConfig } from '../navigation'

export function PeopleLayoutClient({ children }: { children: ReactNode }) {
  return (
    <AppLayout config={peopleNavConfig} trpc={trpc as unknown as PermissionTrpcClient}>
      {children}
    </AppLayout>
  )
}
```

- [ ] **Step 2: Update web-people layout**

Modify `apps/web-people/src/app/layout-client.tsx`:

```typescript
'use client'

import type { ReactNode } from 'react'
import { AppLayout, type PermissionTrpcClient } from '@future/app-layout'
import { AgentProvider } from '@future/agent'
import { trpc } from '../lib/trpc'
import { peopleNavConfig } from '../navigation'

export function PeopleLayoutClient({ children }: { children: ReactNode }) {
  return (
    <AgentProvider>
      <AppLayout config={peopleNavConfig} trpc={trpc as unknown as PermissionTrpcClient}>
        {children}
      </AppLayout>
    </AgentProvider>
  )
}
```

- [ ] **Step 3: Apply same pattern to all other zones**

For each zone, the change is identical — add `import { AgentProvider } from '@future/agent'` and wrap `<AppLayout>` with `<AgentProvider>`. Read each file first and apply:

```bash
# List all layout-client files
find apps/web-* -name "layout-client.tsx" -path "*/app/*"
```

Apply to each:

- `apps/web-time/src/app/layout-client.tsx`
- `apps/web-hiring/src/app/layout-client.tsx`
- `apps/web-performance/src/app/layout-client.tsx`
- `apps/web-projects/src/app/layout-client.tsx`
- `apps/web-finance/src/app/layout-client.tsx`
- `apps/web-goals/src/app/layout-client.tsx`
- `apps/web-insights/src/app/layout-client.tsx`
- `apps/web-planner/src/app/layout-client.tsx`
- `apps/web-admin/src/app/layout-client.tsx`

For `web-shell`: check if it has a layout-client. The shell may have a different structure since it's the auth entry point. If it uses `AppLayout`, add `AgentProvider`. If it's a minimal auth shell without `AppLayout`, skip it.

- [ ] **Step 4: Verify typecheck for a sample zone**

```bash
cd apps/web-people && npx tsc --noEmit --pretty
```

Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web-*/src/app/layout-client.tsx
git commit -m "feat: add AgentProvider to all zone layouts"
```

---

### Task 3: Delete web-agents zone

**Files:**

- Delete: `apps/web-agents/` (entire directory)
- Modify: `packages/ui/src/components/app-launcher.tsx` (remove agents from app registry)

- [ ] **Step 1: Delete the directory**

```bash
rm -rf apps/web-agents
```

- [ ] **Step 2: Remove from app registry**

Read the app launcher to find where `FUTURE_APPS` and `LOCAL_FUTURE_APPS` are defined:

```bash
grep -n "agents" packages/ui/src/components/app-launcher.tsx
```

Remove the agents entry from both `FUTURE_APPS` and `LOCAL_FUTURE_APPS` arrays. The entry will look something like:

```typescript
{ id: 'agents', name: 'Agents', icon: Bot, href: '...', port: 3009 }
```

Delete this entry.

- [ ] **Step 3: Remove from turbo.json if referenced**

```bash
grep -rn "web-agents" turbo.json
```

If `web-agents` is referenced by name in turbo.json, remove it. Turbo typically discovers workspaces automatically from package.json — if so, deleting the directory is sufficient.

- [ ] **Step 4: Check for any cross-references**

```bash
grep -rn "web-agents" apps/ packages/ --include="*.ts" --include="*.tsx" --include="*.json" | grep -v node_modules | grep -v ".next"
```

Remove any remaining references (CI configs, terraform, etc. are out of scope but note them).

- [ ] **Step 5: Verify build**

```bash
bun install
bun run --filter "@future/*" build
```

Expected: Build succeeds without web-agents.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: delete web-agents zone — agents now embedded via @future/agent"
```

---

### Task 4: Add agent config navigation to web-admin

**Files:**

- Modify: `apps/web-admin/src/navigation.ts`

- [ ] **Step 1: Read current admin navigation**

```bash
cat apps/web-admin/src/navigation.ts
```

Current:

```typescript
sidebar: [
  {
    items: [
      {
        label: 'Tenant Settings',
        icon: Settings,
        href: '/settings',
        permission: 'admin:settings:read',
      },
      { label: 'AI Config', icon: Cpu, href: '/ai-config', permission: 'admin:ai:read' },
      {
        label: 'Module Toggles',
        icon: ToggleRight,
        href: '/modules',
        permission: 'admin:module:read',
      },
      { label: 'Roles & Permissions', icon: Shield, href: '/roles', permission: 'admin:role:read' },
    ],
  },
]
```

- [ ] **Step 2: Add agent config section**

Add a new sidebar group for agent management. Import `Bot` from lucide-react:

```typescript
import { Settings, Cpu, ToggleRight, Shield, Bot } from 'lucide-react'
```

Add a new group to the sidebar array:

```typescript
sidebar: [
  {
    items: [
      { label: 'Tenant Settings', icon: Settings, href: '/settings', permission: 'admin:settings:read' },
      { label: 'AI Config', icon: Cpu, href: '/ai-config', permission: 'admin:ai:read' },
      { label: 'Module Toggles', icon: ToggleRight, href: '/modules', permission: 'admin:module:read' },
      { label: 'Roles & Permissions', icon: Shield, href: '/roles', permission: 'admin:role:read' },
    ],
  },
  {
    label: 'Agents',
    items: [
      { label: 'Agent Definitions', icon: Bot, href: '/agents', permission: 'admin:agents:read' },
      { label: 'Sessions', icon: Bot, href: '/agents/sessions', permission: 'admin:agents:read' },
    ],
  },
],
```

- [ ] **Step 3: Create placeholder pages**

Create `apps/web-admin/src/app/agents/page.tsx`:

```tsx
export default function AgentDefinitionsPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Agent Definitions</h1>
      <p className="mt-2 text-muted-foreground">
        Manage agent definitions, topics, actions, and guardrails.
      </p>
    </div>
  )
}
```

Create `apps/web-admin/src/app/agents/sessions/page.tsx`:

```tsx
export default function AgentSessionsPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Agent Sessions</h1>
      <p className="mt-2 text-muted-foreground">Browse past agent conversations and audit trail.</p>
    </div>
  )
}
```

- [ ] **Step 4: Verify typecheck**

```bash
cd apps/web-admin && npx tsc --noEmit --pretty
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web-admin/src/navigation.ts apps/web-admin/src/app/agents/
git commit -m "feat(admin): add agent config navigation and placeholder pages"
```

---

### Task 5: Add AgentContextProvider to key entity pages (web-people as reference)

**Files:**

- Modify: Entity pages in `apps/web-people/`

This task sets the pattern that all other zones will follow. Start with web-people since it has the most developed entity pages.

- [ ] **Step 1: Find entity pages**

```bash
find apps/web-people/src/app -name "page.tsx" | head -20
```

Identify pages that show a single entity (e.g., `/employees/[id]/page.tsx`).

- [ ] **Step 2: Read a representative entity page**

```bash
cat apps/web-people/src/app/employees/\[id\]/page.tsx
```

- [ ] **Step 3: Add AgentContextProvider to the entity page**

Wrap the page content with `AgentContextProvider` and add `AgentBanner`, `AgentBadge`, and `AgentInlineAction`. The exact modification depends on the current page structure.

Pattern to apply:

```tsx
import { AgentContextProvider, AgentBadge, AgentBanner, AgentInlineAction } from '@future/agent'
import { Sparkles, UserMinus } from 'lucide-react'

// Wrap the page's return JSX:
;<AgentContextProvider
  module="people"
  entity="employee"
  id={params.id}
  metadata={
    {
      /* relevant employee data */
    }
  }
>
  <AgentBanner />
  {/* existing page content */}
  {/* Add AgentBadge near the page title */}
  {/* Add AgentInlineAction in the page header actions */}
</AgentContextProvider>
```

The inline actions for people/employee:

```tsx
<AgentInlineAction
  actions={[
    { key: 'summarize', label: 'Summarize', icon: Sparkles },
    { key: 'draft-offboarding', label: 'Draft Offboarding', icon: UserMinus },
  ]}
/>
```

- [ ] **Step 4: Repeat for other entity pages in web-people**

Apply the same pattern to:

- `/departments/[id]/page.tsx` (if exists)
- `/org-chart` page (if it shows entity detail)
- `/offboarding/[id]/page.tsx` (if exists)

Each gets `module="people"` with entity-appropriate `entity` and `metadata`.

- [ ] **Step 5: Verify typecheck**

```bash
cd apps/web-people && npx tsc --noEmit --pretty
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web-people/src/
git commit -m "feat(people): add AgentContextProvider and inline actions to entity pages"
```

---

### Task 6: Add AgentContextProvider to remaining zones

Apply the same pattern from Task 5 to all other zones. For each zone:

1. Find entity pages (`find apps/web-{zone}/src/app -name "page.tsx"`)
2. Read each entity page
3. Wrap with `AgentContextProvider` using the correct `module` key
4. Add `AgentBanner`, `AgentBadge`, `AgentInlineAction` with entity-appropriate actions

**Zone → Module → Example entities:**

| Zone            | Module Key    | Entities                  | Example Inline Actions                      |
| --------------- | ------------- | ------------------------- | ------------------------------------------- |
| web-time        | `time`        | leave-request, attendance | Check Policy, Suggest Alternatives          |
| web-hiring      | `hiring`      | candidate, pipeline       | Score Against JD, Draft Interview Questions |
| web-performance | `performance` | review-cycle              | Progress Summary, Draft Feedback            |
| web-projects    | `projects`    | project, assignment       | Staffing Risk, Generate Status Update       |
| web-finance     | `finance`     | invoice                   | Verify Compliance, Flag Anomalies           |
| web-goals       | `goals`       | okr                       | Progress Forecast, Suggest Key Results      |
| web-planner     | `planner`     | task                      | Prioritize, Link to KPI                     |

For zones with minimal entity pages (web-insights, web-admin), only add `AgentContextProvider` where there are actual entity detail views.

- [ ] **Step 1: Process each zone**

For each zone, read the entity pages, wrap with context, add components. Commit per zone:

```bash
# After each zone:
git add apps/web-{zone}/src/
git commit -m "feat({zone}): add AgentContextProvider and inline actions"
```

- [ ] **Step 2: Final full typecheck**

```bash
bun run --filter "@future/*" build
```

Expected: All packages and zones build successfully.

---

### Task 7: Final verification

- [ ] **Step 1: Run all tests**

```bash
bun run --filter "@future/*" test:unit
```

Expected: All tests pass across all packages and zones.

- [ ] **Step 2: Verify web-agents is gone**

```bash
ls apps/web-agents 2>&1
```

Expected: `No such file or directory`

- [ ] **Step 3: Verify agent panel works in layout**

```bash
# Start dev server for a zone
cd apps/web-people && bun dev
```

Open in browser. Verify:

- Bot button visible in GlobalNav
- Clicking Bot button opens the agent panel on the right
- Content area compresses when panel is open
- AgentStrip shows below navbar (empty when no insights)
- Panel has message input and "Start a conversation" empty state

- [ ] **Step 4: Verify admin agent navigation**

```bash
cd apps/web-admin && bun dev
```

Open in browser. Verify:

- "Agents" section in sidebar
- "Agent Definitions" and "Sessions" nav items visible
- Clicking navigates to placeholder pages
