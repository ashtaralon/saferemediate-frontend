"use client"

/**
 * Zoom −1 — system blast-radius landing (PRD S4).
 * Job: which system / jewel cluster is most exposed?
 * Pick a jewel on the left → Zoom 0 fan-in.
 */

import { BlastRadiusMap } from "./blast-radius-map"

export function ZoomMinus1Landing({ systemName }: { systemName: string }) {
  return (
    <div className="flex flex-col h-full min-h-0" data-testid="zoom-minus1-landing">
      <div className="px-6 py-4 border-b border-border bg-background/95">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
          System blast radius
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5 max-w-2xl">
          Damage-first view of this business system. Select a crown jewel on the left
          to open jewel fan-in (Zoom 0), then a path for investigation and the cut card
          (Zoom 1).
        </p>
      </div>
      <div className="flex-1 overflow-y-auto">
        <BlastRadiusMap systemName={systemName} />
      </div>
    </div>
  )
}
