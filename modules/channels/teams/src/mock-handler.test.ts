import { describe, expect, test } from 'vitest'
import type { Activity } from './activity'
import type { RunContext } from './handler'
import { mockTeamsHandler } from './mock-handler'

const runCtx: RunContext = { userId: 'user-1' }

function makeActivity(overrides: Partial<Activity>): Activity {
  return {
    type: 'message',
    serviceUrl: 'https://smba.trafficmanager.net/apis',
    channelId: 'msteams',
    from: { id: 'user-1', aadObjectId: 'user-1' },
    conversation: { id: 'conv-1', conversationType: 'personal' },
    recipient: { id: 'bot-1' },
    ...overrides,
  } as Activity
}

describe('mockTeamsHandler', () => {
  test('"show my tasks" returns task-list card', async () => {
    const result = await mockTeamsHandler(makeActivity({ text: 'show my tasks' }), runCtx)
    expect(result?.type).toBe('message')
    expect(result?.attachments).toHaveLength(1)
    expect((result?.attachments?.[0] as { contentType: string }).contentType).toBe(
      'application/vnd.microsoft.card.adaptive',
    )
  })

  test('"Show Tasks" (mixed case) still matches', async () => {
    const result = await mockTeamsHandler(makeActivity({ text: 'Show Tasks' }), runCtx)
    expect(result?.type).toBe('message')
    expect(result?.attachments).toBeDefined()
  })

  test('"create a task" returns preview card with Action.Execute', async () => {
    const result = await mockTeamsHandler(makeActivity({ text: 'create a task' }), runCtx)
    const card = (result?.attachments?.[0] as { content: { actions: Array<{ type: string }> } })
      .content
    expect(card.actions[0]?.type).toBe('Action.Execute')
    expect(card.actions[1]?.type).toBe('Action.Execute')
  })

  test('unknown text returns fallback message', async () => {
    const result = await mockTeamsHandler(makeActivity({ text: 'hello there' }), runCtx)
    expect(result?.type).toBe('message')
    expect(result?.text).toContain('show my tasks')
    expect(result?.attachments).toBeUndefined()
  })

  test('conversationUpdate returns null', async () => {
    const result = await mockTeamsHandler(makeActivity({ type: 'conversationUpdate' }), runCtx)
    expect(result).toBeNull()
  })

  test('invoke (Action.Execute) returns 200 invokeResponse', async () => {
    const result = await mockTeamsHandler(makeActivity({ type: 'invoke' }), runCtx)
    expect(result).toEqual({ type: 'invokeResponse', value: { status: 200 } })
  })

  test('"show chart" returns a Chart.Donut adaptive card', async () => {
    const result = await mockTeamsHandler(makeActivity({ text: 'show chart' }), runCtx)
    expect(result?.type).toBe('message')
    expect(result?.attachments).toHaveLength(1)
    const card = (result?.attachments?.[0] as { content: { body: Array<{ type: string }> } })
      .content
    expect(card.body.some((el) => el.type === 'Chart.Donut')).toBe(true)
  })

  test('"show project chart" also matches', async () => {
    const result = await mockTeamsHandler(makeActivity({ text: 'show project chart' }), runCtx)
    expect(result?.type).toBe('message')
    expect(result?.attachments).toHaveLength(1)
  })

  test('fallback message mentions show chart', async () => {
    const result = await mockTeamsHandler(makeActivity({ text: 'hello' }), runCtx)
    expect(result?.text).toContain('show chart')
  })
})
