import { describe, it, expect } from 'vitest'

describe('echarts-setup', () => {
  it('exports a configured echarts instance', async () => {
    const { echarts } = await import('./echarts-setup')
    expect(echarts).toBeDefined()
    // Verify it has the registerTheme method (proves it's the core instance)
    expect(typeof echarts.registerTheme).toBe('function')
  })

  it('has CanvasRenderer registered (can create a chart)', async () => {
    const { echarts } = await import('./echarts-setup')
    // Create a minimal chart instance to prove renderers are registered
    const div = document.createElement('div')
    div.style.width = '100px'
    div.style.height = '100px'
    document.body.appendChild(div)
    const chart = echarts.init(div)
    expect(chart).toBeDefined()
    chart.dispose()
    document.body.removeChild(div)
  })
})
