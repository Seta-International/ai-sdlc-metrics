import type { Metadata } from 'next'
import { GlobalNav, ThemeProvider } from '@future/ui'
import { fontVariables } from '@future/ui/fonts'
import './globals.css'

export const metadata: Metadata = { title: 'Agents — Future' }

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontVariables} data-density="compact" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <GlobalNav currentApp="agents" />
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
