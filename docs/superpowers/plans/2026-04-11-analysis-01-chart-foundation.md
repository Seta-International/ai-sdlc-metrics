# Analysis Module — Plan 1: Chart Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** not started

**Goal:** Replace Recharts with Apache ECharts as the sole charting engine, establishing `packages/charts` as the shared chart package for the analysis module and cross-zone embedding.

**Architecture:** New `@future/charts` package owns all charting: ECharts core setup with tree-shaking, SETA-themed light/dark themes matching DESIGN.md, a chart type registry with metadata for all 22 ECharts types, shared TypeScript types (WidgetSpec, WidgetData, ChartConfig), and a base `<EChart />` React wrapper. Recharts is fully removed from `@future/ui`.

**Tech Stack:** Apache ECharts 5, echarts-for-react 3, React 19, TypeScript, Vitest + happy-dom

---

## File Structure

```
packages/charts/
  src/
    core/
      echarts-setup.ts             -- registers all ECharts components (tree-shaking entry)
      echarts-setup.spec.ts        -- verifies registration
      theme.ts                     -- SETA light + dark ECharts theme objects
      theme.spec.ts                -- validates theme structure
      chart-type-registry.ts       -- metadata per chart type
      chart-type-registry.spec.ts  -- validates registry completeness
      types.ts                     -- WidgetSpec, WidgetData, ChartConfig, CubeTimeDimension, CubeFilter
    components/
      EChart.tsx                   -- base echarts-for-react wrapper
      EChart.spec.tsx              -- render test
    index.ts                       -- barrel exports
  package.json
  tsconfig.json
  eslint.config.ts
  vitest.config.ts

packages/ui/
  src/
    components/ui/chart.tsx        -- DELETE
    index.ts                       -- MODIFY (remove chart export)
  package.json                     -- MODIFY (remove recharts)
```

---

### Task 1: Remove Recharts from `packages/ui`

**Files:**

- Delete: `packages/ui/src/components/ui/chart.tsx`
- Modify: `packages/ui/src/index.ts:26` (remove chart export)
- Modify: `packages/ui/package.json:49` (remove recharts dep)

- [ ] **Step 1: Remove the chart export from the barrel**

In `packages/ui/src/index.ts`, delete line 26:

```typescript
export * from './components/ui/chart'
```

- [ ] **Step 2: Delete the chart component file**

```bash
rm packages/ui/src/components/ui/chart.tsx
```

- [ ] **Step 3: Remove the recharts dependency**

```bash
cd packages/ui && bun remove recharts && cd ../..
```

- [ ] **Step 4: Verify packages/ui still typechecks**

```bash
cd packages/ui && bun run typecheck && cd ../..
```

Expected: passes with no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/index.ts packages/ui/package.json bun.lock
git add -u packages/ui/src/components/ui/chart.tsx
git commit -m "chore: remove Recharts from @future/ui

ECharts will replace it in @future/charts."
```

---

### Task 2: Scaffold `packages/charts` workspace

**Files:**

- Create: `packages/charts/package.json`
- Create: `packages/charts/tsconfig.json`
- Create: `packages/charts/eslint.config.ts`
- Create: `packages/charts/vitest.config.ts`
- Create: `packages/charts/src/index.ts` (empty barrel)

- [ ] **Step 1: Create package.json**

Create `packages/charts/package.json`:

```json
{
  "name": "@future/charts",
  "version": "0.0.1",
  "private": true,
  "exports": {
    ".": {
      "import": "./src/index.ts",
      "types": "./src/index.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "peerDependencies": {
    "react": "^19",
    "react-dom": "^19"
  },
  "dependencies": {
    "echarts": "^5.6.0",
    "echarts-for-react": "^3.0.2"
  },
  "devDependencies": {
    "@future/eslint-config": "workspace:*",
    "@future/tsconfig": "*",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^10.2.0",
    "happy-dom": "^18.0.1",
    "typescript": "^6.0.2",
    "vitest": "^3.2.1"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

Create `packages/charts/tsconfig.json`:

```json
{
  "extends": "@future/tsconfig/nextjs.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "jsx": "react-jsx",
    "types": ["react", "react-dom"],
    "ignoreDeprecations": "6.0",
    "baseUrl": "."
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create eslint.config.ts**

Create `packages/charts/eslint.config.ts`:

```typescript
import base from '@future/eslint-config/base'
import type { Linter } from 'eslint'

const config: Linter.Config[] = [
  ...base,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
]

export default config
```

- [ ] **Step 4: Create vitest.config.ts**

Create `packages/charts/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.spec.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.spec.{ts,tsx}', 'src/index.ts'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
      },
    },
  },
})
```

- [ ] **Step 5: Create empty barrel**

Create `packages/charts/src/index.ts`:

```typescript
// @future/charts — ECharts-based charting package for Future
```

- [ ] **Step 6: Install dependencies**

```bash
bun install
```

Expected: resolves workspace dependencies, no errors.

- [ ] **Step 7: Verify typecheck**

```bash
cd packages/charts && bun run typecheck && cd ../..
```

Expected: passes.

- [ ] **Step 8: Commit**

```bash
git add packages/charts/
git commit -m "feat(charts): scaffold @future/charts package

Empty workspace with ECharts + echarts-for-react deps,
vitest config, and TypeScript setup."
```

---

### Task 3: Shared types — `types.ts`

**Files:**

- Create: `packages/charts/src/core/types.ts`
- Modify: `packages/charts/src/index.ts` (add exports)

- [ ] **Step 1: Verify types compile by creating the file and typechecking**

Create `packages/charts/src/core/types.ts`:

```typescript
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
```

- [ ] **Step 2: Export from barrel**

Update `packages/charts/src/index.ts`:

```typescript
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
```

- [ ] **Step 3: Typecheck**

```bash
cd packages/charts && bun run typecheck && cd ../..
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add packages/charts/src/core/types.ts packages/charts/src/index.ts
git commit -m "feat(charts): add shared types — WidgetSpec, WidgetData, ChartConfig

Central type contracts for widget specification, Cube query
filters, layout positioning, and chart configuration."
```

---

### Task 4: ECharts tree-shaking setup — `echarts-setup.ts`

**Files:**

- Create: `packages/charts/src/core/echarts-setup.ts`
- Create: `packages/charts/src/core/echarts-setup.spec.ts`
- Modify: `packages/charts/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/charts/src/core/echarts-setup.spec.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/charts && bun run test -- --run src/core/echarts-setup.spec.ts && cd ../..
```

Expected: FAIL — `./echarts-setup` module not found.

- [ ] **Step 3: Write the implementation**

Create `packages/charts/src/core/echarts-setup.ts`:

```typescript
import * as echarts from 'echarts/core'

// Renderers
import { CanvasRenderer } from 'echarts/renderers'

// Charts (all 22 types)
import {
  BarChart,
  BoxplotChart,
  CandlestickChart,
  CustomChart,
  EffectScatterChart,
  FunnelChart,
  GaugeChart,
  GraphChart,
  HeatmapChart,
  LineChart,
  LinesChart,
  MapChart,
  ParallelChart,
  PictorialBarChart,
  PieChart,
  RadarChart,
  SankeyChart,
  ScatterChart,
  SunburstChart,
  ThemeRiverChart,
  TreeChart,
  TreemapChart,
} from 'echarts/charts'

// Components
import {
  AriaComponent,
  AxisPointerComponent,
  BrushComponent,
  CalendarComponent,
  DataZoomComponent,
  DataZoomInsideComponent,
  DataZoomSliderComponent,
  DatasetComponent,
  GeoComponent,
  GraphicComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  MarkPointComponent,
  ParallelComponent,
  PolarComponent,
  SingleAxisComponent,
  TimelineComponent,
  TitleComponent,
  ToolboxComponent,
  TooltipComponent,
  TransformComponent,
  VisualMapComponent,
  VisualMapContinuousComponent,
  VisualMapPiecewiseComponent,
} from 'echarts/components'

echarts.use([
  // Renderer
  CanvasRenderer,
  // Charts
  BarChart,
  BoxplotChart,
  CandlestickChart,
  CustomChart,
  EffectScatterChart,
  FunnelChart,
  GaugeChart,
  GraphChart,
  HeatmapChart,
  LineChart,
  LinesChart,
  MapChart,
  ParallelChart,
  PictorialBarChart,
  PieChart,
  RadarChart,
  SankeyChart,
  ScatterChart,
  SunburstChart,
  ThemeRiverChart,
  TreeChart,
  TreemapChart,
  // Components
  AriaComponent,
  AxisPointerComponent,
  BrushComponent,
  CalendarComponent,
  DataZoomComponent,
  DataZoomInsideComponent,
  DataZoomSliderComponent,
  DatasetComponent,
  GeoComponent,
  GraphicComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  MarkPointComponent,
  ParallelComponent,
  PolarComponent,
  SingleAxisComponent,
  TimelineComponent,
  TitleComponent,
  ToolboxComponent,
  TooltipComponent,
  TransformComponent,
  VisualMapComponent,
  VisualMapContinuousComponent,
  VisualMapPiecewiseComponent,
])

export { echarts }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/charts && bun run test -- --run src/core/echarts-setup.spec.ts && cd ../..
```

Expected: PASS.

- [ ] **Step 5: Export from barrel**

Add to `packages/charts/src/index.ts`:

```typescript
// ECharts configured instance
export { echarts } from './core/echarts-setup'
```

- [ ] **Step 6: Commit**

```bash
git add packages/charts/src/core/echarts-setup.ts packages/charts/src/core/echarts-setup.spec.ts packages/charts/src/index.ts
git commit -m "feat(charts): add ECharts tree-shaking setup

Registers all 22 chart types, CanvasRenderer, and all
standard components via echarts/core for tree-shaking."
```

---

### Task 5: SETA themes — `theme.ts`

**Files:**

- Create: `packages/charts/src/core/theme.ts`
- Create: `packages/charts/src/core/theme.spec.ts`
- Modify: `packages/charts/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/charts/src/core/theme.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { SETA_LIGHT_THEME, SETA_DARK_THEME, registerSetaThemes } from './theme'

describe('theme', () => {
  describe('SETA_LIGHT_THEME', () => {
    it('uses DESIGN.md accent color #1d4ed8', () => {
      expect(SETA_LIGHT_THEME.color).toContain('#1d4ed8')
    })

    it('uses white background for chart area', () => {
      expect(SETA_LIGHT_THEME.backgroundColor).toBe('transparent')
    })

    it('uses Geist font family for text', () => {
      expect(SETA_LIGHT_THEME.textStyle.fontFamily).toContain('Geist')
    })

    it('uses Geist Mono for axis labels', () => {
      const axisLabel = SETA_LIGHT_THEME.categoryAxis.axisLabel
      expect(axisLabel.fontFamily).toContain('Geist Mono')
    })

    it('uses 14px as default font size', () => {
      expect(SETA_LIGHT_THEME.textStyle.fontSize).toBe(14)
    })
  })

  describe('SETA_DARK_THEME', () => {
    it('uses DESIGN.md dark mode accent #3b82f6', () => {
      expect(SETA_DARK_THEME.color).toContain('#3b82f6')
    })

    it('uses dark text colors', () => {
      expect(SETA_DARK_THEME.textStyle.color).toBe('#cbd5e1')
    })

    it('uses dark border colors for axes', () => {
      expect(SETA_DARK_THEME.categoryAxis.axisLine.lineStyle.color).toBe('#1e293b')
    })
  })

  describe('registerSetaThemes', () => {
    it('registers both themes with echarts', async () => {
      const { echarts } = await import('./echarts-setup')
      // Should not throw
      registerSetaThemes(echarts)
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/charts && bun run test -- --run src/core/theme.spec.ts && cd ../..
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `packages/charts/src/core/theme.ts`:

```typescript
/**
 * SETA ECharts themes — aligned with DESIGN.md.
 *
 * Color palette uses the DESIGN.md navy accent system.
 * Typography uses Geist (labels) and Geist Mono (data values).
 */

const FONT_FAMILY = "'Geist', -apple-system, system-ui, sans-serif"
const FONT_FAMILY_MONO = "'Geist Mono', 'Fira Code', monospace"

/** 8-color categorical palette derived from DESIGN.md primitives. */
const LIGHT_PALETTE = [
  '#1d4ed8', // navy-700 (primary accent)
  '#16a34a', // green-600
  '#d97706', // amber-600
  '#dc2626', // red-600
  '#2563eb', // navy-600
  '#15803d', // green-700
  '#b45309', // amber-700
  '#b91c1c', // red-700
]

const DARK_PALETTE = [
  '#3b82f6', // navy-500 (dark accent)
  '#4ade80', // green-400
  '#fcd34d', // amber-300
  '#fca5a5', // red-300
  '#60a5fa', // blue-400
  '#34d399', // emerald-400
  '#fbbf24', // amber-400
  '#f87171', // red-400
]

const sharedAxisStyle = (lineColor: string, labelColor: string, splitLineColor: string) => ({
  axisLine: { lineStyle: { color: lineColor } },
  axisTick: { lineStyle: { color: lineColor } },
  axisLabel: {
    color: labelColor,
    fontFamily: FONT_FAMILY_MONO,
    fontSize: 12,
  },
  splitLine: { lineStyle: { color: splitLineColor, type: 'dashed' as const } },
})

export const SETA_LIGHT_THEME = {
  backgroundColor: 'transparent',
  color: LIGHT_PALETTE,
  textStyle: {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    color: '#475569', // text-secondary
  },
  title: {
    textStyle: {
      fontFamily: FONT_FAMILY,
      fontSize: 16,
      fontWeight: 600,
      color: '#0f1b2d', // text-primary
    },
    subtextStyle: {
      fontFamily: FONT_FAMILY,
      fontSize: 12,
      color: '#64748b', // text-muted
    },
  },
  categoryAxis: sharedAxisStyle('#e2e8f0', '#475569', '#f1f3f6'),
  valueAxis: sharedAxisStyle('#e2e8f0', '#475569', '#f1f3f6'),
  timeAxis: sharedAxisStyle('#e2e8f0', '#475569', '#f1f3f6'),
  logAxis: sharedAxisStyle('#e2e8f0', '#475569', '#f1f3f6'),
  legend: {
    textStyle: {
      fontFamily: FONT_FAMILY,
      fontSize: 12,
      color: '#475569',
    },
  },
  tooltip: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    textStyle: {
      fontFamily: FONT_FAMILY_MONO,
      fontSize: 12,
      color: '#0f1b2d',
    },
  },
  dataZoom: {
    backgroundColor: '#f8f9fb',
    borderColor: '#e2e8f0',
    fillerColor: 'rgba(29, 78, 216, 0.08)',
    handleColor: '#1d4ed8',
    textStyle: { color: '#475569' },
  },
}

export const SETA_DARK_THEME = {
  backgroundColor: 'transparent',
  color: DARK_PALETTE,
  textStyle: {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    color: '#cbd5e1', // dark text-secondary
  },
  title: {
    textStyle: {
      fontFamily: FONT_FAMILY,
      fontSize: 16,
      fontWeight: 600,
      color: '#f1f5f9', // dark text-primary
    },
    subtextStyle: {
      fontFamily: FONT_FAMILY,
      fontSize: 12,
      color: '#94a3b8', // dark text-muted
    },
  },
  categoryAxis: sharedAxisStyle('#1e293b', '#94a3b8', '#1f2937'),
  valueAxis: sharedAxisStyle('#1e293b', '#94a3b8', '#1f2937'),
  timeAxis: sharedAxisStyle('#1e293b', '#94a3b8', '#1f2937'),
  logAxis: sharedAxisStyle('#1e293b', '#94a3b8', '#1f2937'),
  legend: {
    textStyle: {
      fontFamily: FONT_FAMILY,
      fontSize: 12,
      color: '#cbd5e1',
    },
  },
  tooltip: {
    backgroundColor: '#111827',
    borderColor: '#1e293b',
    textStyle: {
      fontFamily: FONT_FAMILY_MONO,
      fontSize: 12,
      color: '#f1f5f9',
    },
  },
  dataZoom: {
    backgroundColor: '#111827',
    borderColor: '#1e293b',
    fillerColor: 'rgba(59, 130, 246, 0.15)',
    handleColor: '#3b82f6',
    textStyle: { color: '#cbd5e1' },
  },
}

/** Register both SETA themes with an ECharts instance. */
export function registerSetaThemes(echartsInstance: {
  registerTheme: (name: string, theme: object) => void
}): void {
  echartsInstance.registerTheme('seta-light', SETA_LIGHT_THEME)
  echartsInstance.registerTheme('seta-dark', SETA_DARK_THEME)
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/charts && bun run test -- --run src/core/theme.spec.ts && cd ../..
```

Expected: PASS.

- [ ] **Step 5: Export from barrel**

Add to `packages/charts/src/index.ts`:

```typescript
// Themes
export { SETA_LIGHT_THEME, SETA_DARK_THEME, registerSetaThemes } from './core/theme'
```

- [ ] **Step 6: Commit**

```bash
git add packages/charts/src/core/theme.ts packages/charts/src/core/theme.spec.ts packages/charts/src/index.ts
git commit -m "feat(charts): add SETA light/dark ECharts themes

Aligned with DESIGN.md: navy accent palette, Geist/Geist Mono
typography, semantic colors for axes, tooltips, and data zoom."
```

---

### Task 6: Chart type registry — `chart-type-registry.ts`

**Files:**

- Create: `packages/charts/src/core/chart-type-registry.ts`
- Create: `packages/charts/src/core/chart-type-registry.spec.ts`
- Modify: `packages/charts/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/charts/src/core/chart-type-registry.spec.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/charts && bun run test -- --run src/core/chart-type-registry.spec.ts && cd ../..
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `packages/charts/src/core/chart-type-registry.ts`:

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/charts && bun run test -- --run src/core/chart-type-registry.spec.ts && cd ../..
```

Expected: PASS.

- [ ] **Step 5: Export from barrel**

Add to `packages/charts/src/index.ts`:

```typescript
// Chart type registry
export {
  CHART_TYPE_REGISTRY,
  getChartTypeMeta,
  listChartTypes,
  listChartTypesByCategory,
} from './core/chart-type-registry'
export type { ChartTypeMeta } from './core/chart-type-registry'
```

- [ ] **Step 6: Commit**

```bash
git add packages/charts/src/core/chart-type-registry.ts packages/charts/src/core/chart-type-registry.spec.ts packages/charts/src/index.ts
git commit -m "feat(charts): add chart type registry with all 22 ECharts types

Metadata per type: label, category, axis/stacking support,
minimum measures/dimensions. Lookup and filter helpers."
```

---

### Task 7: Base EChart component — `EChart.tsx`

**Files:**

- Create: `packages/charts/src/components/EChart.tsx`
- Create: `packages/charts/src/components/EChart.spec.tsx`
- Modify: `packages/charts/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/charts/src/components/EChart.spec.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
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
```

- [ ] **Step 2: Install @testing-library/react**

```bash
cd packages/charts && bun add -d @testing-library/react && cd ../..
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd packages/charts && bun run test -- --run src/components/EChart.spec.tsx && cd ../..
```

Expected: FAIL — `./EChart` module not found.

- [ ] **Step 4: Write the implementation**

Create `packages/charts/src/components/EChart.tsx`:

```tsx
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
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd packages/charts && bun run test -- --run src/components/EChart.spec.tsx && cd ../..
```

Expected: PASS.

- [ ] **Step 6: Export from barrel**

Add to `packages/charts/src/index.ts`:

```typescript
// Components
export { EChart } from './components/EChart'
export type { EChartProps } from './components/EChart'
```

- [ ] **Step 7: Commit**

```bash
git add packages/charts/src/components/EChart.tsx packages/charts/src/components/EChart.spec.tsx packages/charts/src/index.ts
git commit -m "feat(charts): add base EChart component

React wrapper over echarts-for-react with SETA theme defaults.
Only component that touches echarts directly — everything else
works with option JSON."
```

---

### Task 8: Final verification — full build and all tests

**Files:**

- None new — verification only

- [ ] **Step 1: Run all tests in packages/charts**

```bash
cd packages/charts && bun run test && cd ../..
```

Expected: all tests pass.

- [ ] **Step 2: Typecheck packages/charts**

```bash
cd packages/charts && bun run typecheck && cd ../..
```

Expected: no errors.

- [ ] **Step 3: Typecheck packages/ui (confirm Recharts removal is clean)**

```bash
cd packages/ui && bun run typecheck && cd ../..
```

Expected: no errors.

- [ ] **Step 4: Run turbo typecheck across the whole monorepo**

```bash
bunx turbo typecheck
```

Expected: all packages and apps pass. If any app was importing chart components from `@future/ui`, this will catch it.

- [ ] **Step 5: Verify final barrel exports**

Check that `packages/charts/src/index.ts` exports everything:

```typescript
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

// Components
export { EChart } from './components/EChart'
export type { EChartProps } from './components/EChart'
```

- [ ] **Step 6: Commit any fixes if needed, then final commit if barrel was updated**

```bash
git add -A packages/charts/
git status
```

If there are changes:

```bash
git commit -m "feat(charts): finalize barrel exports and verify full build"
```
