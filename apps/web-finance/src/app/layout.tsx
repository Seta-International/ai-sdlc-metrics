import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { ThemeProvider } from '@future/ui'
import { fontVariables } from '@future/ui/fonts'
import { FinanceLayoutClient } from './layout-client'
import './globals.css'

export const metadata: Metadata = { title: 'Finance — Future' }

export default async function Layout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get('future-theme')?.value
  return (
    <html lang="en" className={fontVariables} data-density="compact" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeProvider defaultTheme={theme ?? 'system'} enableSystem={!theme}>
          <FinanceLayoutClient>{children}</FinanceLayoutClient>
        </ThemeProvider>
      </body>
    </html>
  )
}
