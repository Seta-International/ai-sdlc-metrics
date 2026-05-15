import type { Activity } from './activity.js'
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

  return {
    type: 'message',
    text: "Not wired up yet — try: 'show my tasks' or 'create a task'",
  }
}
