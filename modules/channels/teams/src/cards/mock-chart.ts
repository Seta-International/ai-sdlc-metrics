import type { OutboundActivity } from '../handler'

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
