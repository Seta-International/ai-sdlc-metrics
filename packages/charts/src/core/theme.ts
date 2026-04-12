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
