import type { OutboundActivity } from '../handler'

export function buildMockTaskListCard(): OutboundActivity {
  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          type: 'AdaptiveCard',
          version: '1.5',
          body: [
            {
              type: 'TextBlock',
              text: 'Your open tasks (3)',
              weight: 'Bolder',
              size: 'Medium',
            },
            {
              type: 'FactSet',
              facts: [
                { title: 'Overdue', value: 'Deploy auth service — Atlas · due May 10' },
                { title: 'This week', value: 'Review PRD v2 — Phoenix · due May 15' },
                { title: 'Upcoming', value: 'Write onboarding doc — Internal · due May 20' },
              ],
            },
          ],
          actions: [
            {
              type: 'Action.OpenUrl',
              title: 'Open in Planner',
              url: 'https://tasks.office.com',
            },
          ],
        },
      },
    ],
  }
}
