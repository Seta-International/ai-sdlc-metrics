/**
 * Metadata for each ECharts chart type.
 * Used by the widget config panel to show/hide options
 * and by the future copilot to pick appropriate chart types.
 */
export interface ChartTypeMeta {
  /** ECharts series type string. */
  type: string
  /** Human-readable display name. */
  label: string
  /** Grouping category for the chart type picker. */
  category: 'basic' | 'statistical' | 'hierarchical' | 'relational' | 'geographic' | 'specialized'
  /** Whether the chart uses a Cartesian (x/y) axis. */
  supportsAxis: boolean
  /** Whether series can be stacked. */
  supportsStacking: boolean
  /** Minimum number of measures required. */
  minMeasures: number
  /** Minimum number of dimensions required. */
  minDimensions: number
  /** Short description of when to use this chart type. */
  description: string
}

export const CHART_TYPE_REGISTRY: Record<string, ChartTypeMeta> = {
  line: {
    type: 'line',
    label: 'Line',
    category: 'basic',
    supportsAxis: true,
    supportsStacking: true,
    minMeasures: 1,
    minDimensions: 0,
    description: 'Trends over time or ordered categories.',
  },
  bar: {
    type: 'bar',
    label: 'Bar',
    category: 'basic',
    supportsAxis: true,
    supportsStacking: true,
    minMeasures: 1,
    minDimensions: 0,
    description: 'Compare values across categories.',
  },
  pie: {
    type: 'pie',
    label: 'Pie',
    category: 'basic',
    supportsAxis: false,
    supportsStacking: false,
    minMeasures: 1,
    minDimensions: 1,
    description: 'Part-to-whole proportions.',
  },
  scatter: {
    type: 'scatter',
    label: 'Scatter',
    category: 'basic',
    supportsAxis: true,
    supportsStacking: false,
    minMeasures: 2,
    minDimensions: 0,
    description: 'Correlation between two measures.',
  },
  effectScatter: {
    type: 'effectScatter',
    label: 'Effect Scatter',
    category: 'basic',
    supportsAxis: true,
    supportsStacking: false,
    minMeasures: 2,
    minDimensions: 0,
    description: 'Scatter with ripple animation for emphasis.',
  },
  radar: {
    type: 'radar',
    label: 'Radar',
    category: 'specialized',
    supportsAxis: false,
    supportsStacking: false,
    minMeasures: 3,
    minDimensions: 0,
    description: 'Multi-dimensional comparison on radial axes.',
  },
  tree: {
    type: 'tree',
    label: 'Tree',
    category: 'hierarchical',
    supportsAxis: false,
    supportsStacking: false,
    minMeasures: 0,
    minDimensions: 1,
    description: 'Hierarchical parent-child relationships.',
  },
  treemap: {
    type: 'treemap',
    label: 'Treemap',
    category: 'hierarchical',
    supportsAxis: false,
    supportsStacking: false,
    minMeasures: 1,
    minDimensions: 1,
    description: 'Hierarchical data as nested rectangles sized by value.',
  },
  sunburst: {
    type: 'sunburst',
    label: 'Sunburst',
    category: 'hierarchical',
    supportsAxis: false,
    supportsStacking: false,
    minMeasures: 1,
    minDimensions: 1,
    description: 'Hierarchical data as concentric rings.',
  },
  boxplot: {
    type: 'boxplot',
    label: 'Box Plot',
    category: 'statistical',
    supportsAxis: true,
    supportsStacking: false,
    minMeasures: 1,
    minDimensions: 0,
    description: 'Statistical distribution — median, quartiles, outliers.',
  },
  candlestick: {
    type: 'candlestick',
    label: 'Candlestick',
    category: 'statistical',
    supportsAxis: true,
    supportsStacking: false,
    minMeasures: 4,
    minDimensions: 0,
    description: 'Open-high-low-close financial data.',
  },
  heatmap: {
    type: 'heatmap',
    label: 'Heatmap',
    category: 'statistical',
    supportsAxis: true,
    supportsStacking: false,
    minMeasures: 1,
    minDimensions: 2,
    description: 'Value intensity across two dimensions.',
  },
  map: {
    type: 'map',
    label: 'Map',
    category: 'geographic',
    supportsAxis: false,
    supportsStacking: false,
    minMeasures: 1,
    minDimensions: 1,
    description: 'Geographic data on a region map.',
  },
  parallel: {
    type: 'parallel',
    label: 'Parallel Coordinates',
    category: 'statistical',
    supportsAxis: false,
    supportsStacking: false,
    minMeasures: 3,
    minDimensions: 0,
    description: 'Multi-dimensional data on parallel axes.',
  },
  lines: {
    type: 'lines',
    label: 'Lines (Geo)',
    category: 'geographic',
    supportsAxis: false,
    supportsStacking: false,
    minMeasures: 0,
    minDimensions: 2,
    description: 'Route or flow lines on a map.',
  },
  graph: {
    type: 'graph',
    label: 'Graph / Network',
    category: 'relational',
    supportsAxis: false,
    supportsStacking: false,
    minMeasures: 0,
    minDimensions: 1,
    description: 'Network of nodes and edges.',
  },
  sankey: {
    type: 'sankey',
    label: 'Sankey',
    category: 'relational',
    supportsAxis: false,
    supportsStacking: false,
    minMeasures: 1,
    minDimensions: 2,
    description: 'Flow and quantity between stages.',
  },
  funnel: {
    type: 'funnel',
    label: 'Funnel',
    category: 'specialized',
    supportsAxis: false,
    supportsStacking: false,
    minMeasures: 1,
    minDimensions: 1,
    description: 'Progressive reduction through stages (e.g., hiring pipeline).',
  },
  gauge: {
    type: 'gauge',
    label: 'Gauge',
    category: 'specialized',
    supportsAxis: false,
    supportsStacking: false,
    minMeasures: 1,
    minDimensions: 0,
    description: 'Single KPI value on a dial.',
  },
  pictorialBar: {
    type: 'pictorialBar',
    label: 'Pictorial Bar',
    category: 'specialized',
    supportsAxis: true,
    supportsStacking: true,
    minMeasures: 1,
    minDimensions: 0,
    description: 'Bar chart with custom symbol shapes.',
  },
  themeRiver: {
    type: 'themeRiver',
    label: 'Theme River',
    category: 'specialized',
    supportsAxis: false,
    supportsStacking: false,
    minMeasures: 1,
    minDimensions: 1,
    description: 'Changes in event or theme strength over time.',
  },
  custom: {
    type: 'custom',
    label: 'Custom',
    category: 'specialized',
    supportsAxis: true,
    supportsStacking: false,
    minMeasures: 0,
    minDimensions: 0,
    description: 'User-defined rendering function for bespoke visualizations.',
  },
}

/** Look up metadata for a chart type. Returns undefined if not found. */
export function getChartTypeMeta(type: string): ChartTypeMeta | undefined {
  return CHART_TYPE_REGISTRY[type]
}

/** List all registered chart types. */
export function listChartTypes(): ChartTypeMeta[] {
  return Object.values(CHART_TYPE_REGISTRY)
}

/** List chart types filtered by category. */
export function listChartTypesByCategory(category: string): ChartTypeMeta[] {
  return Object.values(CHART_TYPE_REGISTRY).filter((m) => m.category === category)
}
