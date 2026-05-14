import { describe, expect, it } from 'vitest'
import { chartYBarCard } from './chart-ybar'

describe('chartYBarCard', () => {
  it('returns an AdaptiveCard 1.5 with Chart.VerticalBar and title', () => {
    const card = chartYBarCard({
      title: 'Workload',
      series: [
        { label: 'Alice', value: 5 },
        { label: 'Bob', value: 3 },
      ],
    })
    expect(card.type).toBe('AdaptiveCard')
    expect(card.version).toBe('1.5')
    const chartBlock = (card.body as unknown[]).find(
      (b) => (b as { type: string }).type === 'Chart.VerticalBar',
    ) as { data: Array<{ x: string; y: number }> }
    expect(chartBlock).toBeDefined()
    expect(chartBlock.data).toHaveLength(2)
    expect(chartBlock.data[0]).toEqual({ x: 'Alice', y: 5 })
  })

  it('includes the title in a TextBlock', () => {
    const card = chartYBarCard({ title: 'My Chart', series: [] })
    const tb = (card.body as unknown[]).find(
      (b) => (b as { type: string }).type === 'TextBlock',
    ) as { text: string }
    expect(tb?.text).toBe('My Chart')
  })
})
