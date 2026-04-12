'use client'

import ReactEChartsCore from 'echarts-for-react/lib/core'
import { echarts } from '../core/echarts-setup'
import { registerSetaThemes } from '../core/theme'

// Register SETA themes once on module load
registerSetaThemes(echarts)

export interface EChartProps {
  /** ECharts option object — the full chart configuration. */
  option: Record<string, unknown>
  /** ECharts theme name. Defaults to 'seta-light'. */
  theme?: string
  /** CSS class name applied to the wrapper div. */
  className?: string
  /** Inline styles applied to the wrapper div. */
  style?: React.CSSProperties
  /** When true, existing option is not merged with new option. */
  notMerge?: boolean
  /** When true, chart update is deferred until next render cycle. */
  lazyUpdate?: boolean
  /** Callback fired when the chart instance is ready. */
  onChartReady?: (instance: ReturnType<typeof echarts.init>) => void
  /** Map of ECharts event names to handlers. */
  onEvents?: Record<string, (params: unknown) => void>
}

/**
 * Base ECharts wrapper component.
 *
 * Renders an ECharts instance using the configured `echarts` core
 * (with all chart types and components registered via tree-shaking).
 *
 * This is the only component in @future/charts that touches echarts directly.
 */
export function EChart({
  option,
  theme = 'seta-light',
  className,
  style = { width: '100%', height: '100%' },
  notMerge = false,
  lazyUpdate = false,
  onChartReady,
  onEvents,
}: EChartProps) {
  return (
    <ReactEChartsCore
      echarts={echarts}
      option={option}
      theme={theme}
      notMerge={notMerge}
      lazyUpdate={lazyUpdate}
      className={className}
      style={style}
      onChartReady={onChartReady}
      onEvents={onEvents}
    />
  )
}
