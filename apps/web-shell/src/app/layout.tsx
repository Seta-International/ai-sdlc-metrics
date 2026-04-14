import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { ThemeProvider } from '@future/ui'
import { fontVariables } from '@future/ui/fonts'
import './globals.css'

export const metadata: Metadata = {
  title: 'Future',
  description: 'Agent-native enterprise OS by SETA',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get('future-theme')?.value
  return (
    <html lang="en" className={fontVariables} data-density="compact" suppressHydrationWarning>
      <body>
        <ThemeProvider defaultTheme={theme ?? 'system'} enableSystem={!theme}>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
