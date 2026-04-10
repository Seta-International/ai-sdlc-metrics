"use client"

interface NavItem {
  label: string
  href: string
}

const NAV_ITEMS: NavItem[] = [
  { label: 'People', href: 'https://people.seta-international.com' },
  { label: 'Time', href: 'https://time.seta-international.com' },
  { label: 'Hiring', href: 'https://hiring.seta-international.com' },
  { label: 'Performance', href: 'https://performance.seta-international.com' },
  { label: 'Projects', href: 'https://projects.seta-international.com' },
  { label: 'Finance', href: 'https://finance.seta-international.com' },
  { label: 'Goals', href: 'https://goals.seta-international.com' },
  { label: 'Insights', href: 'https://insights.seta-international.com' },
  { label: 'Agents', href: 'https://agents.seta-international.com' },
  { label: 'Planner', href: 'https://planner.seta-international.com' },
  { label: 'Admin', href: 'https://admin.seta-international.com' },
]

export function GlobalNav() {
  return (
    <nav className="flex items-center gap-4 px-4 py-2 border-b">
      <a href="https://seta-international.com" className="font-bold">
        Future
      </a>
      {NAV_ITEMS.map((item) => (
        // Use <a> tags — not Next.js <Link> — cross-zone nav requires hard reload
        <a key={item.href} href={item.href} className="text-sm hover:underline">
          {item.label}
        </a>
      ))}
    </nav>
  )
}
