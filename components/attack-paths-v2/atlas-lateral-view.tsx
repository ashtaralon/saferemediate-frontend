"use client"

import { Crosshair, ShieldCheck } from "lucide-react"
import {
  AtlasLateralChainCanvas,
  AtlasLateralLensPanel,
} from "./atlas-lateral-lens"
import { useAtlasLateral } from "./use-atlas-lateral"

/** Jewel-scoped attacker simulation.
 *
 * The operator chooses the service where the attacker first lands. That
 * service does not need observed access to the jewel. ATLAS then enumerates
 * and replay-validates the cross-plane moves that can reach the jewel.
 */
export function AtlasLateralView({
  systemName,
  jewelId,
  jewelName,
}: {
  systemName: string
  jewelId: string
  jewelName: string
}) {
  const atlas = useAtlasLateral({
    systemName,
    jewelRef: jewelId,
    enabled: true,
  })

  return (
    <div className="min-h-full bg-muted/20 p-6" data-testid="atlas-lateral-view">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Crosshair className="h-4 w-4 text-amber-600" />
            Lateral movement · attacker simulation
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            Choose the initial service the attacker compromises. Cyntro tests
            how that foothold can steal or assume identity, pivot across
            services, and reach {jewelName}—including services that have never
            legitimately accessed this crown jewel.
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
          <ShieldCheck className="h-3 w-3" /> Replay validated
        </div>
      </div>

      <AtlasLateralLensPanel
        candidates={atlas.candidates}
        selectedFootholdId={atlas.selectedFootholdId}
        selectedFoothold={atlas.selectedFoothold}
        response={atlas.response}
        evaluation={atlas.evaluation}
        candidatesLoading={atlas.candidatesLoading}
        simulationLoading={atlas.simulationLoading}
        error={atlas.error}
        onSelectFoothold={atlas.selectFoothold}
        onRetry={atlas.retry}
      />

      <div className="mt-4 min-h-[440px] overflow-hidden rounded-xl border border-border bg-background shadow-sm">
        <AtlasLateralChainCanvas
          selectedFoothold={atlas.selectedFoothold}
          response={atlas.response}
          loading={atlas.simulationLoading || atlas.candidatesLoading}
          jewelName={jewelName}
          evaluation={atlas.evaluation}
          recommendedFoothold={atlas.candidates.find((candidate) => candidate.atlas_evaluation?.state === "REACHABLE") ?? null}
          onSelectFoothold={atlas.selectFoothold}
        />
      </div>
    </div>
  )
}
