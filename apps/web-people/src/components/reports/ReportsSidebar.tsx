'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Users, CheckSquare, FileText, Clock, FileSignature } from '@future/ui/icons'

const reportLinks = [
  { href: '/reports/headcount', label: 'Headcount', icon: Users },
  { href: '/reports/completeness', label: 'Profile Completeness', icon: CheckSquare },
  { href: '/reports/documents', label: 'Document Compliance', icon: FileText },
  { href: '/reports/probation', label: 'Probation Tracker', icon: Clock },
  { href: '/reports/contracts', label: 'Contract Expiry', icon: FileSignature },
]

export function ReportsSidebar() {
  const pathname = usePathname()
  return (
    <nav className="w-56 shrink-0 space-y-1">
      {reportLinks.map((link) => {
        const isActive = pathname === link.href
        const Icon = link.icon
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
              isActive
                ? 'bg-overlay/8 text-foreground font-510'
                : 'text-muted-foreground hover:bg-overlay/4 hover:text-secondary-foreground'
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}
