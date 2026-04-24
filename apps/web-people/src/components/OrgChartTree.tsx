'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Alert, AlertDescription, Button, Skeleton, toast } from '@future/ui'
import { ArrowUpCircle } from '@future/ui/icons'
import html2canvas from 'html2canvas'
import { OrgChartNodeComponent } from './OrgChartNode'
import { OrgChartToolbar } from './OrgChartToolbar'
import { OrgChartZoomControls } from './OrgChartZoomControls'
import { useOrgChart } from '../lib/hooks/use-org-chart'
import type { OrgChartNode } from '../lib/types'

const MIN_ZOOM = 0.5
const MAX_ZOOM = 1.5
const ZOOM_STEP = 0.1

type PanState = { x: number; y: number }

export function OrgChartTree() {
  const router = useRouter()
  const chart = useOrgChart()
  const [zoom, setZoom] = React.useState(1)
  const [pan, setPan] = React.useState<PanState>({ x: 0, y: 0 })
  const [isCompact, setIsCompact] = React.useState(false)
  const [isExporting, setIsExporting] = React.useState(false)
  const canvasRef = React.useRef<HTMLDivElement>(null)
  const dragStartRef = React.useRef<{
    pointerId: number
    x: number
    y: number
    pan: PanState
  } | null>(null)

  const rootNodes = React.useMemo(
    () =>
      chart.rootEmploymentIds
        .map((id) => chart.nodesById.get(id))
        .filter((node): node is OrgChartNode => Boolean(node)),
    [chart.nodesById, chart.rootEmploymentIds],
  )

  function zoomBy(delta: number) {
    setZoom((prev) => clampZoom(roundZoom(prev + delta)))
  }

  function resetView() {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  async function handleExport() {
    if (!canvasRef.current || isExporting) return
    setIsExporting(true)
    const prevZoom = zoom
    const prevPan = pan
    setZoom(1)
    setPan({ x: 0, y: 0 })
    try {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      )
      const el = canvasRef.current
      if (!el) return
      const canvas = await html2canvas(el, { scale: 2 })
      const url = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = url
      a.download = 'org-chart.png'
      a.click()
    } catch {
      toast.error('Export failed — try again.')
    } finally {
      setZoom(prevZoom)
      setPan(prevPan)
      setIsExporting(false)
    }
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement
    if (target.closest('button, a, input, textarea, select, [role="button"]')) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragStartRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      pan,
    }
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragStartRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setPan({ x: drag.pan.x + event.clientX - drag.x, y: drag.pan.y + event.clientY - drag.y })
  }

  function handlePointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragStartRef.current
    if (drag?.pointerId !== event.pointerId) return
    dragStartRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return (
    <section className="space-y-3" aria-label="Org chart canvas">
      <OrgChartToolbar
        teams={chart.availableTeams}
        selectedTeamId={chart.selectedTeamId}
        isCompact={isCompact}
        isExporting={isExporting}
        onTeamChange={chart.setSelectedTeamId}
        onCompactToggle={() => setIsCompact((prev) => !prev)}
        onExport={handleExport}
      />

      <div
        className="relative min-h-content-lg overflow-hidden rounded-xl border border-sidebar-border bg-overlay/2 p-4"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        <div
          ref={canvasRef}
          className="flex min-h-content-lg items-center justify-center pt-10"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center',
          }}
        >
          <OrgChartCanvasContent
            chart={chart}
            rootNodes={rootNodes}
            compact={isCompact}
            onResetView={resetView}
            onViewProfile={(id) => router.push(`/profile/${id}`)}
          />
        </div>

        <OrgChartZoomControls
          zoom={zoom}
          canZoomIn={zoom < MAX_ZOOM}
          canZoomOut={zoom > MIN_ZOOM}
          onZoomIn={() => zoomBy(ZOOM_STEP)}
          onZoomOut={() => zoomBy(-ZOOM_STEP)}
          onReset={resetView}
        />
      </div>
    </section>
  )
}

type OrgChartCanvasContentProps = {
  chart: ReturnType<typeof useOrgChart>
  rootNodes: OrgChartNode[]
  compact: boolean
  onResetView: () => void
  onViewProfile: (employmentId: string) => void
}

function OrgChartCanvasContent({
  chart,
  rootNodes,
  compact,
  onResetView,
  onViewProfile,
}: OrgChartCanvasContentProps) {
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
          compact={compact}
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
