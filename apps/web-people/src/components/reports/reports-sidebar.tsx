'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Users, CheckSquare, FileText, Clock, FileSignature } from 'lucide-react'

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
                ? 'bg-[rgba(255,255,255,0.08)] text-[#f7f8f8] font-[510]'
                : 'text-[#8a8f98] hover:bg-[rgba(255,255,255,0.04)] hover:text-[#d0d6e0]'
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
