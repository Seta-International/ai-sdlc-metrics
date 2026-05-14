export interface ChartSeries {
  label: string
  value: number
  color?: string
}

export interface ChartYBarData {
  title: string
  series: ChartSeries[]
}

export interface AdaptiveCard {
  type: string
  version: string
  body: unknown[]
}

export function chartYBarCard(data: ChartYBarData): AdaptiveCard {
  return {
    type: 'AdaptiveCard',
    version: '1.5',
    body: [
      {
        type: 'TextBlock',
        text: data.title,
        weight: 'Bolder',
        size: 'Medium',
      },
      {
        type: 'Chart.VerticalBar',
        data: data.series.map((s) => ({
          x: s.label,
          y: s.value,
          ...(s.color ? { color: s.color } : {}),
        })),
      },
    ],
  }
}
