'use client'

import { usePathname } from 'next/navigation'
import { Folder, User } from 'lucide-react'
import { SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarMenuSkeleton } from '@future/ui'
import { useSession } from '@future/auth'
import { usePersonalPlans, type PersonalPlanSummary } from '../../lib/hooks/usePersonalPlans'

interface OrderedPlan extends PersonalPlanSummary {
  isPersonal: boolean
}

function orderPlans(plans: PersonalPlanSummary[], actorId: string): OrderedPlan[] {
  const decorated = plans.map((p) => ({ ...p, isPersonal: p.ownerActorId === actorId }))
  const personal = decorated.filter((p) => p.isPersonal)
  const team = decorated.filter((p) => !p.isPersonal).sort((a, b) => a.name.localeCompare(b.name))
  return [...personal, ...team]
}

export function PlannerSidebarPlansGroup() {
  const session = useSession()
  const pathname = usePathname()
  const { data, isLoading } = usePersonalPlans()

  if (!session || isLoading || !data) {
    return (
      <div data-testid="sidebar-plans-skeleton">
        <SidebarMenu>
          {[0, 1, 2].map((i) => (
            <SidebarMenuItem key={i}>
              <SidebarMenuSkeleton showIcon />
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <p data-testid="sidebar-plans-empty" className="px-2 py-1 text-xs text-fg-subtle">
        No plans yet.
      </p>
    )
  }

  const ordered = orderPlans(data, session.actorId)

  return (
    <SidebarMenu>
      {ordered.map((plan) => {
        const href = `/plans/${plan.id}/board`
        const isActive = pathname === href || pathname.startsWith(href + '/')
        const Icon = plan.isPersonal ? User : Folder
        return (
          <SidebarMenuItem key={plan.id}>
            <SidebarMenuButton isActive={isActive} tooltip={plan.name} asChild>
              <a href={href} aria-current={isActive ? 'page' : undefined}>
                <Icon />
                <span>{plan.name}</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )
      })}
    </SidebarMenu>
  )
}
