import type { OutboundActivity } from '../handler'

export function buildMockCreatePreviewCard(): OutboundActivity {
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
              text: 'Create task — preview',
              weight: 'Bolder',
            },
            {
              type: 'FactSet',
              facts: [
                { title: 'Title', value: 'Sample task from Teams' },
                { title: 'Plan', value: 'Atlas' },
                { title: 'Due', value: 'May 20, 2026' },
              ],
            },
          ],
          actions: [
            {
              type: 'Action.Execute',
              title: 'Confirm',
              verb: 'planner.create_task.commit',
              data: { token: 'mock-token-placeholder' },
            },
            {
              type: 'Action.Execute',
              title: 'Cancel',
              verb: 'planner.create_task.cancel',
              data: {},
            },
          ],
        },
      },
    ],
  }
}
