// @future/charts — ECharts-based charting package for Future

// Core types
export type {
  CubeTimeDimension,
  CubeFilter,
  WidgetDataSource,
  ChartOptions,
  WidgetLayout,
  WidgetSpec,
  WidgetData,
  ChartConfig,
} from './core/types'

// ECharts configured instance
export { echarts } from './core/echarts-setup'

// Themes
export { SETA_LIGHT_THEME, SETA_DARK_THEME, registerSetaThemes } from './core/theme'

// Chart type registry
export {
  CHART_TYPE_REGISTRY,
  getChartTypeMeta,
  listChartTypes,
  listChartTypesByCategory,
} from './core/chart-type-registry'
export type { ChartTypeMeta } from './core/chart-type-registry'
