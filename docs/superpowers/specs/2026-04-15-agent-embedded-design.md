# Embedded Agent Package (`packages/agent`)

**Date:** 2026-04-15
**Status:** Draft

## Problem

The agent system is architected as a standalone zone (`web-agents`) — a portal users navigate to for AI interactions. This contradicts Future's identity as an Agent-as-a-Service platform. Agents should be the primary interaction paradigm woven into every surface, not a destination.

Industry direction confirms this: ServiceNow explicitly declared sidebar-only AI an antipattern ("beyond the sidecar era"). Linear makes AI invisible — auto-triage is just how the product works. Salesforce Agentforce embeds agents across every Cloud. Microsoft Copilot shares one orchestrator with per-app declarative configuration.

## Decisions

| Decision          | Choice                                       | Rationale                                                                                      |
| ----------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Architecture      | Multi-surface (panel + inline + ambient)     | Three surfaces cover all interaction modes: conversation, contextual action, proactive insight |
| `web-agents` zone | Eliminated — config moves to `web-admin`     | Agent config is an admin concern; no standalone agent portal                                   |
| Context passing   | Explicit `<AgentContextProvider>` only       | No URL-parsing magic — every zone passes structured context. One way, no ambiguity             |
| Ambient surface   | AgentStrip (global) + badges/banners (local) | Global awareness ("3 insights") + local action (badge on the entity)                           |
| Package structure | Single `@future/agent` package               | One import, one version, no coordination overhead                                              |
| Panel behavior    | Toggle via GlobalNav Bot button              | Content area compresses when open; agent is available but not competing for space              |
| Integration level | All zones, all surfaces, mandatory           | No opt-in tiers. Every zone integrates all three surfaces                                      |

## Architecture

### Package Structure

```
packages/agent/
  src/
    index.ts                    → public exports
    types.ts                    → AgentContext, AgentInsight, AgentAction, session types
    agent-provider.tsx          → root provider: WebSocket, tRPC client, session state
    context/
      agent-context-provider.tsx → per-page entity context (module, entity, id, metadata)
      use-agent-context.ts       → read current entity context
    panel/
      agent-panel.tsx           → right-side conversational panel
      agent-message.tsx         → chat message bubble (user, assistant, tool_call, tool_result)
      agent-tool-trace.tsx      → expandable tool call trace with audit info
      agent-context-pills.tsx   → shows current context entities the agent is aware of
      use-agent-session.ts      → manage conversation session lifecycle
    inline/
      agent-inline-action.tsx   → contextual AI action button/menu on entities
      agent-inline-response.tsx → inline rendered agent response (below the action trigger)
    ambient/
      agent-strip.tsx           → GlobalNav ambient bar ("3 insights · People (2)")
      agent-badge.tsx           → entity-level insight badge (icon + count)
      agent-banner.tsx          → page-level insight banner (dismissible, actionable)
      use-agent-insights.ts     → subscribe to ambient insights for current context
```

### Type Contracts

```typescript
// Entity context passed by every zone page
interface AgentContext {
  module: ModuleKey // 'people' | 'time' | 'hiring' | ...
  entity: string // 'employee' | 'leave-request' | 'candidate' | ...
  id: string // entity UUID
  metadata?: Record<string, unknown> // domain-specific enrichment
}

// Insight pushed by ambient surface
interface AgentInsight {
  id: string
  module: ModuleKey
  entity: string
  entityId: string
  severity: 'info' | 'warning' | 'critical'
  title: string // "Visa expires Jun 15"
  description: string
  actionLabel?: string // "Draft renewal request"
  actionHref?: string // deep link to entity page
  createdAt: Date
}

// Inline action registered per entity type
interface AgentInlineActionConfig {
  key: string // 'summarize' | 'draft-offboarding' | ...
  label: string
  icon: LucideIcon
  permission?: string // required permission to see this action
}

type ModuleKey =
  | 'people'
  | 'time'
  | 'hiring'
  | 'performance'
  | 'projects'
  | 'finance'
  | 'goals'
  | 'insights'
  | 'planner'
  | 'admin'
  | 'kernel'
```

### Zone Integration

Every zone follows one pattern. No variations.

```typescript
// apps/web-people/src/app/layout-client.tsx
import { AgentProvider } from '@future/agent'

export function LayoutClient({ children }: { children: ReactNode }) {
  return (
    <AgentProvider>
      <AppLayout navConfig={peopleNavConfig}>
        {children}
      </AppLayout>
    </AgentProvider>
  )
}
```

```typescript
// apps/web-people/src/app/employees/[id]/page.tsx
import {
  AgentContextProvider,
  AgentBadge,
  AgentInlineAction,
  AgentBanner,
} from '@future/agent'

export default function EmployeePage({ params }: { params: { id: string } }) {
  const employee = trpc.people.getEmployee.useQuery(params.id)

  return (
    <AgentContextProvider
      module="people"
      entity="employee"
      id={params.id}
      metadata={{
        department: employee.data?.department,
        status: employee.data?.status,
        hireDate: employee.data?.hireDate,
      }}
    >
      <AgentBanner />
      <PageHeader
        title={employee.data?.name}
        badge={<AgentBadge />}
        actions={
          <AgentInlineAction
            actions={[
              { key: 'summarize', label: 'Summarize', icon: Sparkles },
              { key: 'draft-offboarding', label: 'Draft Offboarding', icon: UserMinus },
            ]}
          />
        }
      />
      <EmployeeDetails data={employee.data} />
    </AgentContextProvider>
  )
}
```

### Layout Structure

```
┌─────────────────────────────────────────────────────────┐
│  GlobalNav  [Search or ask…]  [Bot]  [Bell]  [User]    │
│  AgentStrip: "2 insights · People (1) · Projects (1)"  │
├────────┬──────────────────────────┬─────────────────────┤
│        │                          │                     │
│  Side  │   Page Content           │   Agent Panel       │
│  bar   │   ┌─AgentBanner────────┐ │   (visible when     │
│        │   │ ⚠ Visa exp Jun 15  │ │    toggled via Bot) │
│        │   └────────────────────┘ │                     │
│        │                          │   Chat messages     │
│        │   Employee: John Doe     │   Context pills     │
│        │   [AgentBadge: 1]        │   Tool call trace   │
│        │   [Summarize ▾] inline   │                     │
│        │                          │                     │
├────────┴──────────────────────────┴─────────────────────┤
```

When the panel is closed, content takes full width. When open, content compresses. Panel opens/closes via the Bot button in GlobalNav.

### AgentProvider Responsibilities

`<AgentProvider>` wraps the entire app layout and manages state only — no rendering. `AppLayout` reads this state and renders the panel, strip, and toggle.

1. **WebSocket connection** — persistent connection to the Agent Gateway for streaming responses and real-time insight delivery
2. **Session state** — current conversation session, message history, active tool calls
3. **Panel state** — open/closed toggle, consumed by `AppLayout` to render the panel
4. **Insight subscription** — receives ambient insights from the backend, stores in state for `AgentStrip` and `AgentBadge`/`AgentBanner` to consume
5. **Context aggregation** — collects the current `AgentContext` from the nearest `<AgentContextProvider>` and passes it to the panel and inline surfaces

```typescript
// Internal provider structure
function AgentProvider({ children }: { children: ReactNode }) {
  const [panelOpen, setPanelOpen] = useState(false)
  const [session, sessionActions] = useAgentSessionState()
  const ws = useAgentWebSocket()
  const insights = useAgentInsightSubscription(ws)

  return (
    <AgentStateContext.Provider value={{ panelOpen, setPanelOpen, session, sessionActions, ws, insights }}>
      {children}
    </AgentStateContext.Provider>
  )
}
```

### app-layout Integration

`@future/app-layout` gains awareness of the agent panel:

```typescript
// packages/app-layout/src/app-layout.tsx
import { useAgentState, AgentPanel } from '@future/agent'

export function AppLayout({ navConfig, children }: AppLayoutProps) {
  const { panelOpen } = useAgentState()

  return (
    <div className="flex h-screen flex-col">
      <NavbarRenderer
        config={navConfig.navbar}
        agentStrip={<AgentStrip />}
        onAgentClick={() => togglePanel()}
      />
      <div className="flex flex-1 overflow-hidden">
        <SidebarRenderer config={navConfig.sidebar} />
        <main className={cn('flex-1 overflow-auto', panelOpen && 'mr-[400px]')}>
          {children}
        </main>
        {panelOpen && <AgentPanel />}
      </div>
    </div>
  )
}
```

### GlobalNav Integration

The existing `GlobalNav` component changes:

- Bot button (`<Bot />` icon) toggles the panel via `useAgentState().setPanelOpen`
- `AgentStrip` renders below the nav bar, showing insight counts grouped by module
- "Search or ask..." input gains dual mode: search routes to search, natural language routes to agent panel (opens it and sends the query)

### Inline Actions Flow

When a user clicks an `AgentInlineAction`:

1. `AgentInlineAction` reads the current `AgentContext` from the nearest `<AgentContextProvider>`
2. Sends a structured request to the Agent Gateway: `{ action: 'summarize', context: { module: 'people', entity: 'employee', id: '...' } }`
3. Response streams back via WebSocket
4. `AgentInlineResponse` renders below the action trigger — inline on the page, not in the panel
5. If the user wants to continue the conversation, they click "Continue in panel" which transfers the context to the agent panel

### Ambient Insights Flow

1. Agent Gateway runs proactive insight jobs (event-triggered or scheduled) per tenant
2. Insights are pushed to connected WebSocket clients
3. `AgentProvider` receives insights and stores in state
4. `AgentStrip` shows aggregated counts: "3 insights · People (2) · Projects (1)"
5. `AgentBadge` on entity pages filters insights matching the current `AgentContext` and shows a count
6. `AgentBanner` renders the highest-severity insight for the current entity as a dismissible banner at the top of the page
7. Clicking an insight in the strip navigates to the entity page where the badge/banner provides detail

## Backend Changes

### Delete `apps/web-agents/`

Remove the zone entirely:

- Delete `apps/web-agents/` directory
- Remove from `turbo.json` pipeline
- Remove from CI/CD (ECR repo, ECS service, Terraform)
- Remove from `packages/ui` app registry (`LOCAL_FUTURE_APPS` and `FUTURE_APPS`)
- Remove port 3009 allocation

### Agent Config in `web-admin`

Agent Builder pages move to `web-admin`:

- `/admin/agents` — list agent definitions
- `/admin/agents/[id]` — edit agent: topics, actions, guardrails
- `/admin/agents/[id]/test` — test conversation sandbox
- `/admin/agents/sessions` — session history browser
- `/admin/agents/analytics` — token usage, tool call frequency, error rates

All backed by the existing `agents.router.ts` tRPC routes, consumed by `web-admin`.

### New tRPC Routes (agents.router.ts)

```typescript
// Conversation
agents.session.create // create new session with context
agents.session.list // list sessions for actor
agents.message.send // send message (HTTP fallback for non-WS clients)

// Insights
agents.insight.list // list active insights for actor
agents.insight.dismiss // dismiss an insight

// Config (consumed by web-admin)
agents.definition.list // list agent definitions for tenant
agents.definition.get // get agent definition with topics/actions/guardrails
agents.definition.upsert // create or update agent definition
agents.topic.upsert // create or update topic
agents.action.upsert // create or update action
agents.guardrail.upsert // create or update guardrail
```

### WebSocket Gateway

```typescript
// apps/api/src/modules/agents/interface/ws/agent.gateway.ts
@WebSocketGateway({ path: '/ws/agent' })
export class AgentWebSocketGateway {
  // Client connects with session cookie → authenticate → subscribe to insights
  handleConnection(client: Socket)

  // Client sends message → route to Agent Gateway → stream response tokens back
  @SubscribeMessage('message')
  handleMessage(client: Socket, payload: { sessionId: string; content: string })

  // Server pushes insight to connected clients
  pushInsight(actorId: string, insight: AgentInsight)
}
```

## Dependency Graph

```
@future/agent
  depends on: @future/ui (components), @future/api-client (tRPC), @future/core (types)

@future/app-layout
  depends on: @future/agent (AgentPanel, AgentStrip, useAgentState)
  depends on: @future/ui (sidebar, navbar primitives)

apps/web-{zone}/
  depends on: @future/app-layout (layout with agent panel built in)
  depends on: @future/agent (AgentContextProvider, AgentBadge, AgentInlineAction, AgentBanner)
```

Note: `@future/app-layout` imports from `@future/agent` directly. No peer dependency indirection. The agent is not optional.

## Migration: What Changes Per Zone

Every zone gets the same changes:

### layout-client.tsx (every zone)

```diff
+ import { AgentProvider } from '@future/agent'

  export function LayoutClient({ children }) {
    return (
+     <AgentProvider>
        <AppLayout navConfig={navConfig}>
          {children}
        </AppLayout>
+     </AgentProvider>
    )
  }
```

### Every entity page (every zone)

Wrap with `<AgentContextProvider>`, add `<AgentBanner>`, `<AgentBadge>`, and `<AgentInlineAction>` to the page header. The inline actions are entity-specific — each module defines what actions make sense for its entities.

### Entity-to-action mapping (per module)

Each module defines its inline actions. Examples:

| Module      | Entity        | Inline Actions                                 |
| ----------- | ------------- | ---------------------------------------------- |
| people      | employee      | Summarize, Draft Offboarding, Check Compliance |
| people      | org-chart     | Suggest Restructure, Gap Analysis              |
| time        | leave-request | Check Policy, Suggest Alternatives             |
| time        | attendance    | Detect Anomalies, Generate Report              |
| hiring      | candidate     | Score Against JD, Draft Interview Questions    |
| hiring      | pipeline      | Pipeline Summary, Bottleneck Analysis          |
| performance | review-cycle  | Progress Summary, Draft Feedback               |
| projects    | project       | Staffing Risk, Generate Status Update          |
| projects    | assignment    | Utilization Analysis                           |
| finance     | invoice       | Verify Compliance, Flag Anomalies              |
| goals       | okr           | Progress Forecast, Suggest Key Results         |
| planner     | task          | Prioritize, Link to KPI                        |

## Out of Scope

- Agent Gateway implementation (already designed in `docs/architecture/agent-runtime.md`)
- MCP tool implementation per module (separate spec per module)
- Channel adapters (Slack, Teams) — these remain backend concerns
- Agent Builder UI in web-admin (separate spec)
- Database schema for agents module (defined in agent-runtime.md)
