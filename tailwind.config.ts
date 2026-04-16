const config = {
  content: ['./apps/*/src/**/*.{js,ts,jsx,tsx,mdx}', './packages/*/src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
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
