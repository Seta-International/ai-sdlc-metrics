import type { Metadata } from 'next'
import { GlobalNav } from '@future/ui'
import './globals.css'

export const metadata: Metadata = { title: 'Goals — Future' }

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <GlobalNav currentApp="goals" />
        {children}
      </body>
    </html>
  )
}
