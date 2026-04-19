export const chartTokens = {
  progress: {
    'not-started': 'var(--chart-progress-not-started)',
    'in-progress': 'var(--chart-progress-in-progress)',
    completed: 'var(--chart-progress-completed)',
  },
  priority: {
    urgent: 'var(--chart-priority-urgent)',
    important: 'var(--chart-priority-important)',
    medium: 'var(--chart-priority-medium)',
    low: 'var(--chart-priority-low)',
  },
  bucket: [
    'var(--chart-bucket-1)',
    'var(--chart-bucket-2)',
    'var(--chart-bucket-3)',
    'var(--chart-bucket-4)',
    'var(--chart-bucket-5)',
    'var(--chart-bucket-6)',
  ],
  assigneeTints: [
    'var(--chart-tint-1)',
    'var(--chart-tint-2)',
    'var(--chart-tint-3)',
    'var(--chart-tint-4)',
    'var(--chart-tint-5)',
    'var(--chart-tint-6)',
    'var(--chart-tint-7)',
    'var(--chart-tint-8)',
    'var(--chart-tint-9)',
    'var(--chart-tint-10)',
    'var(--chart-tint-11)',
    'var(--chart-tint-12)',
  ],
} as const

export type ChartTokens = typeof chartTokens
