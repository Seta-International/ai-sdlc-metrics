'use client'

import * as React from 'react'
import Image from 'next/image'
import { Alert, AlertDescription, Badge, Button, Card, CardContent, Skeleton } from '@future/ui'
import { ArrowUpCircle, ChevronDown, ChevronRight, UserIcon, Users } from '@future/ui/icons'
import type { OrgChartNode } from '../lib/types'

type OrgChartNodeProps = {
  node: OrgChartNode
  nodesById: Map<string, OrgChartNode>
  childrenByParentId: Map<string, string[]>
  expandedIds: Set<string>
  childLoadingIds: Set<string>
  childErrorsById: Map<string, string>
  compact?: boolean
  onExpand: (employmentId: string) => void
  onCollapse: (employmentId: string) => void
  onRetry: (employmentId: string) => void
  onViewProfile: (employmentId: string) => void
}

export function OrgChartNodeComponent(props: OrgChartNodeProps) {
  const {
    node,
    nodesById,
    childrenByParentId,
    expandedIds,
    childLoadingIds,
    childErrorsById,
    compact,
    onExpand,
    onCollapse,
    onRetry,
    onViewProfile,
  } = props
  const isExpanded = expandedIds.has(node.employmentId)
  const childIds = childrenByParentId.get(node.employmentId) ?? []
  const isLoadingChildren = childLoadingIds.has(node.employmentId)
  const childError = childErrorsById.get(node.employmentId)
  const initials = node.fullName
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="flex flex-col items-center">
      {compact ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} direct reports for ${node.fullName}`}
          onClick={() => {
            if (!node.hasDirectReports) return
            if (isExpanded) onCollapse(node.employmentId)
            else onExpand(node.employmentId)
          }}
          className={[
            'h-auto rounded-full border px-3 py-1.5',
            node.relationshipToViewer === 'self'
              ? 'border-primary/50 ring-1 ring-primary/20'
              : 'border-sidebar-border',
          ].join(' ')}
        >
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-sidebar-border bg-sidebar-accent/30 text-xs font-510 text-fg-primary">
            {node.avatarUrl ? (
              <Image
                src={node.avatarUrl}
                alt={node.fullName}
                width={28}
                height={28}
                className="size-full rounded-full object-cover"
              />
            ) : (
              initials
            )}
          </div>
          <span className="text-sm font-510 text-fg-primary">{node.fullName}</span>
          {node.relationshipToViewer === 'self' && <Badge variant="subtle">You</Badge>}
        </Button>
      ) : (
        <Card
          data-testid="org-card"
          className={[
            'w-64 border-sidebar-border bg-overlay/2 shadow-sm',
            node.relationshipToViewer === 'self' ? 'border-primary/50 ring-1 ring-primary/20' : '',
          ].join(' ')}
        >
          <CardContent className="p-3">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-sidebar-border bg-sidebar-accent/30 text-sm font-510 text-fg-primary">
                {node.avatarUrl ? (
                  <Image
                    src={node.avatarUrl}
                    alt={node.fullName}
                    width={40}
                    height={40}
                    className="size-full rounded-full object-cover"
                  />
                ) : (
                  initials
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-510 text-fg-primary">{node.fullName}</p>
                  {node.relationshipToViewer === 'self' && <Badge variant="subtle">You</Badge>}
                </div>
                <p className="truncate text-xs text-fg-muted">{node.jobTitle ?? 'Unknown title'}</p>
                <p className="truncate text-xs text-fg-subtle">
                  {[node.departmentName, node.locationName].filter(Boolean).join(' · ') ||
                    'Unknown org'}
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <Badge variant="subtle" className="gap-1">
                <Users className="size-3" />
                {node.directReportCount}
              </Badge>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onViewProfile(node.employmentId)}
                  aria-label={`View profile for ${node.fullName}`}
                >
                  <UserIcon className="size-3.5" />
                </Button>
                {node.hasDirectReports && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      isExpanded ? onCollapse(node.employmentId) : onExpand(node.employmentId)
                    }
                    aria-label={`${isExpanded ? 'Collapse' : 'Expand'} direct reports for ${node.fullName}`}
                  >
                    {isExpanded ? (
                      <ChevronDown className="size-3.5" />
                    ) : (
                      <ChevronRight className="size-3.5" />
                    )}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoadingChildren && <Skeleton className="mt-3 h-6 w-32" />}
      {childError && (
        <Alert variant="destructive" className="mt-3 w-64">
          <AlertDescription className="flex items-center justify-between gap-2">
            <span>{childError}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onRetry(node.employmentId)}
              aria-label={`Retry direct reports for ${node.fullName}`}
            >
              <ArrowUpCircle className="size-3.5" />
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {isExpanded && childIds.length > 0 && (
        <div className="mt-4 flex flex-col items-center">
          <div data-testid="org-connector" className="h-4 w-px bg-sidebar-border" />
          <div className="flex gap-6 border-t border-sidebar-border">
            {childIds.map((childId) => {
              const child = nodesById.get(childId)
              if (!child) return null
              return (
                <div key={childId} className="flex flex-col items-center">
                  <div data-testid="org-connector" className="h-4 w-px bg-sidebar-border" />
                  <OrgChartNodeComponent {...props} node={child} compact={compact} />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
