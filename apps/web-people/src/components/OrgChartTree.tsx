'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Alert, AlertDescription, Button, Skeleton } from '@future/ui'
import { ArrowUpCircle, GripVertical, Maximize2, Minus, Plus } from '@future/ui/icons'
import { OrgChartNodeComponent } from './OrgChartNode'
import { useOrgChart } from '../lib/hooks/use-org-chart'
import type { OrgChartNode } from '../lib/types'

const MIN_ZOOM = 0.5
const MAX_ZOOM = 1.5
const ZOOM_STEP = 0.1

type PanState = {
  x: number
  y: number
}

export function OrgChartTree() {
  const router = useRouter()
  const chart = useOrgChart()
  const [zoom, setZoom] = React.useState(1)
  const [pan, setPan] = React.useState<PanState>({ x: 0, y: 0 })
  const dragStartRef = React.useRef<{
    pointerId: number
    x: number
    y: number
    pan: PanState
  } | null>(null)

  const rootNodes = React.useMemo(
    () =>
      chart.visibleNodes.filter(
        (node) => !node.managerEmploymentId || !chart.nodesById.has(node.managerEmploymentId),
      ),
    [chart.nodesById, chart.visibleNodes],
  )

  function zoomBy(delta: number) {
    setZoom((previous) => clampZoom(roundZoom(previous + delta)))
  }

  function resetView() {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragStartRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      pan,
    }
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const dragStart = dragStartRef.current
    if (!dragStart || dragStart.pointerId !== event.pointerId) return

    setPan({
      x: dragStart.pan.x + event.clientX - dragStart.x,
      y: dragStart.pan.y + event.clientY - dragStart.y,
    })
  }

  function handlePointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    const dragStart = dragStartRef.current
    if (dragStart?.pointerId !== event.pointerId) return
    dragStartRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return (
    <section className="space-y-3" aria-label="Org chart canvas">
      <div className="flex flex-col gap-3 rounded-lg border border-sidebar-border bg-overlay/2 p-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-510 text-fg-primary">Reporting context</p>
          <p className="text-xs text-fg-subtle">
            Manual traversal only. Search remains in People Directory for V1.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => zoomBy(-ZOOM_STEP)}
            disabled={zoom <= MIN_ZOOM}
            aria-label="Zoom out"
          >
            <Minus className="size-3.5" />
          </Button>
          <span className="w-12 text-center text-xs font-510 tabular-nums text-fg-muted">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => zoomBy(ZOOM_STEP)}
            disabled={zoom >= MAX_ZOOM}
            aria-label="Zoom in"
          >
            <Plus className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={resetView}
            aria-label="Reset view"
          >
            <Maximize2 className="size-3.5" />
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={resetView}>
            Back to my context
          </Button>
        </div>
      </div>

      <div
        className="relative min-h-content-lg overflow-hidden rounded-xl border border-sidebar-border bg-overlay/2 p-4"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 rounded-full border border-sidebar-border bg-background/70 px-3 py-1 text-xs text-fg-subtle">
          <GripVertical className="size-3" />
          Drag canvas to pan
        </div>

        <div
          className="flex min-h-content-lg items-center justify-center pt-10"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center',
          }}
        >
          <OrgChartCanvasContent
            chart={chart}
            rootNodes={rootNodes}
            onResetView={resetView}
            onViewProfile={(employmentId) => router.push(`/profile/${employmentId}`)}
          />
        </div>
      </div>
    </section>
  )
}

type OrgChartCanvasContentProps = {
  chart: ReturnType<typeof useOrgChart>
  rootNodes: OrgChartNode[]
  onResetView: () => void
  onViewProfile: (employmentId: string) => void
}

function OrgChartCanvasContent(props: OrgChartCanvasContentProps) {
  const { chart, rootNodes, onResetView, onViewProfile } = props

  if (chart.isLoadingContext) {
    return (
      <div className="flex flex-col items-center gap-3">
        <Skeleton className="h-24 w-64" />
        <Skeleton className="h-16 w-48" />
      </div>
    )
  }

  if (chart.contextError) {
    return (
      <Alert variant="destructive" className="max-w-md">
        <AlertDescription className="flex items-center justify-between gap-3">
          <span>{chart.contextError}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={chart.retryContext}
            aria-label="Retry org chart context"
          >
            <ArrowUpCircle className="size-3.5" />
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  if (rootNodes.length === 0) {
    return (
      <div className="max-w-sm rounded-lg border border-sidebar-border bg-overlay/2 p-5 text-center">
        <p className="text-sm font-510 text-fg-primary">No org placement found</p>
        <p className="mt-1 text-xs text-fg-subtle">
          We could not find an org chart position to display.
        </p>
        <Button type="button" variant="ghost" size="sm" className="mt-3" onClick={onResetView}>
          Reset view
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-start justify-center gap-8">
      {rootNodes.map((node) => (
        <OrgChartNodeComponent
          key={node.employmentId}
          node={node}
          nodesById={chart.nodesById}
          childrenByParentId={chart.childrenByParentId}
          expandedIds={chart.expandedIds}
          childLoadingIds={chart.childLoadingIds}
          childErrorsById={chart.childErrorsById}
          onExpand={chart.expandNode}
          onCollapse={chart.collapseNode}
          onRetry={chart.retryChildren}
          onViewProfile={onViewProfile}
        />
      ))}
    </div>
  )
}

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

function roundZoom(value: number) {
  return Math.round(value * 10) / 10
}
