import { ChevronRight } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'

export interface Crumb {
  label: ReactNode
  href?: string
}

interface Props {
  items: readonly Crumb[]
}

export function Breadcrumb({ items }: Props) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-[12px] text-ink-mute">
      {items.map((c, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: items are stable per-render (breadcrumb path)
        <Fragment key={i}>
          {c.href ? (
            <a href={c.href} className="hover:text-ink">
              {c.label}
            </a>
          ) : (
            <span className={i === items.length - 1 ? 'text-ink' : undefined}>{c.label}</span>
          )}
          {i < items.length - 1 && <ChevronRight className="size-3 stroke-[1.5] text-ink-subtle" />}
        </Fragment>
      ))}
    </nav>
  )
}
