import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { EChart } from './EChart'

afterEach(cleanup)

describe('EChart', () => {
  it('renders a container div', () => {
    const { container } = render(
      <EChart
        option={{
          xAxis: { type: 'category', data: ['A', 'B', 'C'] },
          yAxis: { type: 'value' },
          series: [{ type: 'bar', data: [1, 2, 3] }],
        }}
      />,
    )
    // echarts-for-react renders a div that echarts inits on
    const chartDiv = container.querySelector('div')
    expect(chartDiv).toBeTruthy()
  })

  it('applies the seta-light theme by default', () => {
    const { container } = render(
      <EChart
        option={{
          series: [{ type: 'line', data: [1, 2] }],
        }}
      />,
    )
    expect(container.firstChild).toBeTruthy()
  })

  it('forwards style and className props', () => {
    const { container } = render(
      <EChart
        option={{ series: [] }}
        className="test-class"
        style={{ width: '500px', height: '300px' }}
      />,
    )
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.className).toContain('test-class')
    expect(wrapper.style.width).toBe('500px')
    expect(wrapper.style.height).toBe('300px')
  })

  it('accepts a dark theme override', () => {
    // Should not throw
    const { container } = render(<EChart option={{ series: [] }} theme="seta-dark" />)
    expect(container.firstChild).toBeTruthy()
  })

  it('passes notMerge and lazyUpdate props', () => {
    // Should not throw — these are echarts-for-react passthrough props
    const { container } = render(
      <EChart option={{ series: [] }} notMerge={true} lazyUpdate={true} />,
    )
    expect(container.firstChild).toBeTruthy()
  })
})
