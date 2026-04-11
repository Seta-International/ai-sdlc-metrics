import type { Metadata } from 'next'
import { GlobalNav } from '@future/ui'
import './globals.css'

export const metadata: Metadata = { title: 'Projects — Future' }

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <GlobalNav currentApp="projects" />
        {children}
      </body>
    </html>
  )
}
