import { describe, it, expect } from 'vitest'
import {
  CHART_TYPE_REGISTRY,
  getChartTypeMeta,
  listChartTypes,
  listChartTypesByCategory,
  type ChartTypeMeta,
} from './chart-type-registry'

/** All 22 ECharts series types that must be in the registry. */
const ALL_ECHARTS_TYPES = [
  'line',
  'bar',
  'pie',
  'scatter',
  'effectScatter',
  'radar',
  'tree',
  'treemap',
  'sunburst',
  'boxplot',
  'candlestick',
  'heatmap',
  'map',
  'parallel',
  'lines',
  'graph',
  'sankey',
  'funnel',
  'gauge',
  'pictorialBar',
  'themeRiver',
  'custom',
] as const

describe('chart-type-registry', () => {
  it('has an entry for every ECharts series type', () => {
    for (const type of ALL_ECHARTS_TYPES) {
      expect(CHART_TYPE_REGISTRY[type], `missing registry entry for "${type}"`).toBeDefined()
    }
  })

  it('every entry has required fields', () => {
    for (const [type, meta] of Object.entries(CHART_TYPE_REGISTRY)) {
      expect(meta.label, `${type}.label`).toBeTruthy()
      expect(meta.category, `${type}.category`).toBeTruthy()
      expect(typeof meta.supportsAxis, `${type}.supportsAxis`).toBe('boolean')
      expect(typeof meta.supportsStacking, `${type}.supportsStacking`).toBe('boolean')
      expect(meta.minMeasures, `${type}.minMeasures`).toBeGreaterThanOrEqual(0)
      expect(meta.minDimensions, `${type}.minDimensions`).toBeGreaterThanOrEqual(0)
    }
  })

  describe('getChartTypeMeta', () => {
    it('returns metadata for a known type', () => {
      const meta = getChartTypeMeta('bar')
      expect(meta).toBeDefined()
      expect(meta!.label).toBe('Bar')
      expect(meta!.supportsAxis).toBe(true)
    })

    it('returns undefined for an unknown type', () => {
      expect(getChartTypeMeta('nonexistent')).toBeUndefined()
    })
  })

  describe('listChartTypes', () => {
    it('returns all 22 types', () => {
      expect(listChartTypes()).toHaveLength(22)
    })
  })

  describe('listChartTypesByCategory', () => {
    it('returns only types in the given category', () => {
      const basic = listChartTypesByCategory('basic')
      expect(basic.length).toBeGreaterThan(0)
      for (const meta of basic) {
        expect(meta.category).toBe('basic')
      }
    })

    it('returns empty array for unknown category', () => {
      expect(listChartTypesByCategory('nonexistent')).toHaveLength(0)
    })
  })
})
