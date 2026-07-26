"use client"

/**
 * Zoom0 Lateral lens — fan-out from the server-ranked path identity
 * (risk_summary.identity), not IAP path identity-tier nodes.
 */

import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { ArrowUpRight, Loader2, Sliders } from "lucide-react"
import type { CrownJewelSummary } from "@/components/identity-attack-paths/types"
import {
  useLateralMoves,
  type LateralMove,
  type LateralMoveRisk,
} from "./use-lateral-moves"
import { focusJewelIdFromMove } from "./lateral-moves-summary-card"

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

function shortJewelLabel(target: string): string {
  if (!target) return "jewel"
  const m = /[:/]([^:/]+)$/.exec(target)
  return m
    ? m[1]
    : target.length > 40
      ? `${target.slice(0, 18)}…${target.slice(-14)}`
      : target
}

export function Zoom0LateralLensPanel({
  systemName,
  jewel,
  identityId,
  identityName,
}: {
  systemName: string
  jewel: CrownJewelSummary
  identityId: string
  identityName?: string | null
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const jewelId =
    jewel.canonical_id ?? (jewel.id.startsWith("arn:") ? jewel.id : null) ?? null

  const { data, loading, error } = useLateralMoves({
    systemName,
    identityId,
    jewelId,
  })

  const focusJewel = (nextJewelId: string) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "")
    params.set("jewel", nextJewelId)
    params.delete("path")
    params.delete("exfil_path")
    params.delete("mode")
    if (!params.get("system") && systemName) params.set("system", systemName)
    router.push(`${pathname}?${params.toString()}`)
  }

  const label = identityName || identityId
  const moves = data?.moves ?? []
  const jewelMoves = moves.filter((m) => m.type === "additional_jewel")
  const otherMoves = moves.filter((m) => m.type !== "additional_jewel")
  const blast = data?.highest_blast

  return (
    <div
      className="rounded-lg border border-amber-200/60 bg-amber-50/40 px-3 py-2.5 dark:border-amber-500/30 dark:bg-amber-500/10"
      data-testid="zoom0-lateral-lens"
    >
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300">
        <Sliders className="h-3.5 w-3.5" />
        Lateral — blast from {label}
      </div>

      {loading && !data ? (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading lateral moves…
        </p>
      ) : error && !data ? (
        <p className="mt-2 text-[11px] text-amber-800 dark:text-amber-200">
          {error}
        </p>
      ) : moves.length === 0 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          No lateral pivots from this identity beyond the current jewel.
        </p>
      ) : (
        <>
          {blast ? (
            <p
              className="mt-2 text-[11px] text-foreground"
              data-testid="zoom0-lateral-highest-blast"
            >
              Highest blast:{" "}
              <span className="font-medium">
                {MOVE_TYPE_LABEL[blast.type || ""] || blast.type} →{" "}
                {shortJewelLabel(String(blast.target || ""))}
              </span>
              {blast.mitigation_hint ? (
                <span className="text-muted-foreground">
                  {" "}
                  · {blast.mitigation_hint}
                </span>
              ) : null}
            </p>
          ) : null}

          {jewelMoves.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {jewelMoves.map((m: LateralMove) => {
                const focusId = focusJewelIdFromMove(m)
                return (
                  <li
                    key={`${m.type}-${m.target}`}
                    className="flex flex-wrap items-center gap-2 text-[11px]"
                  >
                    <span
                      className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${RISK_TONE[m.risk] || RISK_TONE.UNKNOWN}`}
                    >
                      {m.risk}
                    </span>
                    <span className="font-mono text-foreground">
                      {shortJewelLabel(m.target)}
                    </span>
                    <span className="text-muted-foreground">{m.evidence}</span>
                    {focusId ? (
                      <button
                        type="button"
                        onClick={() => focusJewel(focusId)}
                        className="inline-flex items-center gap-0.5 text-amber-800 underline-offset-2 hover:underline dark:text-amber-200"
                      >
                        Focus
                        <ArrowUpRight className="h-3 w-3" />
                      </button>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          ) : null}

          {otherMoves.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {otherMoves.slice(0, 4).map((m) => (
                <li
                  key={`${m.type}-${m.target}`}
                  className="flex flex-wrap items-baseline gap-x-2 text-[11px] font-mono"
                >
                  <span className="text-foreground">
                    {MOVE_TYPE_LABEL[m.type] || m.type}
                  </span>
                  <span className="truncate text-muted-foreground">
                    {shortJewelLabel(m.target)}
                  </span>
                  <span className="text-muted-foreground">{m.evidence}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {Array.isArray(data?.degraded) && data!.degraded!.length > 0 ? (
            <p className="mt-2 text-[10px] text-muted-foreground">
              Partial: {data!.degraded!.join(", ")}
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}
