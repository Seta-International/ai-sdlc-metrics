# Teams Mock Chart Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `"show chart"` command to `mockTeamsHandler` that renders a `Chart.Donut` Adaptive Card showing mock project progress.

**Architecture:** A new `buildMockChartCard()` card builder follows the same pattern as `buildMockTaskListCard()` and `buildMockCreatePreviewCard()`. The handler gains one new regex branch and the fallback message is updated. TDD: tests are written first against the new builder and handler branch.

**Tech Stack:** TypeScript, Adaptive Cards v1.6 (`Chart.Donut`), Vitest

---

### Task 1: Write failing tests for `"show chart"` handler branch

**Files:**
- Modify: `modules/channels/teams/src/mock-handler.test.ts`

- [ ] **Step 1: Add two failing tests to the existing `describe('mockTeamsHandler')` block**

Open `modules/channels/teams/src/mock-handler.test.ts` and append inside the `describe` block (before the closing `}`):

```ts
test('"show chart" returns a Chart.Donut adaptive card', async () => {
  const result = await mockTeamsHandler(makeActivity({ text: 'show chart' }), runCtx)
  expect(result?.type).toBe('message')
  expect(result?.attachments).toHaveLength(1)
  const card = (result?.attachments?.[0] as { content: { body: Array<{ type: string }> } }).content
  expect(card.body.some((el) => el.type === 'Chart.Donut')).toBe(true)
})

test('"show project chart" also matches', async () => {
  const result = await mockTeamsHandler(makeActivity({ text: 'show project chart' }), runCtx)
  expect(result?.attachments).toHaveLength(1)
})

test('fallback message mentions show chart', async () => {
  const result = await mockTeamsHandler(makeActivity({ text: 'hello' }), runCtx)
  expect(result?.text).toContain('show chart')
})
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
pnpm vitest run modules/channels/teams/src/mock-handler.test.ts
```

Expected: 3 new tests FAIL — `show chart` returns fallback message, not a card; fallback does not mention `show chart` yet.

---

### Task 2: Implement `buildMockChartCard`

**Files:**
- Create: `modules/channels/teams/src/cards/mock-chart.ts`

- [ ] **Step 1: Create the card builder**

```ts
import type { OutboundActivity } from '../handler.js'

export function buildMockChartCard(): OutboundActivity {
  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          type: 'AdaptiveCard',
          version: '1.6',
          body: [
            {
              type: 'TextBlock',
              text: 'Project Progress',
              weight: 'Bolder',
              size: 'Medium',
            },
            {
              type: 'Chart.Donut',
              data: [
                { legend: 'Atlas', value: 75, color: '#6264a7' },
                { legend: 'Phoenix', value: 40, color: '#13a10e' },
                { legend: 'Internal', value: 20, color: '#ca5010' },
              ],
            },
          ],
        },
      },
    ],
  }
}
```

- [ ] **Step 2: No tests needed for the builder directly** — it is pure data construction; the handler tests in Task 1 cover it end-to-end.

---

### Task 3: Wire the handler and fix the fallback message

**Files:**
- Modify: `modules/channels/teams/src/mock-handler.ts`

- [ ] **Step 1: Update `mock-handler.ts`**

Replace the entire file content with:

```ts
import type { Activity } from './activity.js'
import { buildMockChartCard } from './cards/mock-chart.js'
import { buildMockCreatePreviewCard } from './cards/mock-create-preview.js'
import { buildMockTaskListCard } from './cards/mock-task-list.js'
import type { OutboundActivity, TeamsHandler } from './handler.js'

export const mockTeamsHandler: TeamsHandler = async (
  activity: Activity,
): Promise<OutboundActivity | null> => {
  if (activity.type === 'conversationUpdate') return null

  if (activity.type === 'invoke') {
    return { type: 'invokeResponse', value: { status: 200 } }
  }

  const text = (activity.text ?? '').toLowerCase().trim()

  if (/show.*tasks?/.test(text)) return buildMockTaskListCard()
  if (/create.*task/.test(text)) return buildMockCreatePreviewCard()
  if (/show.*chart|chart.*progress/.test(text)) return buildMockChartCard()

  return {
    type: 'message',
    text: "Not wired up yet — try: 'show my tasks', 'create a task', or 'show chart'",
  }
}
```

- [ ] **Step 2: Run all tests to confirm they pass**

```bash
pnpm vitest run modules/channels/teams/src/mock-handler.test.ts
```

Expected: all tests PASS including the 3 new ones.

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @seta/teams typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add modules/channels/teams/src/cards/mock-chart.ts modules/channels/teams/src/mock-handler.ts modules/channels/teams/src/mock-handler.test.ts
git commit -m "feat(teams): add show-chart command with Chart.Donut adaptive card"
```
