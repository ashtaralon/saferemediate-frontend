"use client"

import { AlertTriangle, Shield, Target, Zap, TrendingDown } from "lucide-react"
import type { IdentityAttackPath, SeverityFactor } from "./types"
import { FACTOR_LABELS } from "./types"

interface PathScoreHeroProps {
  path: IdentityAttackPath
  pathIndex: number
  totalPaths: number
  onPrev?: () => void
  onNext?: () => void
}

// ── Severity → color mapping (matches SeverityBadge) ──────────────
const SEVERITY_THEME: Record<string, {
  bg: string
  border: string
  glow: string
  text: string
  label: string
  accent: string
}> = {
  CRITICAL: {
    bg: "linear-gradient(135deg, rgba(239,68,68,0.28) 0%, rgba(127,29,29,0.35) 100%)",
    border: "rgba(239,68,68,0.55)",
    glow: "0 0 60px rgba(239,68,68,0.35)",
    text: "#fecaca",
    accent: "#ef4444",
    label: "CRITICAL",
  },
  HIGH: {
    bg: "linear-gradient(135deg, rgba(249,115,22,0.22) 0%, rgba(120,53,15,0.28) 100%)",
    border: "rgba(249,115,22,0.5)",
    glow: "0 0 50px rgba(249,115,22,0.28)",
    text: "#fed7aa",
    accent: "#f97316",
    label: "HIGH",
  },
  MEDIUM: {
    bg: "linear-gradient(135deg, rgba(245,158,11,0.18) 0%, rgba(120,53,15,0.22) 100%)",
    border: "rgba(245,158,11,0.45)",
    glow: "0 0 40px rgba(245,158,11,0.22)",
    text: "#fde68a",
    accent: "#f59e0b",
    label: "MEDIUM",
  },
  LOW: {
    bg: "linear-gradient(135deg, rgba(59,130,246,0.15) 0%, rgba(30,58,138,0.2) 100%)",
    border: "rgba(59,130,246,0.4)",
    glow: "0 0 30px rgba(59,130,246,0.18)",
    text: "#bfdbfe",
    accent: "#3b82f6",
    label: "LOW",
  },
}

// ── Factor → color (same as node-detail-panel for visual consistency) ──
const FACTOR_COLORS: Record<SeverityFactor, string> = {
  impact: "#f87171",
  internet_exposure: "#fb923c",
  permission_breadth: "#f59e0b",
  data_sensitivity: "#a78bfa",
  identity_chain: "#ec4899",
  network_controls: "#60a5fa",
}

function FactorBar({
  factor, value, weight, isDriver,
}: { factor: SeverityFactor; value: number; weight: number; isDriver: boolean }) {
  const color = FACTOR_COLORS[factor]
  const label = FACTOR_LABELS[factor]
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-slate-200 w-32 truncate" title={label}>{label}</span>
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "rgba(148,163,184,0.18)" }}>
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${Math.min(value, 100)}%`,
            background: isDriver ? color : `${color}CC`,
            boxShadow: isDriver ? `0 0 10px ${color}80` : "none",
          }}
        />
      </div>
      <span className="text-[10px] font-mono text-slate-100 w-8 text-right">{value}</span>
      <span className="text-[9px] text-slate-400 w-14 text-right">w {weight}</span>
      {isDriver && (
        <span
          className="text-[9px] font-bold uppercase tracking-wider px-1 rounded"
          style={{ color, background: `${color}22`, border: `1px solid ${color}44` }}
        >
          driver
        </span>
      )}
    </div>
  )
}

// ── Build a one-line plain-English summary ─────────────────────────
function buildSummary(path: IdentityAttackPath): string {
  const nodes = path.nodes ?? []
  const entry = nodes.find((n) => n.tier === "entry")
  const jewel = nodes.find((n) => n.tier === "crown_jewel") ?? nodes[nodes.length - 1]

  // The "weakest link" — an identity node with the most unused permissions
  let weakestIdentity = nodes.find((n) => n.tier === "identity" && (n.permissions?.unused ?? 0) > 0)
  if (!weakestIdentity) {
    weakestIdentity = nodes.find((n) => n.tier === "identity")
  }
  const unusedPerms = weakestIdentity?.permissions?.unused ?? 0

  const entryName = entry?.name ?? "an external entry point"
  const jewelName = jewel?.name ?? "the crown jewel"
  const weakestName = weakestIdentity?.name ?? "an over-permissioned identity"

  if (unusedPerms > 0) {
    return `An attacker from ${entryName} can reach ${jewelName} through ${weakestName}, which carries ${unusedPerms.toLocaleString()} unused IAM permissions.`
  }
  return `An attacker from ${entryName} can reach ${jewelName} via ${weakestName}.`
}

export function PathScoreHero({ path, pathIndex, totalPaths, onPrev, onNext }: PathScoreHeroProps) {
  const sev = path.severity
  const rr = path.risk_reduction
  const brs = path.target_blast_radius
  const theme = SEVERITY_THEME[sev.severity] ?? SEVERITY_THEME.LOW
  const achievable = rr?.achievable_score ?? sev.overall_score
  const reductionPct = sev.overall_score > 0
    ? Math.round(((sev.overall_score - achievable) / sev.overall_score) * 100)
    : 0
  const actionCount = rr?.top_actions?.length ?? 0

  // 6 factors in weight-order so the most heavily-weighted ones read first
  const factors: { key: SeverityFactor; value: number; weight: number }[] = [
    { key: "impact", value: sev.impact, weight: sev.weights?.impact ?? 25 },
    { key: "internet_exposure", value: sev.internet_exposure, weight: sev.weights?.internet_exposure ?? 20 },
    { key: "permission_breadth", value: sev.permission_breadth, weight: sev.weights?.permission_breadth ?? 18 },
    { key: "data_sensitivity", value: sev.data_sensitivity, weight: sev.weights?.data_sensitivity ?? 15 },
    { key: "identity_chain", value: sev.identity_chain, weight: sev.weights?.identity_chain ?? 12 },
    { key: "network_controls", value: sev.network_controls, weight: sev.weights?.network_controls ?? 10 },
  ]
  // Find the highest contributing factor (value × weight) — the "driver"
  const driver = factors
    .map((f) => ({ ...f, contribution: f.value * f.weight }))
    .sort((a, b) => b.contribution - a.contribution)[0]

  const summary = buildSummary(path)

  // Score arc — simple conic-gradient gauge
  const scorePct = Math.min(sev.overall_score, 100)

  return (
    <div
      className="relative px-5 py-4 border-b overflow-hidden"
      style={{
        background: "#0b1220",
        borderColor: theme.border,
        boxShadow: `inset 0 -1px 0 ${theme.border}, ${theme.glow}`,
      }}
    >
      {/* Severity color tint overlay — sits on top of the solid dark base */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: theme.bg }}
        aria-hidden
      />
      {/* ── Top row: path nav + severity band + score gauge + target jewel + remediation callout ── */}
      <div className="relative flex items-stretch gap-5">
        {/* Column 1 — severity band + score gauge */}
        <div className="flex items-center gap-4">
          {/* Severity band (huge) */}
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-6 h-6" style={{ color: theme.accent }} />
            <div>
              <div
                className="text-2xl font-extrabold leading-none tracking-wide"
                style={{ color: theme.accent }}
              >
                {theme.label}
              </div>
              <div className="text-[10px] text-slate-300 mt-0.5 uppercase tracking-wider">Attack Path</div>
            </div>
          </div>

          {/* Score gauge (big circular) */}
          <div className="relative flex items-center justify-center">
            <div
              className="relative w-24 h-24 rounded-full flex items-center justify-center"
              style={{
                background: `conic-gradient(${theme.accent} ${scorePct * 3.6}deg, rgba(148,163,184,0.15) ${scorePct * 3.6}deg)`,
              }}
            >
              <div
                className="absolute inset-1.5 rounded-full flex flex-col items-center justify-center"
                style={{ background: "rgba(15,23,42,0.95)" }}
              >
                <div className="text-3xl font-extrabold font-mono leading-none" style={{ color: theme.accent }}>
                  {sev.overall_score}
                </div>
                <div className="text-[9px] text-slate-300 mt-0.5 uppercase tracking-wider">/ 100</div>
              </div>
            </div>
          </div>
        </div>

        {/* Column 2 — target jewel + summary */}
        <div className="flex-1 flex flex-col justify-center min-w-0">
          {/* Path nav + target jewel header */}
          <div className="flex items-center gap-2 mb-1">
            {totalPaths > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={onPrev}
                  disabled={pathIndex === 0}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/50 hover:bg-slate-700/60 disabled:opacity-30 text-slate-300"
                  aria-label="Previous path"
                >
                  ‹
                </button>
                <span className="text-[10px] text-slate-200">
                  Path {pathIndex + 1} / {totalPaths}
                </span>
                <button
                  onClick={onNext}
                  disabled={pathIndex >= totalPaths - 1}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/50 hover:bg-slate-700/60 disabled:opacity-30 text-slate-300"
                  aria-label="Next path"
                >
                  ›
                </button>
              </div>
            )}
            <span className="text-[10px] text-slate-400">·</span>
            <Target className="w-3 h-3 text-purple-300" />
            <span className="text-[11px] text-slate-100 font-medium truncate">
              {path.nodes?.find((n) => n.tier === "crown_jewel")?.name ?? "Crown Jewel"}
            </span>
            {brs && (
              <span
                className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{
                  color: SEVERITY_THEME[brs.band]?.accent ?? "#8b5cf6",
                  background: `${SEVERITY_THEME[brs.band]?.accent ?? "#8b5cf6"}22`,
                  border: `1px solid ${SEVERITY_THEME[brs.band]?.accent ?? "#8b5cf6"}44`,
                }}
                title={`Blast Radius Score v1.1 · DOC ${brs.components.doc} / IPS ${brs.components.ips} / NES ${brs.components.nes} / LMS ${brs.components.lms} · confidence ${brs.confidence}`}
              >
                BRS {brs.brs.toFixed(1)} {brs.band}
              </span>
            )}
          </div>

          {/* One-line plain-English summary */}
          <p className="text-[12px] text-slate-50 leading-snug">{summary}</p>

          {/* Factor bars — compact */}
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1">
            {factors.map((f) => (
              <FactorBar
                key={f.key}
                factor={f.key}
                value={f.value}
                weight={f.weight}
                isDriver={f.key === driver.key}
              />
            ))}
          </div>
        </div>

        {/* Column 3 — remediation callout */}
        {rr && actionCount > 0 && reductionPct > 0 && (
          <div
            className="flex flex-col justify-center items-center px-4 rounded-lg border"
            style={{
              background: "rgba(16, 185, 129, 0.08)",
              borderColor: "rgba(16, 185, 129, 0.3)",
              boxShadow: "inset 0 0 20px rgba(16,185,129,0.08)",
            }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[10px] text-emerald-300 font-semibold uppercase tracking-wider">Remediate</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold font-mono text-amber-400 line-through opacity-60">
                {sev.overall_score}
              </span>
              <TrendingDown className="w-4 h-4 text-emerald-400" />
              <span className="text-3xl font-extrabold font-mono text-emerald-400">
                {achievable}
              </span>
            </div>
            <div className="text-[10px] text-emerald-400 mt-1 font-semibold">
              −{reductionPct}% with {actionCount} action{actionCount === 1 ? "" : "s"}
            </div>
            <div className="text-[9px] text-slate-200 mt-0.5 text-center">
              Top: reduces {FACTOR_LABELS[driver.key]}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
