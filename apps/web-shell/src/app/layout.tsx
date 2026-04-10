import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Future',
  description: 'Agent-native enterprise OS by SETA',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
