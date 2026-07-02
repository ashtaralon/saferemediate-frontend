"use client"

// Path Analysis panel — the right column of the v2 page.
//
// Slice 1 ships: header (score + evidence chips), light attack-path hero
// card, and supporting evidence (damage-aware card, kill-chain strip,
// containment flow map — nested Cloud Graph (region · VPC · AZ · subnets ·
// services + animated attack path). Not the legacy lane TrafficFlowMap.

import { useMemo, useRef, useState } from "react"
import { Crown, ChevronRight, Maximize2, Minimize2, AlertOctagon } from "lucide-react"
import type {
  IdentityAttackPath,
  CrownJewelSummary,
  PathNodeDetail,
} from "@/components/identity-attack-paths/types"
import { isPrincipalNodeType } from "@/components/identity-attack-paths/types"
import { NetworkPlanePanel, IdentityPlanePanel, DataPlanePanel } from "./plane-panels"
import { HardeningPanel } from "./hardening-panel"
import { AtlasInlineSection } from "./atlas-inline-section"
import { AttackPathCardLightView } from "./attack-path-card-light"
import { AttackPathContainmentMap } from "./attack-path-containment-map"
import { AttackPathLaneFlowMap } from "./attack-path-lane-flow-map"
import { AttackSpineStrip } from "./attack-spine-strip"
import { useAttackPathReport } from "./use-attack-path-report"
import { useClosurePreview } from "./use-closure-preview"
import {
  DamageScopeDrawer,
  type DamageScopeTarget,
} from "./damage-scope-drawer"
import { DamageAwarePathCard } from "./damage-aware-path-card"
import { useDamageScope } from "./use-damage-scope"
import { CrownJewelUnionViewLink } from "./crown-jewel-union-view-link"
import { LateralMovesSummaryCard } from "./lateral-moves-summary-card"
import type { SystemArchitecture } from "@/components/dependency-map/traffic-flow-map"

interface PathAnalysisPanelProps {
  path: IdentityAttackPath
  jewel: CrownJewelSummary | null
  systemName: string
  /** When true, the parent has hidden the left + center columns so this
   *  panel fills the whole screen. We render a Minimize button in the
   *  header to return to the 3-column layout. */
  isExpanded?: boolean
  onToggleExpand?: () => void
  /** When provided, the embedded canvas renders the full Attacker-View
   *  architecture (lateral fan-outs, 9-lane layout, hover provenance)
   *  instead of the sparse path-filter view. Used by the merged
   *  "Attack Path" tab so the canvas inherits Attacker View's lens
   *  while the header / breadcrumb / closure card stay Per-Path. When
   *  null/undefined, the legacy path-filter mode renders. */
  architecture?: SystemArchitecture | null
  /** Visual v2 opt-in (?canvas=v2). Adds the caption strip above the
   *  canvas, the severity halo on the jewel card, and (in later
   *  passes) lateral dimming + verb chips + palette consolidation.
   *  Pure visual layer — no data/contract impact. Default false so
   *  legacy operators see the unchanged canvas. */
  canvasV2?: boolean
  /** Cyntro attack map stack. Default true; ?map=legacy for old Cloud Graph. */
  attackMapCyntro?: boolean
  /** Other paths to the same jewel — convergence fallback when API is down. */
  siblingPaths?: IdentityAttackPath[]
}

// V2-1 helper: middle-truncate a jewel name for the caption strip.
// Jewel names are usually friendly already (e.g. "cyntro-demo-prod-
// data-745783559495") but the trailing 12-digit account ID is
// noise — keep prefix + suffix readable, truncate the middle. Full
// name still surfaces on hover via the title attribute.
function captionTruncate(name: string, maxLen = 36): string {
  if (!name) return ""
  if (name.length <= maxLen) return name
  const half = Math.floor((maxLen - 1) / 2)
  return name.slice(0, half) + "…" + name.slice(-(maxLen - half - 1))
}

// Kill-chain strip (2026-06-11). The map's lane layout makes the
// numbered spine zigzag visually; this strip gives reviewers the
// LINEAR story: ENTRY → IDENTITY → NETWORK PASSAGE → DATA, with the
// same 1-based step numbers the map badges carry. Replaces the old
// canvasV2-gated "ENTRY → via N hops → REACHES" caption — always on
// when a path is present. Purely presentational.
type KillChainPhase = "ENTRY" | "IDENTITY" | "NETWORK" | "DATA"

function killChainPhase(node: PathNodeDetail): KillChainPhase {
  const t = (node.type || "").toLowerCase()
  // Order matters: "instanceprofile" contains "instance" (a workload
  // hint) — identity patterns must win first.
  if (/role|instance.?profile|policy/.test(t)) return "IDENTITY"
  if (/s3|bucket|rds|dynamo|kms|secret/.test(t)) return "DATA"
  // `\bvpc\b` catches bare "vpc" type. Without it, a VPC node falls through
  // to the ENTRY fallback (#191 — VPC labeled as ENTRY on the chip strip).
  // VPCE / vpc-endpoint already match before this via `vpce|vpc.?endpoint`.
  if (/subnet|security.?group|nacl|networkacl|route|vpce|vpc.?endpoint|\bvpc\b|igw|internet.?gateway|nat/.test(t)) return "NETWORK"
  if (isPrincipalNodeType(node.type) || /ec2|lambda|ecs|instance|principal|user/.test(t)) return "ENTRY"
  // Unknown type → fall back to the path tier the backend assigned.
  if (node.tier === "network_control") return "NETWORK"
  if (node.tier === "identity") return "IDENTITY"
  if (node.tier === "crown_jewel") return "DATA"
  return "ENTRY"
}

function KillChainStrip({ nodes }: { nodes: PathNodeDetail[] }) {
  // Segments: every node is its own segment EXCEPT consecutive NETWORK
  // nodes, which collapse into one "NETWORK PASSAGE · n hops" segment
  // (step range + tooltip list) so the strip stays one line. We also drop
  // consecutive duplicate (id OR name) so InstanceProfile+IAMRole pairs
  // — both classed as IDENTITY, same name — don't render as two separate
  // chips (#191 — "IDENTITY cyntro-demo-ec2-s3-role" appeared twice).
  const segments = useMemo(() => {
    // Step 1: deduplicate consecutive nodes that are functionally identical.
    // Compare by canonical_id ?? id first; fall back to (phase, name) to
    // collapse profile-then-role pairs that share a friendly name.
    const dedup: PathNodeDetail[] = []
    nodes.forEach((n) => {
      const prev = dedup[dedup.length - 1]
      if (prev) {
        const prevKey = prev.canonical_id ?? prev.id
        const nKey = n.canonical_id ?? n.id
        if (prevKey && nKey && prevKey === nKey) return
        if (
          killChainPhase(prev) === killChainPhase(n) &&
          prev.name &&
          n.name &&
          prev.name === n.name
        ) {
          return
        }
      }
      dedup.push(n)
    })
    // Step 2: existing segmentation, applied to the deduped list.
    const segs: Array<{ phase: KillChainPhase; nodes: Array<PathNodeDetail & { step: number }> }> = []
    dedup.forEach((n, idx) => {
      const phase = killChainPhase(n)
      const entry = { ...n, step: idx + 1 }
      const prev = segs[segs.length - 1]
      if (phase === "NETWORK" && prev?.phase === "NETWORK") prev.nodes.push(entry)
      else segs.push({ phase, nodes: [entry] })
    })
    return segs
  }, [nodes])
  if (segments.length === 0) return null
  return (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-1 px-6 py-3 border-b border-border bg-card"
      data-kill-chain-strip="true"
    >
      {segments.map((seg, i) => {
        const grouped = seg.nodes.length > 1
        const first = seg.nodes[0]
        const last = seg.nodes[seg.nodes.length - 1]
        const numberLabel = grouped ? `${first.step}–${last.step}` : String(first.step)
        const title = seg.nodes.map((n) => `${n.step}. ${n.name} (${n.type})`).join("\n")
        const isLast = i === segments.length - 1
        return (
          <span key={`${seg.phase}-${first.step}`} className="flex items-center gap-2 min-w-0" title={title}>
            {/* Same badge style as the map's numbered spine badges */}
            <span
              className={`${grouped ? "px-1.5 min-w-[18px]" : "w-[18px]"} h-[18px] rounded-full flex items-center justify-center text-[10px] font-semibold text-white shadow-md shrink-0`}
              style={{ backgroundColor: "var(--canvas-danger)" }}
            >
              {numberLabel}
            </span>
            <span className="flex flex-col leading-tight min-w-0">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                {grouped ? `Network passage · ${seg.nodes.length} hops` : seg.phase}
              </span>
              {!grouped && (
                <span className="text-[11px] font-mono text-foreground truncate">
                  {captionTruncate(first.name)}
                </span>
              )}
            </span>
            {isLast && seg.phase === "DATA" && (
              <Crown className="h-3 w-3 text-amber-500 shrink-0" />
            )}
            {!isLast && <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
          </span>
        )
      })}
    </div>
  )
}

// Map severity level → tone for the score badge. Same palette as the
// path list so the operator sees consistent severity coloring across
// the page.
function severityTone(level?: string) {
  const l = (level || "").toLowerCase()
  if (l === "critical") return "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300"
  if (l === "high") return "bg-orange-500/10 border-orange-500/30 text-orange-700 dark:text-orange-300"
  if (l === "medium") return "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300"
  if (l === "low") return "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
  return "bg-muted border-border text-muted-foreground"
}

export function PathAnalysisPanel({
  path,
  jewel,
  systemName,
  isExpanded = false,
  onToggleExpand,
  architecture,
  canvasV2 = false,
  attackMapCyntro = true,
  siblingPaths = [],
}: PathAnalysisPanelProps) {
  const [damageScopeTarget, setDamageScopeTarget] = useState<DamageScopeTarget | null>(
    null,
  )
  const [damageScopeOpen, setDamageScopeOpen] = useState(false)
  const damageScopePortalContainerRef = useRef<HTMLDivElement | null>(null)
  const [technicalOpen, setTechnicalOpen] = useState(false)
  // Flow map — lane-based TrafficFlowMap (stack columns + numbered path)
  // with optional nested architecture containment tab.
  const [evidenceOpen, setEvidenceOpen] = useState(true)

  const { closure } = useClosurePreview(path)
  const { report, loading: reportLoading, error: reportError, retry: reportRetry } =
    useAttackPathReport(path, jewel, closure)

  const sevTone = severityTone(path.severity?.severity)
  const sevLabel = (path.severity?.severity || "—").toUpperCase()
  const sevScore = path.severity?.overall_score

  // Root-principal detection — surfaces as a header badge AND a chip
  // overlay on the COMPUTE/IAM lane card. The auth identity is
  // already on path.nodes[0] (a principal-like wrapper) but the
  // scorer doesn't yet boost root paths (see open task — backend +20
  // floor). Operators scanning the score-sorted path list miss the
  // worst signal without an explicit badge here.
  // Post 2026-05-22 canonical-type fix: root arrives as type
  // "AWSPrincipal" (was "CloudTrailPrincipal"); widen via
  // isPrincipalNodeType so the badge still lights up.
  const isRootPrincipal = useMemo(() => {
    const p = (path.nodes ?? []).find((n) => isPrincipalNodeType(n.type))
    return p?.name === "root"
  }, [path])

  const jewelNodeId = useMemo(() => {
    if (jewel?.id) return jewel.id
    const dataTypes = new Set([
      "S3Bucket",
      "DynamoDBTable",
      "RDSInstance",
      "RDS",
      "KMSKey",
      "Secret",
      "SecretsManagerSecret",
    ])
    const nodes = path.nodes ?? []
    for (let i = nodes.length - 1; i >= 0; i--) {
      if (dataTypes.has(nodes[i].type)) return nodes[i].id
    }
    return nodes[nodes.length - 1]?.id ?? null
  }, [path, jewel])

  const damageScopeFetchTarget = useMemo(
    () =>
      jewelNodeId
        ? { systemName, pathId: path.id, nodeId: jewelNodeId }
        : null,
    [systemName, path.id, jewelNodeId],
  )
  const { data: damageScopeData, loading: damageScopeLoading, error: damageScopeError } =
    useDamageScope(damageScopeFetchTarget)

  // Accuracy-audit F5 (2026-06-11): per-path gate evidence summary from
  // the MATERIALIZED :AttackPath gates — always labeled with the exact
  // foothold → role pair it summarizes. The previous evidence chip
  // aggregated whichever underlying path variant happened to be loaded
  // (EC2-foothold route=OPEN_CONFIG vs orphan-role route=UNKNOWN)
  // without disambiguating, so the counts wobbled between views.
  const materializedEvidence = useMemo(() => {
    const mp = path.materialized_path
    if (!mp) return null
    const gateNames: Array<[string, string | undefined]> = [
      ["identity", mp.identity_gate],
      ["route", mp.route_gate],
      ["data-plane", mp.data_plane_gate],
    ]
    const counts = { observed: 0, configured: 0, blocked: 0, unknown: 0 }
    for (const [, g] of gateNames) {
      const v = (g || "UNKNOWN").toUpperCase()
      if (v === "OPEN_OBSERVED") counts.observed++
      else if (v === "OPEN_CONFIG") counts.configured++
      else if (v === "CLOSED") counts.blocked++
      else counts.unknown++
    }
    const parts: string[] = []
    if (counts.observed) parts.push(`${counts.observed} observed`)
    if (counts.configured) parts.push(`${counts.configured} configured`)
    if (counts.blocked) parts.push(`${counts.blocked} blocked`)
    if (counts.unknown) parts.push(`${counts.unknown} unknown`)
    const pathLabel = [mp.workload_name, mp.role_name].filter(Boolean).join(" → ")
    const detail = gateNames
      .map(([name, g]) => `${name}=${(g || "UNKNOWN").toUpperCase()}`)
      .join(" · ")
    return { parts, pathLabel, detail }
  }, [path.materialized_path])

  return (
    <div className="flex flex-col h-full">
      {/* Compact chrome — path narrative lives on DamageAwarePathCard */}
      <div className="px-6 py-2 border-b border-border bg-background/95 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            {/* Labeled "path score" so it can't be confused with the
                compiler's Exposure (0–1) chip in the narrative — two
                different models, two different dimensions. */}
            <span
              className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wider rounded border px-2 py-0.5 ${sevTone}`}
              title="IAP 6-factor path score (/100) — distinct from the compiler's Exposure model below"
            >
              <span className="opacity-70 mr-1 font-semibold normal-case">path score</span>
              {sevLabel}
              {sevScore !== undefined && sevScore !== null && (
                <span className="ml-1.5 opacity-80">{sevScore}/100</span>
              )}
            </span>
            {isRootPrincipal && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider rounded border border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300 px-2 py-0.5"
                title="Authenticated with AWS account root user"
              >
                <AlertOctagon className="h-3 w-3" />
                Auth: root
              </span>
            )}
            <span className="text-[11px] text-muted-foreground">
              {path.hop_count ?? path.nodes.length - 1} hops
            </span>
            {materializedEvidence && (
              <span
                className="text-[10px] uppercase tracking-wider text-muted-foreground truncate max-w-[360px]"
                title={`Gate evidence for THIS path${materializedEvidence.pathLabel ? ` (${materializedEvidence.pathLabel})` : ""}: ${materializedEvidence.detail}`}
              >
                Evidence
                {materializedEvidence.pathLabel && (
                  <span className="normal-case font-mono"> ({materializedEvidence.pathLabel})</span>
                )}
                : {materializedEvidence.parts.join(" · ")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {jewel && (
              <div className="flex flex-col items-end gap-0.5 min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-mono text-amber-700 dark:text-amber-300 truncate max-w-[200px]" title={jewel.name}>
                  <Crown className="h-3 w-3 text-amber-500 shrink-0" />
                  {jewel.name}
                </div>
                <CrownJewelUnionViewLink systemName={systemName} jewel={jewel} />
              </div>
            )}
            {onToggleExpand && (
              <button
                onClick={onToggleExpand}
                title={isExpanded ? "Collapse (Esc)" : "Expand to full screen"}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                {isExpanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* HERO — light prod attack-path card (cyntro_attack-path-card_design.html).
          Pure renderer of the real backend AttackPathReport: header + risk +
          "how real" gates + the fix you approve. The flow map, the dark
          damage-aware card, and per-plane detail all move into "Supporting
          evidence" below so the clean light card is the default view. */}
      <div className="px-6 py-5 border-b border-border" style={{ background: "#eef1f5" }}>
        {reportLoading && !report ? (
          <p className="text-[12px] text-muted-foreground">Loading attack path report…</p>
        ) : report ? (
          <>
            {/* CISO 5-second surface — hidden when Cyntro map owns the narrative */}
            {!attackMapCyntro && (
              <div className="mb-4">
                <AttackSpineStrip report={report} path={path} />
              </div>
            )}
            <AttackPathCardLightView
              report={report}
              path={path}
              systemName={systemName}
              architecture={architecture}
            />
          </>
        ) : (
          <p className="text-[12px] text-muted-foreground">
            Report unavailable{reportError ? `: ${reportError}` : ""}.
            {reportError && (
              <button type="button" className="ml-2 underline" onClick={reportRetry}>
                Retry
              </button>
            )}
          </p>
        )}
      </div>

      {/* Attack map — primary visual; always visible (not inside Supporting evidence) */}
      {attackMapCyntro && (
        <div className="border-b border-border bg-background">
          <div className="px-6 pt-4 pb-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
              Attack map
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              All paths to this crown jewel, placed on the live VPC topology.
              Observed (CloudTrail) vs configured. Legacy map:{" "}
              <span className="font-mono">?map=legacy</span>
            </p>
          </div>
          <div
            className="relative overflow-auto min-h-[560px] rounded-[14px] px-3 pt-2 pb-4"
            data-testid="attack-path-flow-map-slot"
          >
            {/* Path-scoped Traffic Map — the exact TrafficFlowMap engine the
                Topology tab uses, filtered to THIS attack path via pathFilter
                (on-path chain + lateral pivots), per Alon 2026-07. Replaces the
                multi-path ConvergenceMapLoader so the Attack Path tab's map
                shows only the relevant path (e.g. i-… → the crown-jewel bucket)
                1:1 with Topology's Traffic Map. */}
            <AttackPathLaneFlowMap
              path={path}
              jewel={jewel}
              systemName={systemName}
              architecture={architecture}
            />
          </div>
        </div>
      )}

      {/* Attacker next moves — compact lateral fan-out, full detail in the
          Lateral Movement tab. docs/specs/attack_path_lateral_movement_v1.md */}
      <LateralMovesSummaryCard path={path} jewel={jewel} systemName={systemName} />

      {/* Supporting evidence — damage card + plane breakdown (map is above when Cyntro) */}
      <div className="border-b border-border bg-muted/30">
        <div className="px-6 pt-3 pb-1">
          <button
            type="button"
            onClick={() => setEvidenceOpen((o) => !o)}
            className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            <ChevronRight
              className={`h-3 w-3 transition-transform ${evidenceOpen ? "rotate-90" : ""}`}
            />
            Supporting evidence
          </button>
          {evidenceOpen && (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Damage matrix, plane signals, and technical detail
            </p>
          )}
        </div>
        {evidenceOpen && (
        <>
        {/* Dark damage-aware card — demoted from hero into supporting
            evidence (the light card above now owns the damage/fix story).
            Kept here so its damage-scope drawer + per-cell detail stay
            available for the operator drilling in. */}
        {report && (
          <div className="px-6 pt-4">
            <DamageAwarePathCard
              report={report}
              path={path}
              jewel={jewel}
              systemName={systemName}
              scope={damageScopeData}
              scopeLoading={damageScopeLoading}
              scopeError={damageScopeError}
            />
          </div>
        )}
        {/* Kill-chain strip (2026-06-11) — replaces the canvasV2-gated
            "ENTRY → via N hops → REACHES" caption. Always on when the
            path has nodes: a LINEAR phase-by-phase read of the spine
            whose numbers match the map's step badges, since the lane
            layout makes the numbered spine zigzag on the canvas. */}
        {!attackMapCyntro && (path.nodes?.length ?? 0) > 0 && (
          <KillChainStrip nodes={path.nodes} />
        )}
        {!attackMapCyntro && (
        <div className="px-6 pt-3 pb-4">
          <div className="px-1 pb-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Cloud Graph
              <span className="font-normal normal-case ml-2 text-[11px]">
                Legacy Cloud Graph · ?map=legacy
              </span>
            </p>
          </div>
          <div
            className="relative overflow-auto rounded-[14px] border border-border bg-card px-1 py-1 max-h-[760px]"
            style={{ boxShadow: "0 1px 2px rgba(20,35,55,.04), 0 6px 18px rgba(20,35,55,.07)" }}
            data-testid="attack-path-flow-map-slot"
          >
            {report ? (
              <AttackPathContainmentMap
                path={path}
                report={report}
                architecture={architecture ?? null}
                systemName={systemName}
                slot="flow"
              />
            ) : reportLoading ? (
              <p className="text-[11px] text-muted-foreground px-2 py-12 text-center">Building the cloud graph…</p>
            ) : (
              <p className="text-[11px] text-muted-foreground px-2 py-12 text-center">
                Cloud graph unavailable{reportError ? ` (${reportError})` : ""}.
                {reportError && (
                  <button type="button" className="ml-2 underline" onClick={reportRetry}>
                    Retry
                  </button>
                )}
              </p>
            )}
          </div>
          <AtlasInlineSection systemName={systemName} path={path} jewel={jewel} />
        </div>
        )}
        {attackMapCyntro && (
          <div className="px-6 pt-2 pb-4">
            <AtlasInlineSection systemName={systemName} path={path} jewel={jewel} />
          </div>
        )}
        </>
        )}
      </div>

      <div className="px-6 py-4 border-t border-border">
        <button
          type="button"
          onClick={() => setTechnicalOpen((o) => !o)}
          className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          <ChevronRight
            className={`h-3 w-3 transition-transform ${technicalOpen ? "rotate-90" : ""}`}
          />
          Technical detail — network / identity / data planes
        </button>
        {technicalOpen && (
          <div className="mt-4 space-y-4">
            <NetworkPlanePanel path={path} />
            <IdentityPlanePanel path={path} />
            <DataPlanePanel path={path} />
            <HardeningPanel path={path} systemName={systemName} defaultCollapsed />
          </div>
        )}
      </div>

      <DamageScopeDrawer
        target={damageScopeTarget}
        open={damageScopeOpen}
        onOpenChange={setDamageScopeOpen}
        portalContainerRef={damageScopePortalContainerRef}
      />
    </div>
  )
}
