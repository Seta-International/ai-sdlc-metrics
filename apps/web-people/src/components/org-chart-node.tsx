'use client'

import * as React from 'react'
import { Card, Badge, HoverCard, HoverCardContent, HoverCardTrigger } from '@future/ui'
import Image from 'next/image'
import { ChevronDown, ChevronRight, Users } from 'lucide-react'
import type { OrgChartNode as OrgChartNodeType } from '../lib/types'

interface OrgChartNodeProps {
  node: OrgChartNodeType
  isHighlighted?: boolean
  onToggle: (employmentId: string) => void
  onNavigate: (employmentId: string) => void
  expandedIds: Set<string>
}

export function OrgChartNodeComponent({
  node,
  isHighlighted = false,
  onToggle,
  onNavigate,
  expandedIds,
}: OrgChartNodeProps) {
  const isExpanded = expandedIds.has(node.employmentId)
  const hasChildren = node.directReportCount > 0

  const initials = node.fullName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="flex flex-col items-center">
      <HoverCard>
        <HoverCardTrigger asChild>
          <Card
            className={`w-56 cursor-pointer border p-3 transition-all ${
              isHighlighted
                ? 'border-[#7170ff] ring-2 ring-[#7170ff]/20'
                : 'border-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.15)]'
            } bg-[rgba(255,255,255,0.02)]`}
            onClick={() => hasChildren && onToggle(node.employmentId)}
            onDoubleClick={() => onNavigate(node.employmentId)}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgba(255,255,255,0.05)] text-sm font-[510] text-[#d0d6e0]">
                {node.avatarUrl ? (
                  <Image
                    src={node.avatarUrl}
                    alt={node.fullName}
                    width={40}
                    height={40}
                    className="h-full w-full rounded-full object-cover"
                  />
                ) : (
                  initials
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-[510] text-[#f7f8f8]">{node.fullName}</div>
                <div className="truncate text-xs text-[#8a8f98]">{node.jobTitle}</div>
                <div className="truncate text-xs text-[#62666d]">{node.department}</div>
              </div>
              {hasChildren && (
                <div className="flex items-center gap-1 shrink-0">
                  <Badge variant="subtle" className="h-5 px-1.5 text-[10px]">
                    <Users className="mr-0.5 h-2.5 w-2.5" />
                    {node.directReportCount}
                  </Badge>
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-[#8a8f98]" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-[#8a8f98]" />
                  )}
                </div>
              )}
            </div>
          </Card>
        </HoverCardTrigger>
        <HoverCardContent className="w-64">
          <div className="space-y-2 text-sm">
            <div className="font-[510] text-[#f7f8f8]">{node.fullName}</div>
            <div className="text-xs text-[#8a8f98]">{node.jobTitle}</div>
            <div className="text-xs text-[#62666d]">{node.department}</div>
            <div className="text-xs text-[#62666d]">{node.directReportCount} direct reports</div>
            <button
              type="button"
              onClick={() => onNavigate(node.employmentId)}
              className="text-xs text-[#7170ff] hover:text-[#828fff]"
            >
              View Profile
            </button>
          </div>
        </HoverCardContent>
      </HoverCard>

      {/* Children */}
      {isExpanded && node.children && node.children.length > 0 && (
        <div className="mt-4">
          <div className="mx-auto h-4 w-px bg-[rgba(255,255,255,0.1)]" />
          {node.children.length > 1 && (
            <div
              className="mx-auto h-px bg-[rgba(255,255,255,0.1)]"
              style={{ width: `${(node.children.length - 1) * 240}px` }}
            />
          )}
          <div className="flex gap-6 justify-center">
            {node.children.map((child) => (
              <div key={child.employmentId} className="flex flex-col items-center">
                <div className="h-4 w-px bg-[rgba(255,255,255,0.1)]" />
                <OrgChartNodeComponent
                  node={child}
                  isHighlighted={false}
                  onToggle={onToggle}
                  onNavigate={onNavigate}
                  expandedIds={expandedIds}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
