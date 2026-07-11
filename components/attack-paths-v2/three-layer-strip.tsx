"use client"

/**
 * Zoom 1 three-layer strip — P / N / D simultaneous (PRD FR3 / FR8 order block 2).
 * Never three tabs. IAM-only paths show Network as N/A — standing access.
 */

import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"
import type { AttackPathReport, GateState } from "./attack-path-report-types"
import { classifyPathShape } from "./path-shape"
import { isNetworkGateNA } from "./attack-path-card-light"

export type LayerTone = "observed" | "config" | "closed" | "unknown" | "na"

export interface LayerChip {
  key: "P" | "N" | "D"
  label: string
  answer: string
  tone: LayerTone
}

function gateTone(g?: GateState | null): LayerTone {
  switch (g) {
    case "OPEN_OBSERVED":
      return "observed"
    case "OPEN_CONFIG":
      return "config"
    case "CLOSED":
    case "BLOCKED":
      return "closed"
    default:
      return "unknown"
  }
}

function gateAnswer(g?: GateState | null): string {
  switch (g) {
    case "OPEN_OBSERVED":
      return "observed"
    case "OPEN_CONFIG":
      return "config-open"
    case "CLOSED":
    case "BLOCKED":
      return "closed"
    default:
      return "unknown"
  }
}

/** Pure compiler for the Zoom 1 P/N/D strip — unit-tested. */
export function compileThreeLayerChips(
  report: AttackPathReport | null | undefined,
  path: IdentityAttackPath,
): LayerChip[] {
  const gates = report?.gates ?? {}
  const shape =
    report?.current_state?.shape ??
    classifyPathShape(path, report?.remediation_diff?.remove_actions ?? undefined).kind
  const networkIsNA = isNetworkGateNA(shape, gates.network)

  // Prefer report gates; fall back to materialized path gates when report is thin.
  const mp = path.materialized_path
  const identity = (gates.identity ?? mp?.identity_gate) as GateState | undefined
  const network = (gates.network ?? mp?.route_gate) as GateState | undefined
  const data = (gates.data_plane ?? mp?.data_plane_gate) as GateState | undefined

  return [
    {
      key: "P",
      label: "Permissions",
      answer: gateAnswer(identity),
      tone: gateTone(identity),
    },
    networkIsNA
      ? {
          key: "N",
          label: "Network",
          answer: "N/A — standing access",
          tone: "na",
        }
      : {
          key: "N",
          label: "Network",
          answer: gateAnswer(network),
          tone: gateTone(network),
        },
    {
      key: "D",
      label: "Data",
      answer: gateAnswer(data),
      tone: gateTone(data),
    },
  ]
}

const TONE_CLS: Record<LayerTone, string> = {
  observed: "border-red-500/35 bg-red-500/10 text-red-800 dark:text-red-200",
  config: "border-amber-500/35 bg-amber-500/10 text-amber-900 dark:text-amber-200",
  closed: "border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
  unknown: "border-border bg-muted/40 text-muted-foreground",
  na: "border-border bg-muted/20 text-muted-foreground",
}

export function ThreeLayerStrip({
  report,
  path,
}: {
  report: AttackPathReport | null | undefined
  path: IdentityAttackPath
}) {
  const chips = compileThreeLayerChips(report, path)
  if (!chips.some((c) => c.tone !== "unknown") && !report?.gates && !path.materialized_path) {
    return null
  }

  return (
    <div className="border-b border-border bg-background" data-testid="zoom1-three-layer-strip">
      <div className="px-6 pt-4 pb-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
          Permissions · Network · Data
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Observed vs config stay separate — never one blended risk score.
        </p>
      </div>
      <div className="px-6 pb-4 pt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
        {chips.map((c) => (
          <div
            key={c.key}
            className={`rounded-md border px-3 py-2.5 ${TONE_CLS[c.tone]}`}
            data-testid={`zoom1-layer-${c.key}`}
          >
            <div className="text-[10px] font-semibold uppercase tracking-wider opacity-80">
              {c.key} · {c.label}
            </div>
            <div className="text-[13px] font-semibold mt-1">{c.answer}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
