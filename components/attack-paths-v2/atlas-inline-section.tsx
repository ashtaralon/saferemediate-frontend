"use client"

// ATLAS Inline Section — Phase 3.2.1 (2026-05-27).
//
// Replaces the v0.1 standalone "ATLAS search" tab. Sits at the bottom
// of the Attacker View canvas — derives foothold + target from the
// currently-selected path automatically, fires a search, and shows
// the chains inline. NO inputs, NO button. The operator already chose
// the path; we don't make them re-type it.
//
// Design intent (from Alon, 2026-05-27 screenshot feedback):
//   - "we should not search, its should be in front of us in a very
//     clear way" — auto-load, compact card row, fits in the empty
//     space below the canvas.
//
// Compact layout:
//   - Header strip: ATLAS · N chains · Nms · catalog version
//   - Each chain renders as one horizontal card with primitives + key
//     state-delta inline. The full step-by-step breakdown is a
//     hover/expand affordance for the operator who wants depth.

import { useEffect, useState, useMemo } from "react"
import { Shield, Loader2, AlertCircle } from "lucide-react"
import type {
  IdentityAttackPath,
  CrownJewelSummary,
} from "@/components/identity-attack-paths/types"

// ─── Types — mirror api/atlas/types.py AtlasResponse ─────────────────

interface AtlasChainStep {
  step_index: number
  primitive_id: string
  state_delta: {
    added_compromised_workloads: string[]
    added_captured_identities: string[]
    added_accessible_resources: string[]
    added_synthetic_edges: string[]
    added_synthetic_nodes: string[]
  }
}

interface AtlasChain {
  chain_id: string
  steps: AtlasChainStep[]
  total_cost: number
  feasibility_score: number
  primitives_used: string[]
  blocking_controls: string[]
  assumptions_consumed: string[]
}

interface AtlasResponse {
  chains: AtlasChain[]
  dead_ends: any[]
  coverage_warnings: Array<{ code: string; message: string }>
  catalog_version: string
  engine_version: string
  elapsed_ms: number
}

interface AtlasInlineSectionProps {
  systemName: string
  path: IdentityAttackPath
  jewel: CrownJewelSummary | null
}

// Cheap ARN shortener for inline display ("…/RoleName" instead of full ARN).
function shortId(id: string | null | undefined): string {
  if (!id) return "—"
  if (id.startsWith("arn:")) {
    const parts = id.split("/")
    if (parts.length > 1) return parts[parts.length - 1]
    const colon = id.split(":")
    return colon[colon.length - 1] || id
  }
  return id
}

export function AtlasInlineSection({ systemName, path, jewel }: AtlasInlineSectionProps) {
  // Derive foothold + target from the path automatically.
  //
  // 2026-05-27 fix: previously filtered by `tier === "entry"` which in
  // the IAP schema means "network-control node" (SecurityGroup, VPC,
  // Subnet) — NOT the workload foothold the catalog needs. EC2/Lambda
  // nodes are actually tier === "identity". Derive by node TYPE instead:
  // catalog v0.1 understands workload footholds = EC2Instance and
  // LambdaFunction. AWSPrincipal-rooted paths (root-account access to
  // S3 etc.) have no workload foothold and ATLAS v0.1 cannot analyze
  // them — we render an explicit "not applicable" card so the section
  // never silently disappears.
  const startNodeId = useMemo(() => {
    const workloadNode = path.nodes?.find(
      (n) => n.type === "EC2Instance" || n.type === "LambdaFunction" || n.type === "Workload",
    )
    return workloadNode?.id ?? null
  }, [path.nodes])
  const targetNodeId = useMemo(
    () => jewel?.id ?? path.crown_jewel_id ?? null,
    [jewel?.id, path.crown_jewel_id],
  )

  const [response, setResponse] = useState<AtlasResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!startNodeId || !targetNodeId) {
      setResponse(null)
      setError(null)
      return
    }
    let canceled = false
    setLoading(true)
    setError(null)
    setResponse(null)
    fetch(`/api/proxy/atlas/search/${encodeURIComponent(systemName)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        start_node_id: startNodeId,
        target_node_id: targetNodeId,
        max_hops: 6,
      }),
    })
      .then(async (r) => {
        const j = await r.json().catch(() => null)
        if (canceled) return
        if (!r.ok) {
          setError(j?.detail || j?.error || `Backend ${r.status}`)
        } else {
          setResponse(j as AtlasResponse)
        }
      })
      .catch((e) => {
        if (!canceled) setError(String(e?.message ?? e))
      })
      .finally(() => {
        if (!canceled) setLoading(false)
      })
    return () => {
      canceled = true
    }
  }, [systemName, startNodeId, targetNodeId])

  // The section ALWAYS renders so the operator sees ATLAS exists, even
  // when this particular path isn't analyzable (e.g. AWSPrincipal-rooted
  // paths with no workload foothold — catalog v0.1 needs an EC2/Lambda
  // start). Silent-null returns previously left the operator wondering
  // whether the section was broken or just not relevant.
  const headerSummary = loading
    ? "loading…"
    : response
      ? `${response.chains.length} chain${response.chains.length === 1 ? "" : "s"} · ${response.elapsed_ms}ms · catalog ${response.catalog_version} · every chain replay-validated`
      : error
        ? "error"
        : !startNodeId
          ? "this path has no workload foothold — catalog v0.1 needs EC2 or Lambda"
          : !targetNodeId
            ? "no target identified for this path"
            : "—"

  return (
    <section className="border-t border-border bg-muted/30 px-4 py-3">
      <header className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-emerald-500" />
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
            ATLAS — deterministic chain search
          </h3>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
            v0.1
          </span>
        </div>
        <div className="text-[10px] text-muted-foreground italic">{headerSummary}</div>
      </header>

      {/* Not-applicable state — explicit so the operator never wonders
          if ATLAS broke. AWSPrincipal-rooted paths reach the jewel via
          standing IAM access; the v0.1 catalog only analyzes workload-
          foothold chains. */}
      {(!startNodeId || !targetNodeId) && (
        <div className="text-xs text-muted-foreground py-2 flex items-start gap-2">
          <Shield className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
          <span>
            {!startNodeId
              ? "ATLAS v0.1 analyzes attacker chains that start from a compromised workload (EC2 or Lambda). This path is identity-only — the principal already has standing access, no foothold capture needed."
              : "Target identifier missing on this path."}
          </span>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
          <Loader2 className="w-3 h-3 animate-spin" />
          Searching catalog chains from {shortId(startNodeId)} → {shortId(targetNodeId)}…
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 text-xs text-red-700 dark:text-red-300 py-2">
          <AlertCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {response && response.chains.length === 0 && !loading && (
        <div className="text-xs text-emerald-700 dark:text-emerald-300/80 py-2 flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-emerald-500" />
          No catalog-driven chain reaches{" "}
          <span className="text-foreground font-mono">{shortId(targetNodeId)}</span>{" "}
          from this foothold under the v0.1 primitive catalog. ATLAS does not
          fabricate chains.
        </div>
      )}

      {response && response.chains.length > 0 && (
        <div className="space-y-1.5">
          {response.chains.map((chain, i) => (
            <ChainRow key={chain.chain_id} chain={chain} index={i + 1} />
          ))}
        </div>
      )}

      {response && response.coverage_warnings.length > 0 && (
        <div className="mt-2 space-y-1">
          {response.coverage_warnings.map((w, i) => (
            <div
              key={i}
              className="text-[10px] text-amber-700 dark:text-amber-300 border border-amber-500/30 bg-amber-500/5 rounded px-2 py-1"
            >
              <span className="font-mono text-amber-700 dark:text-amber-300">{w.code}</span> {w.message}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function ChainRow({ chain, index }: { chain: AtlasChain; index: number }) {
  // Render the chain as a single horizontal row of primitive pills with
  // arrows between them. State-delta highlights inline under each step.
  return (
    <div className="rounded border border-red-500/30 bg-red-500/5 px-3 py-2">
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-red-700 dark:text-red-300">
          Chain {index}
        </span>
        <span className="font-mono text-[9px] text-muted-foreground">
          {chain.chain_id.slice(0, 12)}…
        </span>
        <span className="text-[10px] text-muted-foreground">
          · {chain.steps.length} hop{chain.steps.length === 1 ? "" : "s"} ·
          cost <span className="text-foreground">{chain.total_cost}</span> ·
          feasibility <span className="text-foreground">{Math.round(chain.feasibility_score * 100)}%</span>
        </span>
      </div>
      <div className="flex items-center flex-wrap gap-1">
        {chain.steps.map((step, idx) => (
          <StepPill key={step.step_index} step={step} isLast={idx === chain.steps.length - 1} />
        ))}
      </div>
      {chain.assumptions_consumed.length > 0 && (
        <div className="mt-1.5 flex items-center gap-1 flex-wrap">
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">assumes:</span>
          {chain.assumptions_consumed.map((a) => (
            <span
              key={a}
              className="text-[9px] font-mono px-1 py-0.5 rounded bg-muted text-foreground border border-border"
            >
              {a}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function StepPill({ step, isLast }: { step: AtlasChainStep; isLast: boolean }) {
  const d = step.state_delta
  // The "result" of the step in one short phrase (what changed in attacker state).
  const result =
    d.added_captured_identities[0] ??
    d.added_accessible_resources[0] ??
    d.added_compromised_workloads[0] ??
    d.added_synthetic_nodes[0]
  return (
    <>
      <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-red-500/10 border border-red-500/30 text-[11px]">
        <span className="font-mono font-semibold text-red-700 dark:text-red-300">{step.primitive_id}</span>
        {result && (
          <>
            <span className="text-muted-foreground">→</span>
            <span className="font-mono text-amber-700 dark:text-amber-300">{shortId(result)}</span>
          </>
        )}
      </div>
      {!isLast && <span className="text-muted-foreground text-[10px]">›</span>}
    </>
  )
}
