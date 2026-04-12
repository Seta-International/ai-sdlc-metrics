/**
 * Cube.js time dimension filter.
 */
export interface CubeTimeDimension {
  dimension: string
  dateRange?: [string, string] | string
  granularity?: 'year' | 'quarter' | 'month' | 'week' | 'day' | 'hour' | 'minute' | 'second'
}

/**
 * Cube.js filter.
 */
export interface CubeFilter {
  member: string
  operator:
    | 'equals'
    | 'notEquals'
    | 'contains'
    | 'notContains'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'set'
    | 'notSet'
    | 'inDateRange'
    | 'notInDateRange'
    | 'beforeDate'
    | 'afterDate'
  values?: string[]
}

/**
 * Data source configuration for a widget.
 * Either a raw Cube query or a reference to a pre-built template.
 */
export interface WidgetDataSource {
  mode: 'cube' | 'template'

  /** Raw Cube query parts — used when mode is 'cube'. */
  cube?: {
    measures: string[]
    dimensions?: string[]
    timeDimensions?: CubeTimeDimension[]
    filters?: CubeFilter[]
    order?: Record<string, 'asc' | 'desc'>
    limit?: number
  }

  /** Template reference — used when mode is 'template'. */
  templateId?: string
  templateOverrides?: Record<string, unknown>
}

/**
 * ECharts option overrides. Merged on top of auto-generated options.
 */
export type ChartOptions = Record<string, unknown>

/**
 * Layout position for React-Grid-Layout.
 */
export interface WidgetLayout {
  x: number
  y: number
  w: number
  h: number
  minW?: number
  minH?: number
}

/**
 * The central widget specification.
 * Bridges backend persistence, frontend rendering, and future copilot generation.
 */
export interface WidgetSpec {
  id: string
  dashboardId: string
  dataSource: WidgetDataSource
  chartType: string
  chartOptions: ChartOptions
  layout: WidgetLayout
  title?: string
  description?: string
}

/**
 * Resolved data returned from the backend for a widget.
 * `rows` is the raw Cube query result; `echartsOption` is the fully resolved option.
 */
export interface WidgetData {
  rows: Record<string, unknown>[]
  echartsOption: Record<string, unknown>
}

/**
 * Chart-level configuration for theming individual series/categories.
 * Maps a series key to a color or theme-aware color pair.
 */
export type ChartConfig = Record<
  string,
  {
    label: string
    color: string
  }
>
