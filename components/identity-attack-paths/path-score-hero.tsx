"use client"

import { useState } from "react"
import { AlertTriangle, Target, ChevronDown, ChevronRight, ArrowRight } from "lucide-react"
import type { IdentityAttackPath, SeverityFactor } from "./types"
import { FACTOR_LABELS } from "./types"

interface PathScoreHeroProps {
  path: IdentityAttackPath
  pathIndex: number
  totalPaths: number
  onPrev?: () => void
  onNext?: () => void
}

// ── Severity → dark-mode theme ──────────────
const SEVERITY_THEME: Record<string, {
  panelBg: string
  panelBorder: string
  chipBg: string
  chipBorder: string
  chipText: string
  accent: string
  label: string
}> = {
  CRITICAL: { panelBg: "linear-gradient(135deg, rgba(239,68,68,0.22) 0%, rgba(127,29,29,0.28) 100%)", panelBorder: "rgba(239,68,68,0.45)", chipBg: "rgba(239,68,68,0.18)", chipBorder: "rgba(239,68,68,0.45)", chipText: "#fecaca", accent: "#ef4444", label: "CRITICAL" },
  HIGH:     { panelBg: "linear-gradient(135deg, rgba(249,115,22,0.18) 0%, rgba(120,53,15,0.22) 100%)", panelBorder: "rgba(249,115,22,0.4)",  chipBg: "rgba(249,115,22,0.18)", chipBorder: "rgba(249,115,22,0.45)", chipText: "#fed7aa", accent: "#f97316", label: "HIGH" },
  MEDIUM:   { panelBg: "linear-gradient(135deg, rgba(245,158,11,0.14) 0%, rgba(120,53,15,0.18) 100%)", panelBorder: "rgba(245,158,11,0.38)", chipBg: "rgba(245,158,11,0.18)", chipBorder: "rgba(245,158,11,0.45)", chipText: "#fde68a", accent: "#f59e0b", label: "MEDIUM" },
  LOW:      { panelBg: "linear-gradient(135deg, rgba(59,130,246,0.12) 0%, rgba(30,58,138,0.18) 100%)",  panelBorder: "rgba(59,130,246,0.35)", chipBg: "rgba(59,130,246,0.18)", chipBorder: "rgba(59,130,246,0.45)", chipText: "#bfdbfe", accent: "#3b82f6", label: "LOW" },
}

// ── Factor → color (used inside the collapsed breakdown) ──
const FACTOR_COLORS: Record<SeverityFactor, string> = {
  impact: "#f87171",
  internet_exposure: "#fb923c",
  permission_breadth: "#f59e0b",
  data_sensitivity: "#a78bfa",
  identity_chain: "#ec4899",
  network_controls: "#60a5fa",
}

// ── A single node in the Attack Chain visual — shows resource TYPE + NAME
// so the user can tell what `saferemediate-test-app-sg` actually IS.
function ChainNode({
  node,
  hint,
  isCrownJewel,
}: {
  node: { name?: string; id?: string; type?: string; tier?: string }
  hint?: string
  isCrownJewel?: boolean
}) {
  const typeLabel = humanizeType(node.type, node.tier)
  const name = node.name || node.id || "unknown"
  return (
    <div
      className="inline-flex min-w-0 items-stretch rounded-md border"
      style={{
        background: isCrownJewel ? "rgba(245, 158, 11, 0.12)" : "rgba(15, 23, 42, 0.55)",
        borderColor: isCrownJewel ? "rgba(245, 158, 11, 0.4)" : "rgba(148, 163, 184, 0.2)",
      }}
    >
      <span
        className="flex items-center px-1.5 text-[9px] font-semibold uppercase tracking-wider rounded-l-md"
        style={{
          background: isCrownJewel ? "rgba(245, 158, 11, 0.22)" : "rgba(148, 163, 184, 0.15)",
          color: isCrownJewel ? "#fde68a" : "#cbd5e1",
        }}
      >
        {isCrownJewel ? <Target className="w-2.5 h-2.5 mr-0.5" /> : null}
        {typeLabel}
      </span>
      <span className="flex min-w-0 items-center px-2 py-1 text-[11px] font-medium text-slate-100">
        <span className="truncate max-w-[240px]" title={name}>{name}</span>
        {hint && (
          <span className="ml-1.5 text-[10px] text-red-300 font-semibold whitespace-nowrap">
            · {hint}
          </span>
        )}
      </span>
    </div>
  )
}

function FactorBar({
  factor, value, weight, isDriver,
}: { factor: SeverityFactor; value: number; weight: number; isDriver: boolean }) {
  const color = FACTOR_COLORS[factor]
  const label = FACTOR_LABELS[factor]
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-slate-300 w-32 truncate" title={label}>{label}</span>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(148,163,184,0.18)" }}>
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${Math.min(value, 100)}%`,
            background: isDriver ? color : `${color}CC`,
            boxShadow: isDriver ? `0 0 10px ${color}80` : "none",
          }}
        />
      </div>
      <span className="text-[10px] font-mono tabular-nums text-slate-100 w-8 text-right">{value}</span>
      <span className="text-[9px] text-slate-400 w-10 text-right">w {weight}</span>
      {isDriver && (
        <span
          className="text-[9px] font-semibold uppercase tracking-wider px-1 rounded"
          style={{ color, background: `${color}22`, border: `1px solid ${color}44` }}
        >
          driver
        </span>
      )}
    </div>
  )
}

// ── Humanise a raw AWS resource type into a readable label ─────────
// Maps backend types like "SecurityGroup" / "CloudTrailPrincipal" to what
// the user actually needs to see next to the resource name.
function humanizeType(type: string | undefined, tier?: string): string {
  const t = (type ?? "").toLowerCase()
  if (t.includes("securitygroup") || t === "sg") return "Security Group"
  if (t.includes("ec2instance") || t === "ec2") return "EC2 Instance"
  if (t.includes("instanceprofile")) return "Instance Profile"
  if (t === "iamrole" || t.includes("iamrole")) return "IAM Role"
  if (t === "iamuser" || t.includes("iamuser")) return "IAM User"
  if (t === "iampolicy" || t.includes("iampolicy")) return "IAM Policy"
  if (t === "s3bucket" || t.includes("s3bucket") || t === "s3") return "S3 Bucket"
  if (t.includes("rds")) return "RDS Database"
  if (t.includes("dynamo")) return "DynamoDB Table"
  if (t.includes("kms")) return "KMS Key"
  if (t.includes("lambda")) return "Lambda"
  if (t.includes("nacl")) return "Network ACL"
  if (t.includes("subnet")) return "Subnet"
  if (t.includes("vpc")) return "VPC"
  if (t.includes("cloudtrailprincipal") || t === "principal") return "Principal"
  if (t.includes("internet") || t.includes("external")) return "External"
  if (tier === "entry") return "Entry Point"
  if (tier === "crown_jewel") return "Crown Jewel"
  return type ?? "Resource"
}

// ── Pick the three anchor nodes for the chain visual ───────────────
function pickChainNodes(path: IdentityAttackPath) {
  const nodes = path.nodes ?? []
  const entry = nodes.find((n) => n.tier === "entry") ?? nodes[0]
  const jewel = nodes.find((n) => n.tier === "crown_jewel") ?? nodes[nodes.length - 1]
  let weakest = nodes.find((n) => n.tier === "identity" && (n.permissions?.unused ?? 0) > 0)
  if (!weakest) weakest = nodes.find((n) => n.tier === "identity")
  const unused = weakest?.permissions?.unused ?? 0
  return { entry, weakest, jewel, unusedPerms: unused, totalHops: nodes.length }
}

export function PathScoreHero({ path, pathIndex, totalPaths, onPrev, onNext }: PathScoreHeroProps) {
  const [showAllFactors, setShowAllFactors] = useState(false)
  const sev = path.severity
  const brs = path.target_blast_radius
  const theme = SEVERITY_THEME[sev.severity] ?? SEVERITY_THEME.LOW

  // 6 factors in weight-order so the most heavily-weighted ones read first
  const factors: { key: SeverityFactor; value: number; weight: number }[] = [
    { key: "impact", value: sev.impact, weight: sev.weights?.impact ?? 25 },
    { key: "internet_exposure", value: sev.internet_exposure, weight: sev.weights?.internet_exposure ?? 20 },
    { key: "permission_breadth", value: sev.permission_breadth, weight: sev.weights?.permission_breadth ?? 18 },
    { key: "data_sensitivity", value: sev.data_sensitivity, weight: sev.weights?.data_sensitivity ?? 15 },
    { key: "identity_chain", value: sev.identity_chain, weight: sev.weights?.identity_chain ?? 12 },
    { key: "network_controls", value: sev.network_controls, weight: sev.weights?.network_controls ?? 10 },
  ]
  const driver = factors
    .map((f) => ({ ...f, contribution: f.value * f.weight }))
    .sort((a, b) => b.contribution - a.contribution)[0]
  const driverLabel = FACTOR_LABELS[driver.key]

  const { entry, weakest, jewel, unusedPerms, totalHops } = pickChainNodes(path)

  return (
    <div
      className="relative px-5 py-4 border-b overflow-hidden"
      style={{
        background: "#0b1220",
        borderColor: theme.panelBorder,
        boxShadow: `inset 0 -1px 0 ${theme.panelBorder}`,
      }}
    >
      {/* Severity color tint overlay on top of the dark base */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: theme.panelBg }} aria-hidden />

      <div className="relative">
        {/* Top row — kicker label + path nav on the far right, so the big
            score below has an unambiguous "what is this number" caption. */}
        <div className="flex items-center justify-between gap-3 mb-1">
          <div
            className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400"
            title="0–100 attack-path severity score, weighted across 6 factors: impact, internet exposure, permission breadth, data sensitivity, identity chain, and network controls. Higher = more dangerous."
          >
            Attack-path severity · 0–100, higher is worse
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[11px] text-slate-400">
              <span className="font-semibold text-slate-200 tabular-nums">{totalHops}</span> hops
            </span>
            {totalPaths > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={onPrev}
                  disabled={pathIndex === 0}
                  className="text-xs px-1.5 py-0.5 rounded text-slate-300 bg-slate-800/50 hover:bg-slate-700/60 disabled:opacity-30"
                  aria-label="Previous path"
                >
                  ‹
                </button>
                <span className="text-[11px] text-slate-200 tabular-nums">
                  Path {pathIndex + 1} / {totalPaths}
                </span>
                <button
                  onClick={onNext}
                  disabled={pathIndex >= totalPaths - 1}
                  className="text-xs px-1.5 py-0.5 rounded text-slate-300 bg-slate-800/50 hover:bg-slate-700/60 disabled:opacity-30"
                  aria-label="Next path"
                >
                  ›
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Row 1 — severity chip + BIG score, the hero moment */}
        <div className="flex items-center gap-4 flex-wrap">
          <div
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded border"
            style={{ background: theme.chipBg, borderColor: theme.chipBorder }}
          >
            <AlertTriangle className="w-3.5 h-3.5" style={{ color: theme.accent }} />
            <span className="text-[11px] font-semibold tracking-wide" style={{ color: theme.chipText }}>{theme.label}</span>
          </div>

          <div className="flex items-baseline gap-1.5">
            <span
              className="text-6xl font-semibold tabular-nums leading-none tracking-tight"
              style={{ color: theme.accent }}
            >
              {sev.overall_score}
            </span>
            <span className="text-base text-slate-400 font-medium">/ 100</span>
          </div>

          {brs && (
            <span
              className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border"
              style={{
                color: SEVERITY_THEME[brs.band]?.accent ?? "#94a3b8",
                background: `${SEVERITY_THEME[brs.band]?.accent ?? "#94a3b8"}20`,
                borderColor: `${SEVERITY_THEME[brs.band]?.accent ?? "#94a3b8"}40`,
              }}
              title={`Blast Radius Score v1.1 · DOC ${brs.components.doc} / IPS ${brs.components.ips} / NES ${brs.components.nes} / LMS ${brs.components.lms} · confidence ${brs.confidence}`}
            >
              BRS {brs.brs.toFixed(1)} {brs.band}
            </span>
          )}
        </div>

        {/* Row 2 — attack chain: Entry → Identity (N unused perms) → Crown Jewel. Each node carries a TYPE badge so the user can read what the resource IS, not just its name. */}
        <div
          className="mt-3 rounded-md border px-3 py-2.5"
          style={{
            background: "rgba(15, 23, 42, 0.6)",
            borderColor: "rgba(148, 163, 184, 0.18)",
          }}
        >
          <div className="flex items-center gap-0.5 mb-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              Attack chain
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {entry && <ChainNode node={entry} />}
            {weakest && weakest.id !== entry?.id && (
              <>
                <ArrowRight className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                <ChainNode node={weakest} hint={unusedPerms > 0 ? `${unusedPerms.toLocaleString()} unused perms` : undefined} />
              </>
            )}
            {jewel && jewel.id !== weakest?.id && jewel.id !== entry?.id && (
              <>
                <ArrowRight className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                <ChainNode node={jewel} isCrownJewel />
              </>
            )}
          </div>
        </div>

        {/* Row 3 — driver callout + "View all factors" toggle */}
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Driver:</span>
          <span
            className="text-[11px] font-medium px-1.5 py-0.5 rounded"
            style={{
              color: FACTOR_COLORS[driver.key],
              background: `${FACTOR_COLORS[driver.key]}22`,
              border: `1px solid ${FACTOR_COLORS[driver.key]}44`,
            }}
          >
            {driverLabel}
            <span className="ml-1 text-slate-400 font-normal">· contributes {driver.value}</span>
          </span>

          <button
            onClick={() => setShowAllFactors((v) => !v)}
            className="ml-auto inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-100"
          >
            {showAllFactors ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            {showAllFactors ? "Hide all factors" : "View all factors"}
          </button>
        </div>

        {/* Row 4 — full factor grid, progressive disclosure */}
        {showAllFactors && (
          <div
            className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border p-3"
            style={{
              background: "rgba(15, 23, 42, 0.6)",
              borderColor: "rgba(148, 163, 184, 0.18)",
            }}
          >
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
        )}
      </div>
    </div>
  )
}
