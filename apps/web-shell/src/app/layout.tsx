import type { Metadata } from 'next'
import { ThemeProvider } from '@future/ui'
import { fontVariables } from '@future/ui/fonts'
import './globals.css'

export const metadata: Metadata = {
  title: 'Future',
  description: 'Agent-native enterprise OS by SETA',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontVariables} data-density="compact" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
