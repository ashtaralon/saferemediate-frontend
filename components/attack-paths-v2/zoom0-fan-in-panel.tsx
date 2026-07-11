"use client"

/**
 * Zoom 0 right column — jewel fan-in when a CJ is selected but no path yet.
 * PRD-attacker-lens-three-zoom S1: all paths converge on the jewel; pick a
 * row on the left to enter Zoom 1.
 */

import { ConvergenceMapLoader } from "./convergence-map-loader"
import type { CrownJewelSummary, IdentityAttackPath } from "@/components/identity-attack-paths/types"

export function Zoom0FanInPanel({
  systemName,
  jewel,
  paths,
  selectedPathId,
}: {
  systemName: string
  jewel: CrownJewelSummary
  paths: IdentityAttackPath[]
  selectedPathId: string | null
}) {
  const cjArn =
    jewel.canonical_id ?? (jewel.id.startsWith("arn:") ? jewel.id : null)

  return (
    <div className="flex flex-col h-full min-h-0" data-testid="zoom0-fan-in">
      <div className="px-6 py-3 border-b border-border bg-background/95">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
          Jewel fan-in
        </p>
        <p className="text-[12px] text-muted-foreground mt-0.5">
          Every initial-access path to{" "}
          <span className="font-mono text-foreground">{jewel.name}</span>
          {" "}({paths.length}). Sorted on the left by Reachable Damage Priority —
          pick a path to investigate.
        </p>
      </div>
      <div className="flex-1 min-h-0 overflow-auto px-4 py-3">
        <ConvergenceMapLoader
          systemName={systemName}
          cjArn={cjArn}
          cjName={jewel.name}
          initialSelectedPathId={selectedPathId}
          fallbackJewel={jewel}
          fallbackPaths={paths}
        />
      </div>
    </div>
  )
}
