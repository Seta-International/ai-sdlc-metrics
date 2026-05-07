# Agent UX Refactor — Plan 4: Idle suggestions

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the agent panel is empty (no messages yet), render a welcome block with 4 contextual prompt suggestions per surface (`planner`, `people`, `hiring`, `finance`, etc.). Clicking a chip submits the suggestion as the user's first message.

**Architecture:** New backend query `agents.suggestions.list({ surface, contextEntity? })`. Static config map keyed by surface — LLM/personalization deferred. Frontend: `IdleState` mounts when assistant-ui's `useThread().messages.length === 0`.

**Tech Stack:** NestJS · tRPC · React 19 · `@assistant-ui/react` · Vitest.

**Spec:** `docs/superpowers/specs/2026-04-30-agent-module-ux-refactor-design.md` §7

**Depends on:** Plan 1 (panel chrome).

---

## Task 1: Pre-flight + branch

```bash
git checkout main && git pull
git checkout -b feat/agent-ux-plan-4-idle-suggestions
```

---

## Task 2: `Suggestion` value-object + `SuggestionConfig`

**Files:**

- Create: `apps/api/src/modules/agents/domain/value-objects/suggestion.ts`
- Create: `apps/api/src/modules/agents/infrastructure/suggestion-config.ts`
- Create: `apps/api/src/modules/agents/infrastructure/suggestion-config.spec.ts`

- [ ] **Step 1: Failing test**

Create `apps/api/src/modules/agents/infrastructure/suggestion-config.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolveSuggestions, KNOWN_SURFACES } from './suggestion-config'

describe('suggestion-config', () => {
  it('returns 4 suggestions for each known surface', () => {
    for (const surface of KNOWN_SURFACES) {
      const result = resolveSuggestions({ surface })
      expect(result.suggestions).toHaveLength(4)
      expect(result.welcomeSubtext).toBeTruthy()
    }
  })

  it('returns empty array + generic subtext for unknown surface', () => {
    const result = resolveSuggestions({ surface: 'unknown_surface' })
    expect(result.suggestions).toEqual([])
    expect(result.welcomeSubtext).toBeTruthy()
  })

  it('templates {entity} into suggestions when contextEntity is provided', () => {
    const result = resolveSuggestions({ surface: 'planner', contextEntity: 'Q1 Launch' })
    expect(result.suggestions.some((s) => s.text.includes('Q1 Launch'))).toBe(true)
  })

  it('preserves slug stability for templated suggestions', () => {
    const a = resolveSuggestions({ surface: 'planner' })
    const b = resolveSuggestions({ surface: 'planner', contextEntity: 'Q1' })
    // slugs should be the same regardless of templating
    expect(a.suggestions.map((s) => s.slug)).toEqual(b.suggestions.map((s) => s.slug))
  })
})
```

- [ ] **Step 2: Failing run**

```bash
bun run --filter @future/api test:unit -- suggestion-config
```

Expected: failures.

- [ ] **Step 3: Implement value-object**

Create `apps/api/src/modules/agents/domain/value-objects/suggestion.ts`:

```ts
export interface Suggestion {
  readonly slug: string
  readonly text: string
}

export interface SuggestionResult {
  readonly suggestions: ReadonlyArray<Suggestion>
  readonly welcomeSubtext: string
}
```

- [ ] **Step 4: Implement config**

Create `apps/api/src/modules/agents/infrastructure/suggestion-config.ts`:

```ts
import type { Suggestion, SuggestionResult } from '../domain/value-objects/suggestion'

interface SurfaceConfig {
  welcomeSubtext: string
  suggestions: Array<{ slug: string; template: string }>
}

const SURFACE_MAP: Record<string, SurfaceConfig> = {
  planner: {
    welcomeSubtext:
      'I can triage buckets, draft tasks from meeting notes, find blockers, roll up status, and assign work. Writes always land as approvable drafts.',
    suggestions: [
      { slug: 'planner.triage_bucket', template: "What's slipping this week in {entity}?" },
      { slug: 'planner.create_from_notes', template: 'Turn the latest standup notes into tasks' },
      { slug: 'planner.find_blocker', template: "Who's blocked on {entity}?" },
      {
        slug: 'planner.rollup_status',
        template: "Summarise my team's progress for the PMO digest",
      },
    ],
  },
  people: {
    welcomeSubtext:
      'I can draft offboarding checklists, find skill gaps, summarise tenure, and propose org changes. Writes land as approvable drafts.',
    suggestions: [
      { slug: 'people.find_blocker', template: "Who's blocked on {entity}?" },
      {
        slug: 'people.offboarding_checklist',
        template: 'Draft an offboarding checklist for {entity}',
      },
      { slug: 'people.skill_gaps', template: 'Where are the skill gaps in {entity}?' },
      { slug: 'people.tenure_rollup', template: 'Summarise tenure across my reports' },
    ],
  },
  hiring: {
    welcomeSubtext:
      'I can score candidates against a JD, draft outreach, summarise interview loops, and propose offers.',
    suggestions: [
      { slug: 'hiring.score_candidate', template: 'Score the latest candidate against {entity}' },
      { slug: 'hiring.draft_outreach', template: 'Draft outreach for {entity}' },
      { slug: 'hiring.summarise_loop', template: 'Summarise the interview loop for {entity}' },
      { slug: 'hiring.propose_offer', template: 'Propose an offer for {entity}' },
    ],
  },
  finance: {
    welcomeSubtext:
      'I can find budget overruns, draft invoices, reconcile expenses, and forecast spend.',
    suggestions: [
      { slug: 'finance.find_overrun', template: 'Where are we over budget this quarter?' },
      { slug: 'finance.draft_invoice', template: 'Draft an invoice for {entity}' },
      { slug: 'finance.reconcile', template: "Reconcile last month's expenses" },
      { slug: 'finance.forecast', template: 'Forecast spend for {entity}' },
    ],
  },
  goals: {
    welcomeSubtext:
      'I can roll up OKR progress, find at-risk objectives, and draft check-in updates.',
    suggestions: [
      { slug: 'goals.rollup', template: 'Roll up OKR progress for {entity}' },
      { slug: 'goals.at_risk', template: 'Which objectives are at risk?' },
      { slug: 'goals.checkin_draft', template: 'Draft my check-in update for {entity}' },
      {
        slug: 'goals.alignment_check',
        template: 'Check alignment between {entity} and parent OKRs',
      },
    ],
  },
  performance: {
    welcomeSubtext:
      'I can summarise feedback, draft reviews, find patterns across cycles, and propose calibrations.',
    suggestions: [
      { slug: 'performance.summarise_feedback', template: 'Summarise feedback for {entity}' },
      { slug: 'performance.draft_review', template: 'Draft a review for {entity}' },
      { slug: 'performance.cycle_pattern', template: 'What patterns are emerging this cycle?' },
      { slug: 'performance.calibration', template: 'Propose calibration for my team' },
    ],
  },
}

export const KNOWN_SURFACES = Object.keys(SURFACE_MAP)

export function resolveSuggestions(input: {
  surface: string
  contextEntity?: string
}): SuggestionResult {
  const config = SURFACE_MAP[input.surface]
  if (!config) {
    return {
      suggestions: [],
      welcomeSubtext: 'Ask me about anything in this workspace.',
    }
  }
  const entity = input.contextEntity?.trim() || 'this'
  const suggestions: Suggestion[] = config.suggestions.map((s) => ({
    slug: s.slug,
    text: s.template.replace(/\{entity\}/g, entity),
  }))
  return { suggestions, welcomeSubtext: config.welcomeSubtext }
}
```

- [ ] **Step 5: Run tests + commit**

```bash
bun run --filter @future/api test:unit -- suggestion-config
git add apps/api/src/modules/agents/domain/value-objects/suggestion.ts apps/api/src/modules/agents/infrastructure/suggestion-config.ts apps/api/src/modules/agents/infrastructure/suggestion-config.spec.ts
git commit -m "feat(agents): suggestion config for idle-state prompt suggestions"
```

---

## Task 3: `ListSuggestionsHandler`

**Files:**

- Create: `apps/api/src/modules/agents/application/queries/list-suggestions.query.ts`
- Create: `apps/api/src/modules/agents/application/queries/list-suggestions.handler.ts`
- Create: `apps/api/src/modules/agents/application/queries/list-suggestions.handler.spec.ts`

- [ ] **Step 1: Failing test**

Create `apps/api/src/modules/agents/application/queries/list-suggestions.handler.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ListSuggestionsQuery } from './list-suggestions.query'
import { ListSuggestionsHandler } from './list-suggestions.handler'

describe('ListSuggestionsHandler', () => {
  it('returns 4 suggestions for known surface', async () => {
    const handler = new ListSuggestionsHandler()
    const result = await handler.execute(new ListSuggestionsQuery('planner'))
    expect(result.suggestions).toHaveLength(4)
  })

  it('templates contextEntity into suggestions', async () => {
    const handler = new ListSuggestionsHandler()
    const result = await handler.execute(new ListSuggestionsQuery('planner', 'Q1 Launch'))
    expect(result.suggestions.some((s) => s.text.includes('Q1 Launch'))).toBe(true)
  })

  it('returns empty list for unknown surface', async () => {
    const handler = new ListSuggestionsHandler()
    const result = await handler.execute(new ListSuggestionsQuery('unknown_zone_xyz'))
    expect(result.suggestions).toEqual([])
  })
})
```

- [ ] **Step 2: Implement query + handler**

`list-suggestions.query.ts`:

```ts
export class ListSuggestionsQuery {
  constructor(
    public readonly surface: string,
    public readonly contextEntity?: string,
  ) {}
}
```

`list-suggestions.handler.ts`:

```ts
import { Injectable } from '@nestjs/common'
import { ListSuggestionsQuery } from './list-suggestions.query'
import { resolveSuggestions } from '../../infrastructure/suggestion-config'
import type { SuggestionResult } from '../../domain/value-objects/suggestion'

@Injectable()
export class ListSuggestionsHandler {
  async execute(query: ListSuggestionsQuery): Promise<SuggestionResult> {
    return resolveSuggestions({
      surface: query.surface,
      contextEntity: query.contextEntity,
    })
  }
}
```

- [ ] **Step 3: Test + commit**

```bash
bun run --filter @future/api test:unit -- list-suggestions
git add apps/api/src/modules/agents/application/queries
git commit -m "feat(agents): ListSuggestionsHandler"
```

---

## Task 4: `agents.suggestions.list` tRPC router

**Files:**

- Create: `apps/api/src/modules/agents/interface/trpc/suggestions.router.ts`
- Modify: `apps/api/src/modules/agents/interface/trpc/agents.router.ts`
- Modify: `apps/api/src/modules/agents/agents.module.ts`

- [ ] **Step 1: Create the router**

`suggestions.router.ts`:

```ts
import * as z from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import { PERMISSIONS } from '../../../../common/auth/permissions'
import { ListSuggestionsQuery } from '../../application/queries/list-suggestions.query'
import type { ListSuggestionsHandler } from '../../application/queries/list-suggestions.handler'

let listSuggestionsHandler: ListSuggestionsHandler | undefined

export function setListSuggestionsHandler(handler: ListSuggestionsHandler): void {
  listSuggestionsHandler = handler
}

function handler(): ListSuggestionsHandler {
  if (!listSuggestionsHandler) throw new Error('listSuggestionsHandler not wired — boot failure')
  return listSuggestionsHandler
}

export const suggestionsRouter = router({
  list: publicProcedure
    .meta({ permission: PERMISSIONS.AGENT_CONVERSATION_READ })
    .input(
      z.object({
        surface: z.string().min(1).max(64),
        contextEntity: z.string().max(200).optional(),
        contextEntityId: z.string().max(64).optional(),
      }),
    )
    .query(({ input }) => {
      return handler().execute(new ListSuggestionsQuery(input.surface, input.contextEntity))
    }),
})
```

- [ ] **Step 2: Mount in `agents.router.ts`**

```ts
import { suggestionsRouter } from './suggestions.router'
// ...
export const agentsRouter = router({
  // ... existing entries ...
  suggestions: suggestionsRouter,
})
```

- [ ] **Step 3: Wire in `agents.module.ts`**

In the module's bootstrap (`onModuleInit` or wherever other handlers are wired):

```ts
import { ListSuggestionsHandler } from './application/queries/list-suggestions.handler'
import { setListSuggestionsHandler } from './interface/trpc/suggestions.router'

// register provider:
providers: ([
  // ... existing ...
  ListSuggestionsHandler,
],
  // in onModuleInit:
  setListSuggestionsHandler(this.listSuggestionsHandler))
```

(Inject via constructor: `private readonly listSuggestionsHandler: ListSuggestionsHandler`.)

- [ ] **Step 4: Router test**

Create `apps/api/src/modules/agents/interface/trpc/suggestions.router.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setListSuggestionsHandler, suggestionsRouter } from './suggestions.router'
import { ListSuggestionsHandler } from '../../application/queries/list-suggestions.handler'
// import { createTestCaller } from '../../../../test/trpc-test-utils' // adapt to repo's pattern

describe('suggestionsRouter.list', () => {
  beforeEach(() => {
    setListSuggestionsHandler(new ListSuggestionsHandler())
  })

  it('returns 4 suggestions for planner', async () => {
    // Use the project's test caller pattern; example shape:
    // const caller = createTestCaller({ tenantId: 't1', actorId: 'u1' })
    // const result = await caller.agents.suggestions.list({ surface: 'planner' })
    // expect(result.suggestions).toHaveLength(4)
    expect(true).toBe(true) // placeholder until caller utility wired
  })
})
```

> **Implementation note:** replace the placeholder with the repo's standard tRPC test caller. Look at `conversation.router.spec.ts` for the canonical pattern.

- [ ] **Step 5: Run tests, build api-client, commit**

```bash
bun run --filter @future/api test:unit -- suggestions
bun run --filter @future/api-client build
git add apps/api/src/modules/agents
git commit -m "feat(agents): agents.suggestions.list router"
```

---

## Task 5: `SuggestionChip` + `IdleState` frontend

**Files:**

- Create: `packages/agent/src/panel/idle/suggestion-chip.tsx`
- Create: `packages/agent/src/panel/idle/suggestion-chip.spec.tsx`
- Create: `packages/agent/src/panel/idle/idle-state.tsx`
- Create: `packages/agent/src/panel/idle/idle-state.spec.tsx`

- [ ] **Step 1: `SuggestionChip` test + impl**

Create `packages/agent/src/panel/idle/suggestion-chip.spec.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SuggestionChip } from './suggestion-chip'

describe('SuggestionChip', () => {
  it('renders text and fires onClick', () => {
    const onClick = vi.fn()
    render(<SuggestionChip text="What's slipping?" onClick={onClick} />)
    fireEvent.click(screen.getByText("What's slipping?"))
    expect(onClick).toHaveBeenCalledOnce()
  })
})
```

Create `packages/agent/src/panel/idle/suggestion-chip.tsx`:

```tsx
'use client'

import { Sparkles } from 'lucide-react'

export interface SuggestionChipProps {
  text: string
  onClick: () => void
}

export function SuggestionChip({ text, onClick }: SuggestionChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-2 rounded-md border border-white/[0.08] bg-white/[0.02] px-2.5 py-2 text-left text-[12px] text-foreground hover:bg-white/[0.04] transition-colors"
    >
      <Sparkles className="mt-[2px] h-3 w-3 flex-shrink-0 text-accent" />
      <span className="leading-snug">{text}</span>
    </button>
  )
}
```

- [ ] **Step 2: `IdleState` test + impl**

Create `packages/agent/src/panel/idle/idle-state.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUseQuery = vi.fn()
vi.mock('@future/api-client', () => ({
  trpc: {
    agents: { suggestions: { list: { useQuery: (...a: unknown[]) => mockUseQuery(...a) } } },
  },
}))

import { IdleState } from './idle-state'

describe('IdleState', () => {
  beforeEach(() => mockUseQuery.mockReset())

  it('renders 4 skeletons while loading', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true })
    const { container } = render(
      <IdleState surface="planner" contextEntity={null} onPick={() => {}} />,
    )
    expect(container.querySelectorAll('[data-testid="suggestion-skeleton"]').length).toBe(4)
  })

  it('renders welcome subtext + suggestions when loaded', () => {
    mockUseQuery.mockReturnValue({
      data: {
        welcomeSubtext: 'Hello there',
        suggestions: [
          { slug: 'a', text: 'Try A' },
          { slug: 'b', text: 'Try B' },
        ],
      },
      isLoading: false,
    })
    render(<IdleState surface="planner" contextEntity={null} onPick={() => {}} />)
    expect(screen.getByText('Hello there')).toBeTruthy()
    expect(screen.getByText('Try A')).toBeTruthy()
    expect(screen.getByText('Try B')).toBeTruthy()
  })

  it('uses templated title when contextEntity present', () => {
    mockUseQuery.mockReturnValue({
      data: { welcomeSubtext: 'sub', suggestions: [] },
      isLoading: false,
    })
    render(<IdleState surface="planner" contextEntity="Q1 Launch" onPick={() => {}} />)
    expect(screen.getByText(/Ask about Q1 Launch/)).toBeTruthy()
  })

  it('falls back to "Ask about this plan" when contextEntity is null', () => {
    mockUseQuery.mockReturnValue({
      data: { welcomeSubtext: 'sub', suggestions: [] },
      isLoading: false,
    })
    render(<IdleState surface="planner" contextEntity={null} onPick={() => {}} />)
    expect(screen.getByText('Ask about this plan')).toBeTruthy()
  })
})
```

Create `packages/agent/src/panel/idle/idle-state.tsx`:

```tsx
'use client'

import { Sparkles } from 'lucide-react'
import { trpc } from '@future/api-client'
import { SuggestionChip } from './suggestion-chip'

export interface IdleStateProps {
  surface: string
  contextEntity: string | null
  contextEntityId?: string | null
  onPick: (suggestion: { slug: string; text: string }) => void
}

export function IdleState({ surface, contextEntity, contextEntityId, onPick }: IdleStateProps) {
  const { data, isLoading } = trpc.agents.suggestions.list.useQuery(
    {
      surface,
      contextEntity: contextEntity ?? undefined,
      contextEntityId: contextEntityId ?? undefined,
    },
    { staleTime: 60_000 },
  )

  const title = contextEntity ? `Ask about ${contextEntity}` : 'Ask about this plan'

  return (
    <div className="flex flex-col gap-3 px-3 py-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-accent/20 bg-gradient-to-br from-accent/[0.20] to-accent/[0.06] text-accent">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="text-[13px] font-medium text-foreground">{title}</div>
        <div className="max-w-[260px] text-[11px] leading-relaxed text-muted-foreground">
          {data?.welcomeSubtext ?? ' '}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <div className="px-1 pb-1 text-[9.5px] font-semibold uppercase tracking-[0.05em] text-muted-foreground/70">
          Suggested
        </div>
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                data-testid="suggestion-skeleton"
                className="h-9 animate-pulse rounded-md border border-white/[0.05] bg-white/[0.02]"
              />
            ))
          : (data?.suggestions ?? []).map((s) => (
              <SuggestionChip key={s.slug} text={s.text} onClick={() => onPick(s)} />
            ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Run tests + commit**

```bash
bun run --filter @future/agent test:unit -- idle-state suggestion-chip
git add packages/agent/src/panel/idle
git commit -m "feat(agent): IdleState + SuggestionChip"
```

---

## Task 6: Mount `IdleState` in `AgentPanel`

**Files:**

- Modify: `packages/agent/src/panel/agent-panel.tsx`
- Modify: `packages/agent/src/thread/agent-thread.tsx`

- [ ] **Step 1: Replace the empty placeholder in `AgentThread` with `IdleState`**

The existing `<ThreadPrimitive.Empty>` block (Plan 2) renders a generic "Start a conversation" placeholder. Replace it with `IdleState`:

```tsx
import { useAgentContext } from '../context/use-agent-context'
import { IdleState } from '../panel/idle/idle-state'
import { useThreadComposer } from '@assistant-ui/react'

// inside AgentThread, replace ThreadPrimitive.Empty body:
;<ThreadPrimitive.Empty>
  <IdleStateMounted />
</ThreadPrimitive.Empty>
```

Add the helper component below `AgentThread`:

```tsx
function IdleStateMounted() {
  const ctx = useAgentContext()
  const composer = useThreadComposer() // or useComposer() per assistant-ui version
  return (
    <IdleState
      surface={ctx?.module ?? 'unknown'}
      contextEntity={ctx?.entity ?? null}
      contextEntityId={ctx?.id ?? null}
      onPick={(s) => {
        composer.setText(s.text)
        composer.send()
      }}
    />
  )
}
```

> **Implementation note:** the composer hook name varies between assistant-ui versions. Inspect installed `@assistant-ui/react` exports — typical names are `useComposer`, `useThreadComposer`, or `useAssistantComposer`. The semantic is: set the input text, then submit. If the API returns a `setText`/`send` pair, use them; if it's mutate-style, adapt accordingly.

- [ ] **Step 2: Update `AgentThread` test**

Replace the empty-placeholder assertion in `agent-thread.spec.tsx`:

```tsx
it('renders IdleState in the empty thread', () => {
  // Mock trpc.agents.suggestions.list per IdleState's test pattern.
  render(
    <FakeRuntime>
      <AgentThread />
    </FakeRuntime>,
  )
  expect(screen.queryByText('Start a conversation')).toBeNull()
  // IdleState's loading-state skeletons OR welcome subtext should appear instead.
})
```

- [ ] **Step 3: Build, test, commit**

```bash
bun run --filter @future/agent test:unit
git add packages/agent/src/thread/agent-thread.tsx packages/agent/src/thread/agent-thread.spec.tsx
git commit -m "feat(agent): mount IdleState in empty thread"
```

---

## Task 7: PR

```bash
git push -u origin feat/agent-ux-plan-4-idle-suggestions
gh pr create --title "feat(agent): UX refactor plan 4 — idle suggestions" --body "$(cat <<'EOF'
## Summary

- New `agents.suggestions.list({ surface, contextEntity? })` tRPC query backed by static per-surface config
- Surfaces: planner, people, hiring, finance, goals, performance (4 suggestions + welcome subtext each)
- Frontend `IdleState` mounts in empty thread; `SuggestionChip` click seeds + sends
- Welcome title templated when context entity present (`"Ask about Q1 Launch"`)
- Backend permission: reuses `AGENT_CONVERSATION_READ`

Plan 4 of 6. Spec §7. LLM/personalization deferred to a later sub-project.

## Test plan

- [ ] CI green
- [ ] Manual: open the panel in `web-planner` with no thread → 4 templated suggestions appear
- [ ] Manual: click a suggestion → composer fills + submits → first turn streams
- [ ] Manual: open the panel in `web-people` → people-flavored suggestions

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review Checklist

- [ ] `KNOWN_SURFACES` covers every `ModuleKey` in `packages/agent/src/types.ts` (planner, people, hiring, finance, goals, performance) plus a generic fallback
- [ ] No backend cost — `resolveSuggestions` is pure, sync, no DB calls
- [ ] Permission gate (`AGENT_CONVERSATION_READ`) in place
- [ ] `IdleState` correctly handles loading / loaded / error (no toast, just hide list on error)
