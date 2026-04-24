'use client'

import * as React from 'react'
import { ThemeProvider as NextThemesProvider, useTheme, type ThemeProviderProps } from 'next-themes'

// next-themes 0.4.x renders a <script dangerouslySetInnerHTML> for anti-FOUC during SSR.
// React 19 warns about script tags encountered during client reconciliation, even though
// the script runs correctly at SSR parse time. This is a false positive — remove once
// next-themes ships a React 19-compatible release.
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  const _err = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('Encountered a script tag')) return
    _err(...args)
  }
}

const THEME_COOKIE = 'future-theme'
const COOKIE_DOMAIN = process.env['NEXT_PUBLIC_COOKIE_DOMAIN'] ?? ''

function writeThemeCookie(theme: string) {
  const maxAge = 365 * 24 * 60 * 60
  const domainPart = COOKIE_DOMAIN ? `; domain=${COOKIE_DOMAIN}` : ''
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${maxAge}; SameSite=Lax${domainPart}`
}

function ThemeSync() {
  const { resolvedTheme } = useTheme()
  React.useEffect(() => {
    if (resolvedTheme) writeThemeCookie(resolvedTheme)
  }, [resolvedTheme])
  return null
}

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      <ThemeSync />
      {children}
    </NextThemesProvider>
  )
}
