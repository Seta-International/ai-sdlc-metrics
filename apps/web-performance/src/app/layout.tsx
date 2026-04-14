import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { GlobalNav, ThemeProvider } from '@future/ui'
import { fontVariables } from '@future/ui/fonts'
import './globals.css'

export const metadata: Metadata = { title: 'Performance — Future' }

export default async function Layout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get('future-theme')?.value
  return (
    <html lang="en" className={fontVariables} data-density="compact" suppressHydrationWarning>
      <body>
        <ThemeProvider defaultTheme={theme ?? 'system'} enableSystem={!theme}>
          <GlobalNav currentApp="performance" />
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
