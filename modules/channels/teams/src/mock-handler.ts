import type { Activity } from './activity'
import { buildMockChartCard } from './cards/mock-chart'
import { buildMockCreatePreviewCard } from './cards/mock-create-preview'
import { buildMockTaskListCard } from './cards/mock-task-list'
import type { OutboundActivity, TeamsHandler } from './handler'

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
