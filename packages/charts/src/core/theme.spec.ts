import { describe, it, expect, vi } from 'vitest'
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
    it('registers both themes with echarts', () => {
      const mockEcharts = { registerTheme: vi.fn() }
      registerSetaThemes(mockEcharts as never)
      expect(mockEcharts.registerTheme).toHaveBeenCalledTimes(2)
      expect(mockEcharts.registerTheme).toHaveBeenCalledWith('seta-light', SETA_LIGHT_THEME)
      expect(mockEcharts.registerTheme).toHaveBeenCalledWith('seta-dark', SETA_DARK_THEME)
    })
  })
})
