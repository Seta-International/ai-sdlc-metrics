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
        accent: 'var(--color-accent)',
        // Status tokens for alert/error states
        'status-bg-success': 'var(--color-bg-success)',
        'status-text-success': 'var(--color-text-success)',
        'status-border-success': 'var(--color-border-success)',
        'status-bg-warning': 'var(--color-bg-warning)',
        'status-text-warning': 'var(--color-text-warning)',
        'status-border-warning': 'var(--color-border-warning)',
        'status-bg-danger': 'var(--color-bg-danger)',
        'status-text-danger': 'var(--color-text-danger)',
        'status-border-danger': 'var(--color-border-danger)',
        'status-bg-info': 'var(--color-bg-info)',
        'status-text-info': 'var(--color-text-info)',
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
      // Non-standard spacing values from DESIGN.md optical micro-adjustments.
      // Standard Tailwind spacing (p-1=4px, p-2=8px, p-3=12px, p-4=16px, etc.) is unchanged.
      spacing: {
        '1.25': '5px',
        '1.75': '7px',
        '2.75': '11px',
        '4.75': '19px',
        '5.5': '22px',
        '6.5': '26px',
        '8.75': '35px',
      },
      ringWidth: {
        '1.5': '1.5px',
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
      // Letter-spacing values from DESIGN.md typography scale.
      // Named per heading level for use alongside text-size and font-weight utilities.
      letterSpacing: {
        h1: '-0.704px',
        h2: '-0.288px',
        h3: '-0.24px',
        body: '-0.165px',
        caption: '-0.182px',
        'caption-sm': '-0.13px',
        'table-head': '0.05em',
      },
    },
  },
  plugins: [],
}

module.exports = config
