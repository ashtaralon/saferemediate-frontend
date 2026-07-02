"use client"

import { useMemo } from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { ArrowUpRight } from "lucide-react"
import type { IdentityAttackPath, CrownJewelSummary } from "@/components/identity-attack-paths/types"
import { useLateralMoves, type LateralMoveRisk } from "./use-lateral-moves"

// "Attacker next moves" — compact fan-out summary for the identity on the
// current path, per docs/specs/attack_path_lateral_movement_v1.md. Lives
// between the Attack map and Supporting evidence sections: full ranked
// detail stays in the existing Lateral Movement tab (this is the
// PRD's "Attack Path tab = current path + compact lateral fan-out"
// / "Lateral Movement tab = full ranked lateral details" split.

const RISK_TONE: Record<LateralMoveRisk, string> = {
  REAL_DAMAGE: "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300",
  CAPABILITY: "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300",
  PIVOT: "bg-orange-500/10 border-orange-500/30 text-orange-700 dark:text-orange-300",
  CONTAINED: "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300",
  UNKNOWN: "bg-muted border-border text-muted-foreground",
}

const MOVE_TYPE_LABEL: Record<string, string> = {
  shared_role: "Shared role",
  additional_jewel: "Additional jewel",
  assume_role: "AssumeRole",
  pass_role: "PassRole",
  ssm_execution: "SSM execution",
  network_lateral: "Network reach",
}

function identityNodesOf(path: IdentityAttackPath) {
  return (path.nodes ?? []).filter((n) => n.tier === "identity")
}

export function LateralMovesSummaryCard({
  path,
  jewel,
  systemName,
}: {
  path: IdentityAttackPath
  jewel: CrownJewelSummary | null
  systemName: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const identity = useMemo(() => identityNodesOf(path)[0] ?? null, [path])
  const identityId = identity?.canonical_id || identity?.id || null
  const jewelId = jewel?.canonical_id ?? (jewel?.id?.startsWith("arn:") ? jewel.id : null) ?? null

  const { data, loading, error } = useLateralMoves(
    identityId ? { systemName, identityId, jewelId } : null,
  )

  if (!identityId) return null

  const goToLateralTab = () => {
    const params = new URLSearchParams(searchParams?.toString() ?? "")
    params.set("mode", "lateral")
    if (!params.get("system") && systemName) params.set("system", systemName)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="border-b border-border bg-background">
      <div className="px-6 pt-4 pb-1 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
            Attacker next moves
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            What else {identity?.name || identityId} can reach from here.
          </p>
        </div>
        <button
          type="button"
          onClick={goToLateralTab}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground shrink-0"
        >
          View full lateral movement
          <ArrowUpRight className="h-3 w-3" />
        </button>
      </div>

      <div className="px-6 pb-4 pt-2">
        {loading && (
          <p className="text-[12px] text-muted-foreground">Loading lateral moves…</p>
        )}
        {!loading && error && (
          <p className="text-[12px] text-muted-foreground">Lateral moves unavailable: {error}</p>
        )}
        {!loading && !error && data && data.moves.length === 0 && (
          <p className="text-[12px] text-muted-foreground">
            No lateral moves observed or configured from this identity today.
          </p>
        )}
        {!loading && !error && data && data.moves.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {data.moves.map((move, i) => (
              <div
                key={`${move.type}-${i}`}
                className={`rounded-md border px-2.5 py-1.5 text-[11px] ${RISK_TONE[move.risk] ?? RISK_TONE.UNKNOWN}`}
              >
                <span className="font-semibold">{MOVE_TYPE_LABEL[move.type] ?? move.type}</span>
                <span className="mx-1 opacity-60">·</span>
                <span>{move.target}</span>
                <span className="mx-1 opacity-60">·</span>
                <span className="opacity-75">{move.evidence}</span>
              </div>
            ))}
            {data.total_moves > data.moves.length && (
              <button
                type="button"
                onClick={goToLateralTab}
                className="rounded-md border border-dashed border-border px-2.5 py-1.5 text-[11px] text-muted-foreground hover:text-foreground"
              >
                +{data.total_moves - data.moves.length} more
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
