import { Bell } from 'lucide-react'

interface Props {
  count: number
  onClick?: () => void
}

export function NotificationBell({ count, onClick }: Props) {
  const label = count > 99 ? '99+' : String(count)
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Notifications"
      className="relative inline-flex size-9 items-center justify-center rounded-md text-ink-mute hover:bg-canvas-subtle"
    >
      <Bell className="size-5 stroke-[1.5]" />
      {count > 0 && (
        <span className="absolute right-1 top-1 inline-flex min-w-[16px] items-center justify-center rounded-pill bg-error px-1 text-[10px] font-medium leading-4 text-on-primary tnum">
          {label}
        </span>
      )}
    </button>
  )
}
