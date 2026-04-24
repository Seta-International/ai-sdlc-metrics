'use client'

import { Button } from '@future/ui'
import { Maximize2, Minus, Plus } from '@future/ui/icons'

export type OrgChartZoomControlsProps = {
  zoom: number
  canZoomIn: boolean
  canZoomOut: boolean
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
}

export function OrgChartZoomControls({
  zoom,
  canZoomIn,
  canZoomOut,
  onZoomIn,
  onZoomOut,
  onReset,
}: OrgChartZoomControlsProps) {
  return (
    <div className="absolute bottom-3.5 right-3.5 flex items-center gap-1 rounded-full border border-sidebar-border bg-background/80 px-2.5 py-1.5 backdrop-blur-sm">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onZoomOut}
        disabled={!canZoomOut}
        aria-label="Zoom out"
      >
        <Minus className="size-3.5" />
      </Button>
      <span className="w-10 text-center text-xs font-510 tabular-nums text-fg-muted">
        {Math.round(zoom * 100)}%
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onZoomIn}
        disabled={!canZoomIn}
        aria-label="Zoom in"
      >
        <Plus className="size-3.5" />
      </Button>
      <div className="mx-1 h-4 w-px bg-sidebar-border" />
      <Button type="button" variant="ghost" size="sm" onClick={onReset} aria-label="Reset view">
        <Maximize2 className="size-3.5" />
      </Button>
    </div>
  )
}
