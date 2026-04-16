"use client"

import React, { useMemo, useState } from "react"
import {
  Eye,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  Minus,
  Zap,
  Lock,
  ChevronDown,
  ChevronRight,
} from "lucide-react"
import type {
  IdentityAttackPath,
  PathNodeDetail,
  RiskReductionAction,
  RemediationStatus,
  RemediationPreview,
  RemediationResult,
  SeverityFactor,
} from "./types"
import { FACTOR_LABELS } from "./types"

// Match palette in path-score-hero.tsx
const FACTOR_COLORS: Record<SeverityFactor, string> = {
  impact: "#f87171",
  internet_exposure: "#fb923c",
  permission_breadth: "#f59e0b",
  data_sensitivity: "#a78bfa",
  identity_chain: "#ec4899",
  network_controls: "#60a5fa",
}

interface PathRemediationPlanProps {
  path: IdentityAttackPath
  activeNodeId: string | null
  remediationStatus: RemediationStatus
  remediationPreview: RemediationPreview | null
  remediationResult: RemediationResult | null
  onRemediate: (nodeId: string, dryRun: boolean) => void
  onRollback: (snapshotId: string, nodeId: string) => Promise<void>
  onCancel: () => void
  /** If true, the parent says this path is in the "Safe" tab — render the hardened banner */
  isSafe?: boolean
}

// ── Humanize preview content per node type ─────────────────────
function previewSummary(preview: RemediationPreview | null, node: PathNodeDetail): string {
  if (!preview) return "Loading preview…"
  if (preview.preview_message) return preview.preview_message
  if (preview.unused_permissions != null) {
    return `Will remove ${preview.unused_permissions} unused permissions from ${node.name}.`
  }
  return `Preview for ${node.name}`
}

// ── Single row ─────────────────────────────────────────────────
interface RowProps {
  node: PathNodeDetail
  action: RiskReductionAction | null
  currentScore: number
  isActive: boolean
  status: RemediationStatus
  preview: RemediationPreview | null
  result: RemediationResult | null
  anotherActive: boolean
  onRemediate: (nodeId: string, dryRun: boolean) => void
  onRollback: (snapshotId: string, nodeId: string) => Promise<void>
  onCancel: () => void
}

function ActionRow({
  node,
  action,
  currentScore,
  isActive,
  status,
  preview,
  result,
  anotherActive,
  onRemediate,
  onRollback,
  onCancel,
}: RowProps) {
  const hasAction = !!action
  const isLocked = !!action?.not_remediable
  const isActionable = hasAction && !isLocked
  const impact = action?.impact ?? 0 // signed negative
  const afterScore = isActionable ? Math.max(0, currentScore + impact) : currentScore
  const dominantFactor = action?.dominant_factor as SeverityFactor | null | undefined
  const factorColor = dominantFactor ? FACTOR_COLORS[dominantFactor] : "#64748b"
  const factorLabel = dominantFactor ? FACTOR_LABELS[dominantFactor] : null
  const factorDelta = dominantFactor && action?.delta_by_factor?.[dominantFactor]
  const lockedReason = action?.not_remediable_reason ?? "Managed externally — cannot be modified"

  // ── State-derived background ──
  const baseBg = isActive
    ? "rgba(30, 41, 59, 0.75)"
    : isActionable
    ? "rgba(15, 23, 42, 0.55)"
    : isLocked
    ? "rgba(30, 24, 15, 0.5)" // warm-amber tint for locked
    : "rgba(15, 23, 42, 0.3)"

  // ── Rollback handler wiring ──
  const snapshotId =
    isActive && status === "success" && result?.snapshot_id
      ? result.snapshot_id
      : null

  return (
    <div
      className="rounded-lg border transition-all"
      style={{
        background: baseBg,
        borderColor: isActive
          ? `${factorColor}55`
          : isActionable
          ? "rgba(148,163,184,0.15)"
          : isLocked
          ? "rgba(245, 158, 11, 0.25)"
          : "rgba(148,163,184,0.08)",
      }}
    >
      {/* ── Header row (always visible) ── */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* Icon slot */}
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
          style={{
            background: isActionable
              ? `${factorColor}22`
              : isLocked
              ? "rgba(245, 158, 11, 0.12)"
              : "rgba(148,163,184,0.08)",
            border: `1px solid ${
              isActionable
                ? `${factorColor}44`
                : isLocked
                ? "rgba(245, 158, 11, 0.3)"
                : "rgba(148,163,184,0.15)"
            }`,
          }}
        >
          {status === "success" && isActive ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          ) : status === "error" && isActive ? (
            <XCircle className="w-3.5 h-3.5 text-red-400" />
          ) : isLocked ? (
            <Lock className="w-3.5 h-3.5 text-amber-400" />
          ) : isActionable ? (
            <Zap className="w-3.5 h-3.5" style={{ color: factorColor }} />
          ) : (
            <Minus className="w-3.5 h-3.5 text-slate-500" />
          )}
        </div>

        {/* Left info block */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold text-slate-100 truncate">
              {node.name}
            </span>
            <span className="text-[9px] text-slate-400 uppercase tracking-wider shrink-0">
              {node.type}
            </span>
          </div>
          <div
            className={`text-[10px] mt-0.5 truncate ${
              isLocked ? "text-amber-200/80" : "text-slate-400"
            }`}
            title={isLocked ? lockedReason : undefined}
          >
            {isLocked
              ? lockedReason
              : hasAction
              ? action!.action
              : node.tier === "entry"
              ? "Entry point — cannot remediate"
              : node.tier === "crown_jewel"
              ? "Protected asset — reduce upstream risk"
              : "No fix needed"}
          </div>
        </div>

        {/* Score projection — only for actionable rows */}
        {isActionable && (
          <div className="flex items-center gap-1.5 shrink-0 px-2 py-1 rounded-md bg-slate-800/50 border border-slate-700/50">
            <span className="text-[10px] font-mono text-amber-400">
              {currentScore}
            </span>
            <TrendingDown className="w-3 h-3 text-emerald-400" />
            <span className="text-[10px] font-mono font-bold text-emerald-400">
              {afterScore}
            </span>
            <span className="text-[9px] text-slate-400 ml-1">
              ({impact})
            </span>
          </div>
        )}

        {/* Locked: clarify that no remediation is possible. The scoring engine
            also discounts SLRs' over-provisioning contribution, so the user
            isn't seeing a number they can't move. */}
        {isLocked && (
          <div
            className="flex items-center gap-1 shrink-0 px-2 py-1 rounded-md"
            style={{
              background: "rgba(245, 158, 11, 0.08)",
              border: "1px solid rgba(245, 158, 11, 0.2)",
            }}
            title="AWS-managed — permission over-provisioning is discounted from the path score (the defender cannot act on it), and Preview is disabled."
          >
            <span className="text-[9px] text-amber-400/80 uppercase tracking-wider font-semibold">
              Discounted from score
            </span>
          </div>
        )}

        {/* Dominant factor chip */}
        {isActionable && factorLabel && (
          <div
            className="shrink-0 px-1.5 py-0.5 rounded"
            style={{
              background: `${factorColor}1A`,
              border: `1px solid ${factorColor}33`,
            }}
            title={
              factorDelta != null
                ? `${factorLabel}: ${factorDelta > 0 ? "+" : ""}${factorDelta}`
                : factorLabel
            }
          >
            <span
              className="text-[9px] font-semibold uppercase tracking-wider"
              style={{ color: factorColor }}
            >
              {factorLabel}
            </span>
          </div>
        )}

        {/* Action buttons (state-dependent) */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Locked — AWS-managed badge + disabled Preview */}
          {isLocked && (
            <>
              <span
                className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{
                  color: "#fbbf24",
                  background: "rgba(245, 158, 11, 0.1)",
                  border: "1px solid rgba(245, 158, 11, 0.3)",
                }}
                title={lockedReason}
              >
                AWS-managed
              </span>
              <button
                disabled
                title={lockedReason}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-slate-700/20 text-slate-500 border border-slate-700/30 cursor-not-allowed"
              >
                <Lock className="w-3 h-3" />
                Locked
              </button>
            </>
          )}

          {/* Idle / actionable */}
          {!isActive && isActionable && (
            <button
              onClick={() => onRemediate(node.id, true)}
              disabled={anotherActive}
              title={
                anotherActive
                  ? "Another action is in preview — cancel it first"
                  : "Preview changes"
              }
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-blue-600/15 text-blue-300 border border-blue-500/30 hover:bg-blue-600/25 hover:border-blue-500/50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <Eye className="w-3 h-3" />
              Preview
            </button>
          )}

          {!hasAction && (
            <button
              disabled
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-slate-700/20 text-slate-500 border border-slate-700/30 cursor-not-allowed"
            >
              No fix
            </button>
          )}

          {/* Previewing */}
          {isActive && status === "previewing" && (
            <div className="flex items-center gap-1.5 px-2 py-1">
              <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
              <span className="text-[10px] text-blue-300">Analyzing…</span>
            </div>
          )}

          {/* Confirming — expand to show preview + actions (buttons appear in the expanded panel) */}
          {isActive && status === "confirming" && (
            <button
              onClick={onCancel}
              className="px-2 py-1 rounded-md text-[10px] text-slate-400 hover:text-white hover:bg-slate-700/50 transition-all"
            >
              Cancel
            </button>
          )}

          {/* Executing */}
          {isActive && status === "executing" && (
            <div className="flex items-center gap-1.5 px-2 py-1">
              <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
              <span className="text-[10px] text-amber-300">Executing…</span>
            </div>
          )}

          {/* Success — show rollback */}
          {isActive && status === "success" && snapshotId && (
            <button
              onClick={() => onRollback(snapshotId, node.id)}
              title={`Rollback using snapshot ${snapshotId}`}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-slate-700/40 text-slate-200 border border-slate-600/50 hover:bg-slate-600/50 transition-all"
            >
              <RotateCcw className="w-3 h-3" />
              Rollback
            </button>
          )}

          {/* Success without snapshot */}
          {isActive && status === "success" && !snapshotId && (
            <span className="text-[10px] text-emerald-300 px-2 py-1">✓ Done</span>
          )}

          {/* Error — show retry */}
          {isActive && status === "error" && (
            <button
              onClick={() => onRemediate(node.id, true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-slate-700/40 text-slate-200 border border-slate-600/50 hover:bg-slate-600/50 transition-all"
            >
              <RotateCcw className="w-3 h-3" />
              Retry
            </button>
          )}
        </div>
      </div>

      {/* ── Expanded preview/confirm panel ── */}
      {isActive && status === "confirming" && preview && (
        <div
          className="mx-3 mb-2.5 p-2.5 rounded-md"
          style={{
            background: "rgba(245, 158, 11, 0.08)",
            border: "1px solid rgba(245, 158, 11, 0.25)",
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1">
                <ShieldAlert className="w-3 h-3 text-amber-400" />
                <span className="text-[10px] font-semibold text-amber-300 uppercase tracking-wider">
                  Preview
                </span>
                {preview.total_permissions != null && preview.unused_permissions != null && (
                  <span className="text-[9px] text-slate-400">
                    · total {preview.total_permissions} · used{" "}
                    {preview.used_permissions ?? 0} · unused {preview.unused_permissions}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-200 leading-snug">
                {previewSummary(preview, node)}
              </p>
              <p className="text-[9px] text-slate-400 mt-1">
                Snapshot will be created automatically — rollback available after execution.
              </p>
            </div>
            <button
              onClick={() => onRemediate(node.id, false)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold bg-red-600/80 text-white hover:bg-red-600 transition-all shrink-0"
            >
              <Play className="w-3 h-3" />
              Remediate
            </button>
          </div>
        </div>
      )}

      {/* ── Success detail ── */}
      {isActive && status === "success" && result && (
        <div
          className="mx-3 mb-2.5 p-2.5 rounded-md"
          style={{
            background: "rgba(16, 185, 129, 0.08)",
            border: "1px solid rgba(16, 185, 129, 0.25)",
          }}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span className="text-[11px] text-slate-100">{result.message}</span>
            {result.permissions_removed != null && (
              <span className="text-[10px] text-emerald-300">
                ({result.permissions_removed} perms removed)
              </span>
            )}
          </div>
          {result.snapshot_id && (
            <p className="text-[9px] text-slate-400 mt-1 font-mono">
              snapshot {result.snapshot_id}
            </p>
          )}
        </div>
      )}

      {/* ── Error detail ── */}
      {isActive && status === "error" && result && (
        <div
          className="mx-3 mb-2.5 p-2.5 rounded-md"
          style={{
            background: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.25)",
          }}
        >
          <div className="flex items-center gap-2">
            <XCircle className="w-3 h-3 text-red-400" />
            <span className="text-[11px] font-semibold text-red-300">
              {result.blocked ? "Blocked by safety gate" : "Failed"}
            </span>
          </div>
          <p className="text-[10px] text-slate-300 mt-1">
            {result.block_reason ?? result.message}
          </p>
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────
export function PathRemediationPlan({
  path,
  activeNodeId,
  remediationStatus,
  remediationPreview,
  remediationResult,
  onRemediate,
  onRollback,
  onCancel,
  isSafe = false,
}: PathRemediationPlanProps) {
  const currentScore = path.severity?.overall_score ?? 0

  // Build node_name → top_action map
  const actionByName = useMemo(() => {
    const map = new Map<string, RiskReductionAction>()
    for (const a of path.risk_reduction?.top_actions ?? []) {
      if (a.node_name) map.set(a.node_name.toLowerCase(), a)
    }
    return map
  }, [path.risk_reduction?.top_actions])

  // Rows: every node in the path, skip entries that are external/pseudo
  const rows = useMemo(() => {
    const nodes = path.nodes ?? []
    return nodes
      .filter((n) => !!n.id && !!n.name)
      .map((node) => ({
        node,
        action: actionByName.get(node.name.toLowerCase()) ?? null,
      }))
  }, [path.nodes, actionByName])

  const [showPassive, setShowPassive] = useState(false)

  if (rows.length === 0) return null

  // Visible rows include both truly actionable and "locked" (e.g. AWS-managed)
  // — the user wants to see the locked nodes so they understand what the path
  // actually contains. Passive rows (no action at all) stay collapsed.
  const visibleRows = rows.filter((r) => r.action) // has any action record
  const passiveRows = rows.filter((r) => !r.action)
  const actionableRows = visibleRows.filter((r) => !r.action?.not_remediable)
  const lockedRows = visibleRows.filter((r) => r.action?.not_remediable)
  const actionableCount = actionableRows.length
  const lockedCount = lockedRows.length
  const passiveCount = passiveRows.length
  const anotherActive = activeNodeId !== null && remediationStatus !== "idle"
  // Only truly hardened when there are no actionable AND no locked (locked
  // nodes still represent a non-remediable hop on the path, not "safe").
  const hardened = isSafe || (actionableCount === 0 && lockedCount === 0)

  return (
    <div
      className="px-4 py-3 border-b"
      style={{
        background: hardened
          ? "rgba(6, 22, 16, 0.6)"
          : "rgba(10, 16, 30, 0.6)",
        borderColor: hardened
          ? "rgba(16, 185, 129, 0.2)"
          : "rgba(148, 163, 184, 0.1)",
      }}
    >
      {hardened ? (
        <div
          className="flex items-center gap-3 p-3 rounded-lg"
          style={{
            background: "rgba(16, 185, 129, 0.08)",
            border: "1px solid rgba(16, 185, 129, 0.25)",
          }}
        >
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-semibold text-emerald-200">
              Path is hardened — no action needed
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              The scoring engine found no remediation that would reduce this path's score further.
              Keep monitoring — new findings can move it back to At Risk.
            </div>
          </div>
          <div className="text-[10px] text-slate-400 shrink-0">
            {rows.length} service{rows.length === 1 ? "" : "s"} on path
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-2.5">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[11px] font-semibold text-slate-100 uppercase tracking-wider">
              Remediation Plan
            </span>
            <span className="text-[10px] text-slate-400">
              · {actionableCount} actionable
              {lockedCount > 0 && (
                <>
                  {" · "}
                  <span className="text-amber-300/80">{lockedCount} locked</span>
                </>
              )}
            </span>
          </div>

          <div className="space-y-1.5">
            {visibleRows.map(({ node, action }) => {
              const isActive = activeNodeId === node.id
              return (
                <ActionRow
                  key={node.id}
                  node={node}
                  action={action}
                  currentScore={currentScore}
                  isActive={isActive}
                  status={isActive ? remediationStatus : "idle"}
                  preview={isActive ? remediationPreview : null}
                  result={isActive ? remediationResult : null}
                  anotherActive={!isActive && anotherActive}
                  onRemediate={onRemediate}
                  onRollback={onRollback}
                  onCancel={onCancel}
                />
              )
            })}
          </div>

          {/* Collapsed passive-nodes footer — only shown when there are any */}
          {passiveCount > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setShowPassive((v) => !v)}
                className="flex items-center gap-1.5 text-[10px] text-slate-400 hover:text-slate-200 transition-colors"
              >
                {showPassive ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
                <span>
                  {showPassive ? "Hide" : "Show"} {passiveCount} passive service
                  {passiveCount === 1 ? "" : "s"} on path
                </span>
                <span className="text-slate-500">
                  · no score-reducing fix available
                </span>
              </button>

              {showPassive && (
                <div className="mt-2 space-y-1.5">
                  {passiveRows.map(({ node, action }) => {
                    const isActive = activeNodeId === node.id
                    return (
                      <ActionRow
                        key={node.id}
                        node={node}
                        action={action}
                        currentScore={currentScore}
                        isActive={isActive}
                        status={isActive ? remediationStatus : "idle"}
                        preview={isActive ? remediationPreview : null}
                        result={isActive ? remediationResult : null}
                        anotherActive={!isActive && anotherActive}
                        onRemediate={onRemediate}
                        onRollback={onRollback}
                        onCancel={onCancel}
                      />
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
