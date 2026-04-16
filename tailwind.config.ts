const config = {
  content: ['./apps/*/src/**/*.{js,ts,jsx,tsx,mdx}', './packages/*/src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Design system semantic tokens.
        // Values point to CSS variables defined in packages/ui/src/styles/globals.css.
        // Listed here so eslint-plugin-tailwindcss knows they are valid tokens.
        canvas: 'var(--color-canvas)',
        panel: 'var(--color-panel)',
        surface: 'var(--color-surface)',
        elevated: 'var(--color-elevated)',
        'fg-primary': 'var(--color-fg-primary)',
        'fg-secondary': 'var(--color-fg-secondary)',
        'fg-muted': 'var(--color-fg-muted)',
        'fg-subtle': 'var(--color-fg-subtle)',
        divider: 'var(--color-divider)',
        'divider-md': 'var(--color-divider-md)',
        'divider-lg': 'var(--color-divider-lg)',
        'line-tint': 'var(--color-line-tint)',
        line: 'var(--color-line)',
        overlay: 'var(--color-overlay)',
        brand: 'var(--color-brand)',
        'accent-hover': 'var(--color-accent-hover)',
        security: 'var(--color-security)',
        'success-ds': 'var(--color-success-ds)',
        emerald: 'var(--color-emerald)',
      },
      fontWeight: {
        /**
         * Custom font weights:
         * 510 - Medium Plus (emphasis weight)
         * 590 - Semibold Minus (strong emphasis weight)
         * Aligns with design system typography scale
         */
        510: '510',
        590: '590',
      },
      fontSize: {
        /**
         * Custom text sizes:
         * tiny - 10px (for minimal UI elements)
         * micro - 11px (for badges, labels, footnotes)
         * Complements standard Tailwind sizes (xs: 12px, sm: 14px, base: 16px, etc.)
         */
        tiny: ['10px', { lineHeight: '1.4', letterSpacing: 'normal' }],
        micro: ['11px', { lineHeight: '1.4', letterSpacing: 'normal' }],
      },
      // Non-standard spacing values from DESIGN.md optical micro-adjustments.
      // Standard Tailwind spacing (p-1=4px, p-2=8px, p-3=12px, p-4=16px, etc.) is unchanged.
      spacing: {
        '1.75': '7px',
        '2.75': '11px',
        '4.75': '19px',
        '5.5': '22px',
        '8.75': '35px',
      },
      maxHeight: {
        /**
         * Reusable content container heights:
         * Used for scrollable lists, command palettes, org charts
         */
        'content-lg': '500px',
        'content-md': '300px',
      },
      minHeight: {
        /**
         * Minimum heights for layout containers
         */
        'content-lg': '500px',
      },
    },
  },
  plugins: [],
}

export default config
