'use client'

import Image from 'next/image'
import { Avatar } from '@future/ui'

interface AvatarNameCellProps {
  fullName: string
  preferredName?: string | null
  avatarUrl?: string | null
  subtitle?: string | null
}

export function AvatarNameCell({
  fullName,
  preferredName,
  avatarUrl,
  subtitle,
}: AvatarNameCellProps) {
  const initials = fullName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="flex items-center gap-3">
      <Avatar className="h-8 w-8 shrink-0">
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt={fullName}
            width={32}
            height={32}
            className="h-full w-full rounded-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-full bg-muted text-xs font-[510] text-muted-foreground">
            {initials}
          </div>
        )}
      </Avatar>
      <div className="min-w-0">
        <div className="truncate text-sm font-[510] text-foreground">
          {fullName}
          {preferredName && (
            <span className="ml-1 text-muted-foreground font-normal">({preferredName})</span>
          )}
        </div>
        {subtitle && <div className="truncate text-xs text-muted-foreground">{subtitle}</div>}
      </div>
    </div>
  )
}
