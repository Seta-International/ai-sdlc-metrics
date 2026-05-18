import { setaPreset } from '@seta/ui/tokens'
import type { Config } from 'tailwindcss'

export default {
  presets: [setaPreset],
  content: ['./index.html', './src/**/*.{ts,tsx}', '../../platform/ui/src/**/*.{ts,tsx}'],
} satisfies Config
