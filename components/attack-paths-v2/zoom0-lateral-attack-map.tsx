"use client"

/**
 * Zoom0 Lateral — attacker-lens map.
 *
 * On-path spine (breach compute → identity → this CJ) + lateral-moves fan-out.
 * No SG/NACL/IGW furniture. Pure DTO render — no FE graph invention.
 */

import { pathVerdictFromServerFeasibility } from "@/lib/attack-paths/server-path-verdict"
import type { ConvergencePath } from "@/lib/attack-paths/convergence-types"
import { lateralBreachLabel } from "@/lib/attack-paths/zoom0-lateral-identity"
import type {
  LateralMove,
  LateralMoveRisk,
  LateralMovesPayload,
} from "./use-lateral-moves"

const RISK_RING: Record<LateralMoveRisk, string> = {
  REAL_DAMAGE: "border-red-500/50 bg-red-500/10 text-red-800 dark:text-red-200",
  CAPABILITY: "border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200",
  PIVOT: "border-orange-500/50 bg-orange-500/10 text-orange-900 dark:text-orange-200",
  CONTAINED: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
  UNKNOWN: "border-border bg-muted/40 text-muted-foreground",
}

const TYPE_LABEL: Record<string, string> = {
  shared_role: "Shared role",
  additional_jewel: "Other jewel",
  assume_role: "AssumeRole",
  pass_role: "PassRole",
  ssm_execution: "SSM",
  network_lateral: "Network",
}

function shortTarget(target: string): string {
  if (!target) return "target"
  const m = /[:/]([^:/]+)$/.exec(target)
  return m
    ? m[1]
    : target.length > 36
      ? `${target.slice(0, 16)}…${target.slice(-12)}`
      : target
}

function NodeCard({
  eyebrow,
  title,
  subtitle,
  tone = "default",
  testId,
}: {
  eyebrow: string
  title: string
  subtitle?: string | null
  tone?: "default" | "hub" | "jewel" | "lateral"
  testId?: string
}) {
  const toneCls =
    tone === "hub"
      ? "border-amber-500/40 bg-amber-500/10"
      : tone === "jewel"
        ? "border-orange-500/40 bg-orange-500/10"
        : tone === "lateral"
          ? "border-border bg-card"
          : "border-border bg-muted/30"
  return (
    <div
      data-testid={testId}
      className={`rounded-lg border px-3 py-2.5 shadow-sm ${toneCls}`}
    >
      <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
        {eyebrow}
      </div>
      <div className="mt-0.5 truncate font-mono text-[12px] font-medium text-foreground">
        {title}
      </div>
      {subtitle ? (
        <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
          {subtitle}
        </div>
      ) : null}
    </div>
  )
}

export function Zoom0LateralAttackMap({
  path,
  jewelName,
  identityId,
  identityName,
  moves,
  autoPinned,
  onFocusJewel,
}: {
  path: ConvergencePath
  jewelName: string
  identityId: string
  identityName: string | null
  moves: LateralMovesPayload | null
  autoPinned: boolean
  onFocusJewel?: (jewelId: string) => void
}) {
  const breach = lateralBreachLabel(path)
  const roleLabel = identityName || shortTarget(identityId)
  const verdict = pathVerdictFromServerFeasibility(
    path.feasibility as Record<string, unknown> | null | undefined,
  )
  const blast = moves?.highest_blast
  const lateralMoves = (moves?.moves ?? []).filter(
    (m) => m.type !== "network_lateral",
  )

  return (
    <div
      className="flex h-full min-h-[420px] flex-col gap-3 rounded-xl border border-border bg-background/80 p-4"
      data-testid="zoom0-lateral-attack-map"
      data-auto-pinned={autoPinned ? "true" : "false"}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold text-foreground">
            Attacker lens · from {breach} via {roleLabel}
          </div>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            On-path access to this jewel, then what else this identity can
            leverage. No network furniture — that stays on Current Access.
          </p>
        </div>
        {verdict ? (
          <div
            className="rounded-md border border-border bg-muted/40 px-2 py-1 font-mono text-[10px]"
            data-testid="zoom0-lateral-spine-feasibility"
            data-path-state={verdict.pathState}
            data-activity-state={verdict.activityState}
          >
            On-path · {verdict.pathState} · {verdict.activityState}
          </div>
        ) : (
          <div
            className="rounded-md border border-dashed border-border px-2 py-1 text-[10px] text-muted-foreground"
            data-testid="zoom0-lateral-spine-feasibility-unavailable"
          >
            On-path feasibility unavailable
          </div>
        )}
      </div>

      {blast ? (
        <div
          className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px]"
          data-testid="zoom0-lateral-map-highest-blast"
        >
          <span className="font-medium text-foreground">Highest blast: </span>
          <span className="font-mono">
            {TYPE_LABEL[blast.type || ""] || blast.type} →{" "}
            {shortTarget(String(blast.target || ""))}
          </span>
          {blast.mitigation_hint ? (
            <span className="text-muted-foreground">
              {" "}
              · {blast.mitigation_hint}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-3 md:gap-3">
        {/* Col 1 — breach */}
        <div className="flex flex-col justify-center gap-2">
          <NodeCard
            eyebrow="Initial breach"
            title={breach}
            subtitle={path.source_kind || path.workload_arn || null}
            testId="zoom0-lateral-breach-node"
          />
        </div>

        {/* Col 2 — hub */}
        <div className="flex flex-col justify-center gap-2">
          <div className="hidden text-center text-[10px] text-muted-foreground md:block">
            on-path →
          </div>
          <NodeCard
            eyebrow="Compromised identity"
            title={roleLabel}
            subtitle={identityId}
            tone="hub"
            testId="zoom0-lateral-identity-node"
          />
          <div className="hidden text-center text-[10px] text-muted-foreground md:block">
            ← lateral blast
          </div>
        </div>

        {/* Col 3 — this CJ + orbit */}
        <div className="flex flex-col gap-2">
          <NodeCard
            eyebrow="This crown jewel · on-path"
            title={jewelName}
            tone="jewel"
            testId="zoom0-lateral-cj-node"
          />

          {moves?.error === "lateral_moves_timeout" ||
          moves?.degraded?.includes("overall_timeout") ? (
            <p
              className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-900 dark:text-amber-200"
              data-empty-state="TIMEOUT"
            >
              Pivots unknown, not absent — lateral fan-out timed out.
            </p>
          ) : lateralMoves.length === 0 && moves && !moves.error ? (
            <p
              className="rounded-md border border-dashed border-border px-2 py-1.5 text-[10px] text-muted-foreground"
              data-empty-state="READY_ZERO"
            >
              No lateral pivots beyond this jewel.
            </p>
          ) : null}

          <ul className="space-y-1.5" data-testid="zoom0-lateral-orbit">
            {lateralMoves.map((m: LateralMove) => {
              const risk = (m.risk || "UNKNOWN") as LateralMoveRisk
              const focusable =
                m.type === "additional_jewel" &&
                typeof m.target === "string" &&
                onFocusJewel
              return (
                <li key={`${m.type}-${m.target}`}>
                  <button
                    type="button"
                    disabled={!focusable}
                    onClick={() => {
                      if (focusable) onFocusJewel!(m.target)
                    }}
                    className={`w-full rounded-md border px-2 py-1.5 text-left ${RISK_RING[risk] || RISK_RING.UNKNOWN} ${
                      focusable ? "hover:opacity-90" : "cursor-default"
                    }`}
                    data-lateral-type={m.type}
                    data-lateral-risk={risk}
                    data-lateral-evidence={m.evidence}
                  >
                    <div className="text-[9px] font-semibold uppercase tracking-wider opacity-80">
                      {TYPE_LABEL[m.type] || m.type} · {m.evidence}
                    </div>
                    <div className="truncate font-mono text-[11px]">
                      {shortTarget(m.target)}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}
