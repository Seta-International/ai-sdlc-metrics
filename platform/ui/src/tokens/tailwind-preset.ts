import type { Config } from 'tailwindcss'

export const setaPreset: Config = {
  content: [],
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary)',
        'primary-hover': 'var(--color-primary-hover)',
        'primary-focus': 'var(--color-primary-focus)',
        'primary-subtle': 'var(--color-primary-subtle)',
        'on-primary': 'var(--color-on-primary)',

        canvas: 'var(--color-canvas)',
        'canvas-soft': 'var(--color-canvas-soft)',
        'canvas-subtle': 'var(--color-canvas-subtle)',

        ink: 'var(--color-ink)',
        'ink-secondary': 'var(--color-ink-secondary)',
        'ink-mute': 'var(--color-ink-mute)',
        'ink-subtle': 'var(--color-ink-subtle)',

        'sidebar-bg': 'var(--color-sidebar-bg)',
        'sidebar-surface-1': 'var(--color-sidebar-surface-1)',
        'sidebar-surface-2': 'var(--color-sidebar-surface-2)',
        'on-sidebar': 'var(--color-on-sidebar)',
        'on-sidebar-muted': 'var(--color-on-sidebar-muted)',
        'on-sidebar-subtle': 'var(--color-on-sidebar-subtle)',

        'agent-bg': 'var(--color-agent-bg)',
        'agent-surface': 'var(--color-agent-surface)',

        hairline: 'var(--color-hairline)',
        'hairline-strong': 'var(--color-hairline-strong)',

        success: 'var(--color-success)',
        'success-soft': 'var(--color-success-soft)',
        warning: 'var(--color-warning)',
        'warning-soft': 'var(--color-warning-soft)',
        error: 'var(--color-error)',
        'error-soft': 'var(--color-error-soft)',
        info: 'var(--color-info)',
        'info-soft': 'var(--color-info-soft)',
        neutral: 'var(--color-neutral)',
        'neutral-soft': 'var(--color-neutral-soft)',
      },
      borderRadius: {
        xs: '4px',
        sm: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        pill: '9999px',
      },
      spacing: {
        xxs: '2px',
        xs: '4px',
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '24px',
        xxl: '32px',
        huge: '64px',
      },
      fontFamily: {
        sans: ['Inter', 'SF Pro Display', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'ui-monospace', 'Menlo', 'monospace'],
      },
      boxShadow: {
        card: 'rgba(15, 23, 42, 0.08) 0 1px 3px',
        float: 'rgba(15, 23, 42, 0.08) 0 8px 24px, rgba(15, 23, 42, 0.04) 0 2px 6px',
      },
    },
  },
}
