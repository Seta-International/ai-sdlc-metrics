'use client'

import * as React from 'react'
import { ThemeProvider as NextThemesProvider, useTheme, type ThemeProviderProps } from 'next-themes'

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
