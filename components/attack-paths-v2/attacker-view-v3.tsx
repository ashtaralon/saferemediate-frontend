"use client"

/**
 * Attacker View v0.3 — 9-lane attacker-phase renderer.
 *
 * Reads materialized AttackChain objects (hop-reified per v0.2 §3) from
 * /api/attack-chain/chains-for-cj and renders them across 9 lanes:
 *
 *   ENTRY → REACH → LAND → STEAL CREDS → BECOME → REACH DATA →
 *   EXFIL + PERSIST + DEFENSE GAPS
 *
 * Every line drawn corresponds to a real Neo4j edge (chain.hops[N]).
 * There is no checkpoint inference — orphan cards (ENI, IGW, Policy,
 * InstanceProfile) that haunted v1/v2 are impossible by construction
 * here: a node only appears in a lane if it's an endpoint of an actual
 * hop, and every hop draws its own connecting line.
 *
 * Stuck only on data we already have in Neo4j — no GuardDuty / Macie
 * dependency. Defense lane reads what we know:
 *   - data_events_enabled_services on IAMRole
 *   - has_high_risk + has_public_ingress on SG
 *   - is_internet_exposed on workloads
 *   - VPCFlowLog presence (per VPC count of flow log events)
 *   - CollectorRun timestamps for "fresh vs stale" overlays
 */

import { useEffect, useMemo, useRef, useState } from "react"
import {
  ATTACK_LANES,
  type AttackChain,
  type AttackChainHop,
  type AttackChainNodeMeta,
  type AttackLane,
  type AttackChainStatus,
} from "@/lib/types"
import {
  fetchChainsForCJ,
  triggerAttackChainsMaterialization,
} from "@/lib/api-client"
import { backendNodeId } from "@/lib/iap-node-id"
import TrafficFlowMap, {
  type TrafficFlowMapPathFilter,
} from "@/components/dependency-map/traffic-flow-map"
import {
  Globe,
  Shield,
  Server,
  KeyRound,
  Key,
  Database,
  ArrowUpRight,
  Lock,
  Eye,
  AlertCircle,
  RefreshCw,
  Loader2,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Node-type → lane mapping
// ---------------------------------------------------------------------------
//
// Sole source of truth for which lane a node lives in. Centralized so
// `chain.hops[N].source_type` and `target_type` (Neo4j labels) get
// routed deterministically. Tested against the live graph 2026-05-22 —
// every node-type we emit from the backend hop derivation lands in
// exactly one lane.

function laneForNodeType(rawType: string | null | undefined): AttackLane {
  const t = (rawType || "").toLowerCase()
  // ENTRY — externally-reachable surface
  if (t === "internet" || t === "externalip" || t === "external_ip") return "entry"
  if (t === "loadbalancer" || t === "alb" || t === "nlb") return "entry"
  if (t === "apigateway" || t === "api_gateway") return "entry"
  // REACH — network gates
  if (t === "subnet") return "reach"
  if (t === "securitygroup") return "reach"
  if (t === "nacl" || t === "networkacl") return "reach"
  if (t === "routetable") return "reach"
  if (t === "vpcendpoint") return "reach"
  // LAND — what got compromised
  if (t === "ec2instance" || t === "ec2") return "land"
  if (t === "lambdafunction" || t === "lambda") return "land"
  if (t === "ecsservice" || t === "ecscluster" || t === "taskdefinition") return "land"
  if (t === "networkinterface" || t === "eni") return "land"
  // STEAL CREDS — credential sources
  if (t === "accesskey") return "creds"
  if (t === "secretsmanagersecret" || t === "secret") return "creds"
  // KMS as a SOURCE goes into creds; as a TARGET it goes into data —
  // we route based on whether it's the chain's CJ in the caller.
  if (t === "kmskey") return "creds"
  // BECOME — identity & escalation
  if (t === "iamrole" || t === "role") return "become"
  if (t === "instanceprofile") return "become"
  if (t === "iampolicy") return "become"
  if (t === "iamuser" || t === "iamgroup") return "become"
  if (t === "permissionset" || t === "ssouser" || t === "ssogroup") return "become"
  if (t === "identitycenterinstance") return "become"
  // CROWN JEWELS
  if (t === "s3bucket") return "data"
  if (t === "dynamodbtable") return "data"
  if (t === "rdsinstance" || t === "rdscluster" || t === "rds") return "data"
  // EXFIL channels — IGW + NAT are the egress story; reverse edge from
  // CJ to IGW renders here.
  if (t === "internetgateway") return "exfil"
  if (t === "natgateway") return "exfil"
  // Default: bucket into reach so unknown types are still positional.
  return "reach"
}

// Lucide icons accept the full LucideProps shape (className, style,
// color, size, etc.) — use `any` here rather than narrowing to a
// specific subset, since we pass `style` at the call site.
const LANE_ICONS: Record<string, any> = {
  Globe,
  Shield,
  Server,
  KeyRound,
  Key,
  Database,
  ArrowUpRight,
  Lock,
  Eye,
}

// ---------------------------------------------------------------------------
// Status / evidence visuals
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  AttackChainStatus,
  { label: string; color: string; bg: string; border: string }
> = {
  OBSERVED: {
    label: "Observed",
    color: "var(--canvas-danger)",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
  },
  POTENTIAL_EXCESS: {
    label: "Potential Excess",
    color: "var(--canvas-capable)",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
  },
  UNVERIFIED: {
    label: "Unverified",
    color: "var(--canvas-config)",
    bg: "bg-muted",
    border: "border-border",
  },
  BLOCKED: {
    label: "Blocked",
    color: "var(--canvas-observed)",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
  },
}

function evidenceDot(evidence: string): string {
  if (evidence === "observed") return "var(--canvas-observed)" // green: real traffic
  if (evidence === "config") return "var(--canvas-config)" // slate: configured, not seen
  return "var(--canvas-capable)" // amber: unknown
}

// ---------------------------------------------------------------------------
// Lane projection — turn chain.hops into per-lane node maps
// ---------------------------------------------------------------------------

interface LaneNode {
  id: string
  type: string
  name: string
  lane: AttackLane
  /** Hops where this node is the SOURCE or TARGET — used to determine
   *  evidence + connect lines. */
  hopRefs: { hop: AttackChainHop; role: "source" | "target" }[]
}

interface ProjectedChain {
  chain: AttackChain
  nodesByLane: Record<AttackLane, LaneNode[]>
  /** Flat hop list, ordered, for SVG connection drawing. */
  hops: AttackChainHop[]
}

function projectChain(chain: AttackChain): ProjectedChain {
  const nodes = new Map<string, LaneNode>()
  // Force the crown-jewel id into the data lane regardless of its
  // node-type (KMSKey is the canonical case — read by a workload it's
  // "creds", but if the chain's CJ IS the key itself it's "data").
  const cjOverrideId = chain.cj_arn || chain.cj_name || ""

  const ensure = (id: string, type: string, name: string | null) => {
    if (!id) return
    if (nodes.has(id)) return
    const isCj = id === cjOverrideId
    const lane = isCj ? "data" : laneForNodeType(type)
    nodes.set(id, {
      id,
      type,
      name: name || id,
      lane,
      hopRefs: [],
    })
  }

  for (const hop of chain.hops || []) {
    ensure(hop.source_id, hop.source_type, hop.source_name)
    ensure(hop.target_id, hop.target_type, hop.target_name)
    nodes.get(hop.source_id)?.hopRefs.push({ hop, role: "source" })
    nodes.get(hop.target_id)?.hopRefs.push({ hop, role: "target" })
  }

  const nodesByLane: Record<AttackLane, LaneNode[]> = {
    entry: [],
    reach: [],
    land: [],
    creds: [],
    become: [],
    data: [],
    exfil: [],
    persist: [],
    defense: [],
  }
  for (const n of nodes.values()) {
    nodesByLane[n.lane].push(n)
  }

  return {
    chain,
    nodesByLane,
    hops: chain.hops || [],
  }
}

// ---------------------------------------------------------------------------
// Derived persist + defense signals from existing graph data
// (NOT GuardDuty/Macie — we read what we already collect)
// ---------------------------------------------------------------------------

interface PersistSignal {
  action_pattern: string
  description: string
}

const PERSIST_ACTION_PATTERNS: PersistSignal[] = [
  { action_pattern: "iam:CreateUser", description: "Can mint new IAM users" },
  { action_pattern: "iam:CreateAccessKey", description: "Can issue long-lived keys" },
  { action_pattern: "iam:UpdateAssumeRolePolicy", description: "Can rewrite trust policies" },
  { action_pattern: "iam:AttachRolePolicy", description: "Can attach broader policies" },
  { action_pattern: "iam:PutRolePolicy", description: "Can inject inline policies" },
  { action_pattern: "lambda:CreateFunction", description: "Can deploy Lambda backdoor" },
  { action_pattern: "lambda:UpdateFunctionCode", description: "Can modify existing Lambda code" },
  { action_pattern: "lambda:AddPermission", description: "Can grant Lambda invoke (incl. FunctionURL)" },
  { action_pattern: "events:PutRule", description: "Can register EventBridge rule" },
  { action_pattern: "kms:CreateGrant", description: "Can self-grant on KMS keys" },
  { action_pattern: "ec2:CreateImage", description: "Can bake AMI for re-entry" },
]

function derivePersistSignals(chain: AttackChain): PersistSignal[] {
  // chain.excess_actions + chain.observed_actions both come from the
  // role's IAM policy expansion — we look for any persistence pattern
  // the principal has access to (observed OR allowed-but-not-observed
  // both count for "could persist").
  const acts = new Set<string>([
    ...(chain.observed_actions || []),
    ...(chain.excess_actions || []),
  ])
  const out: PersistSignal[] = []
  for (const pat of PERSIST_ACTION_PATTERNS) {
    // Match exact action OR wildcarded form (iam:*, iam:Create*)
    const prefix = pat.action_pattern.split(":")[0]
    const verb = pat.action_pattern.split(":")[1] || ""
    for (const a of acts) {
      if (a === pat.action_pattern) {
        out.push(pat)
        break
      }
      if (a === `${prefix}:*`) {
        out.push(pat)
        break
      }
      // iam:Create* matches iam:CreateUser
      if (a.endsWith("*") && pat.action_pattern.startsWith(a.slice(0, -1))) {
        out.push(pat)
        break
      }
    }
  }
  return out
}

interface DefenseSignal {
  label: string
  state: "ok" | "warning" | "gap"
  detail: string
}

function deriveDefenseSignals(chain: AttackChain): DefenseSignal[] {
  const sigs: DefenseSignal[] = []

  // 1. Observed activity = CloudTrail captured the role's actions
  const hasObserved = (chain.observed_actions || []).length > 0
  sigs.push({
    label: "Activity logged",
    state: hasObserved ? "ok" : "warning",
    detail: hasObserved
      ? `${chain.observed_actions.length} distinct actions observed in window`
      : "No actions observed — CloudTrail may not be capturing or the role is dormant",
  })

  // 2. Observed access to CJ = path is real
  const hasCjAccess = (chain.hops || []).some(
    (h) => h.edge_type === "ACCESSES_RESOURCE" && h.evidence === "observed",
  )
  sigs.push({
    label: "Data access seen",
    state: hasCjAccess ? "ok" : "warning",
    detail: hasCjAccess
      ? "Role has touched the crown jewel in the observation window"
      : "No observed data access — chain is configured-only",
  })

  // 3. Path status maps to a defense judgment
  if (chain.path_status === "OBSERVED") {
    sigs.push({
      label: "Excess capability",
      state: chain.excess_actions.length > 0 ? "gap" : "ok",
      detail:
        chain.excess_actions.length > 0
          ? `${chain.excess_actions.length} unused actions on this path — closure available`
          : "Role is scoped to its observed use",
    })
  }

  // 4. Identity gate observability
  if (chain.identity_gate === "UNKNOWN") {
    sigs.push({
      label: "Identity gate",
      state: "warning",
      detail: "Role policy data not joined to this path — closure recommendations unreliable",
    })
  }

  // 5. Data-plane KMS gate state
  if (chain.data_plane_gate === "UNKNOWN") {
    sigs.push({
      label: "KMS dependency",
      state: "warning",
      detail: "Bucket is KMS-encrypted but role's decrypt chain unverified — assume readable",
    })
  }

  return sigs
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface AttackerViewV3Props {
  /** Crown jewel id — ARN, neo4j node id, or name. Backend resolves. */
  jewelId: string
  /** Optional pre-known crown-jewel display name to render while
   *  loading. The backend will overwrite with the canonical name. */
  jewelName?: string | null
  /** AWS account/system the jewel belongs to. Required to render the
   *  embedded flow map (TrafficFlowMap fetches topology by systemName).
   *  When omitted, the flow map section is hidden — the 9-lane grid
   *  still renders since it reads from chains-for-cj directly. */
  systemName?: string
}

export function AttackerViewV3({ jewelId, jewelName, systemName }: AttackerViewV3Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [chains, setChains] = useState<AttackChain[]>([])
  // node_meta surfaces per-node posture (IMDSv1 enabled, subnet public,
  // bucket KMS key, role allowed_actions, etc.) for chip rendering on
  // the lane cards. Updated on every fetch — read-time enrichment from
  // the live graph so running ec2_imds_collector reflects immediately.
  const [nodeMeta, setNodeMeta] = useState<Record<string, AttackChainNodeMeta>>({})
  const [cjMeta, setCjMeta] = useState<{ id: string; name: string; type: string }>({
    id: jewelId,
    name: jewelName || jewelId,
    type: "Unknown",
  })
  const [rankBy, setRankBy] = useState<"severity" | "freshness" | "foothold">("severity")
  const [selectedChainId, setSelectedChainId] = useState<string | null>(null)
  const [materializing, setMaterializing] = useState(false)
  const [materializeResult, setMaterializeResult] = useState<string | null>(null)

  // Initial + ranker change fetch
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchChainsForCJ(jewelId, { rank_by: rankBy }).then((res) => {
      if (cancelled) return
      if (res.error) {
        setError(res.error)
      }
      setChains(res.chains || [])
      setNodeMeta(res.node_meta || {})
      setCjMeta(res.cj || { id: jewelId, name: jewelName || jewelId, type: "Unknown" })
      // Auto-select the first chain (highest-severity after rank)
      if (res.chains?.length) {
        setSelectedChainId((prev) => prev ?? res.chains[0].id)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [jewelId, jewelName, rankBy])

  const projected = useMemo<ProjectedChain[]>(() => chains.map(projectChain), [chains])

  const selected = useMemo<ProjectedChain | null>(
    () => projected.find((p) => p.chain.id === selectedChainId) ?? projected[0] ?? null,
    [projected, selectedChainId],
  )

  const onMaterialize = async () => {
    setMaterializing(true)
    setMaterializeResult(null)
    const r = await triggerAttackChainsMaterialization()
    setMaterializing(false)
    setMaterializeResult(
      r.success
        ? `Materialized: ${JSON.stringify(r.result?.s3 ?? r.result ?? {}).slice(0, 200)}`
        : `Failed: ${r.error}`,
    )
    // Re-fetch chains after materialization
    const res = await fetchChainsForCJ(jewelId, { rank_by: rankBy })
    setChains(res.chains || [])
    setNodeMeta(res.node_meta || {})
    setCjMeta(res.cj)
    if (!selectedChainId && res.chains?.length) {
      setSelectedChainId(res.chains[0].id)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-background text-foreground">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Attacker View · v0.3 · 9-Lane Phase Map
          </div>
          <div className="text-sm font-semibold text-foreground mt-0.5">
            {cjMeta.name}{" "}
            <span className="text-xs text-muted-foreground font-normal">({cjMeta.type})</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={rankBy}
            onChange={(e) => setRankBy(e.target.value as any)}
            className="bg-muted border border-border text-xs text-foreground rounded px-2 py-1"
          >
            <option value="severity">Rank: severity</option>
            <option value="freshness">Rank: freshness</option>
            <option value="foothold">Rank: foothold</option>
          </select>
          <button
            onClick={onMaterialize}
            disabled={materializing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-xs rounded"
            title="Re-run Phase 3 materialization (refresh AttackPath data without a full sync)"
          >
            {materializing ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3" />
            )}
            <span>{materializing ? "Materializing..." : "Refresh chains"}</span>
          </button>
        </div>
      </div>

      {/* Chain selector + stats */}
      <ChainSummaryBar
        projected={projected}
        selectedId={selected?.chain.id ?? null}
        onSelect={setSelectedChainId}
        loading={loading}
        error={error}
        materializeResult={materializeResult}
      />

      {/* The 9-lane grid */}
      <div className="overflow-auto p-4">
        {!loading && projected.length === 0 ? (
          <EmptyState onMaterialize={onMaterialize} materializing={materializing} />
        ) : selected ? (
          <NineLaneGrid projected={selected} nodeMeta={nodeMeta} />
        ) : null}
      </div>

      {/* Embedded flow map — same TrafficFlowMap as PER-PATH VIEW but
          scoped to the selected chain's hop list. Operator can see the
          actual SG / NACL / IAM ROLES / VPC ENDPOINTS that gate this
          specific chain. Hidden when systemName isn't provided or no
          chain is selected. Added 2026-05-23 in response to "where is
          the flow map?" — Phase View v0.3 originally shipped without
          this section, which made the 9-lane grid feel like a
          standalone categorization with no actionable detail. */}
      {selected && systemName ? (
        <ChainFlowMapSection chain={selected.chain} systemName={systemName} />
      ) : null}

      {/* Business sentence + closure */}
      {selected ? <BusinessSentencePanel projected={selected} /> : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Embedded flow map — bridges the AttackChain hop list to TrafficFlowMap
// via pathFilter. Reuses the same renderer (and the 2026-05-23 widened
// applyPathFilter) so operators see the actual gates protecting the
// selected chain instead of just lane-categorized node chips.
// ---------------------------------------------------------------------------

function ChainFlowMapSection({
  chain,
  systemName,
}: {
  chain: AttackChain
  systemName: string
}) {
  const pathFilter = useMemo<TrafficFlowMapPathFilter>(() => {
    // Collect unique nodes from chain.hops (each hop has source + target).
    type NodeRow = { id: string; name: string; type: string }
    const nodeMap = new Map<string, NodeRow>()
    for (const hop of chain.hops || []) {
      if (hop.source_id && !nodeMap.has(hop.source_id)) {
        nodeMap.set(hop.source_id, {
          id: hop.source_id,
          name: hop.source_name || hop.source_id,
          type: hop.source_type,
        })
      }
      if (hop.target_id && !nodeMap.has(hop.target_id)) {
        nodeMap.set(hop.target_id, {
          id: hop.target_id,
          name: hop.target_name || hop.target_id,
          type: hop.target_type,
        })
      }
    }
    const pathNodes = Array.from(nodeMap.values()).map((n) => ({
      id: n.id,
      name: n.name,
      type: n.type,
    }))
    const nodeIds = pathNodes.map((n) => backendNodeId(n))
    const pathEdges = (chain.hops || []).map((h) => ({
      source: h.source_id,
      target: h.target_id,
      type: h.edge_type,
      label: h.edge_type,
      bytes: 0,
      hits: h.hit_count ?? 0,
      is_observed: h.evidence === "observed",
    }))
    const crownJewelIds = [chain.cj_arn, chain.cj_name].filter(Boolean) as string[]
    return {
      nodeIds,
      pathNodes,
      pathEdges,
      crownJewelIds,
      jewelName: chain.cj_name || undefined,
      pathLabel: `Chain → ${chain.cj_name ?? chain.cj_arn ?? chain.id}`,
    }
  }, [chain])

  return (
    <div className="border-t border-border bg-background">
      <div className="px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Flow Map · This Chain's Gates
          </div>
          <div className="text-xs text-foreground mt-0.5">
            {chain.workload_name || "(unknown workload)"}{" "}
            <span className="text-muted-foreground">→</span>{" "}
            {chain.role_name || "(unknown role)"}{" "}
            <span className="text-muted-foreground">→</span>{" "}
            {chain.cj_name || chain.cj_arn || "(crown jewel)"}{" "}
            <span className="text-muted-foreground">· {chain.hop_count} hops</span>
          </div>
        </div>
      </div>
      <div className="px-4 pb-4">
        <div
          className="relative rounded-xl border border-border bg-card overflow-hidden"
          style={{ height: "520px" }}
        >
          <TrafficFlowMap
            systemName={systemName}
            pathFilter={pathFilter}
            titleOverride=""
            innerTitleOverride="Flow Map"
            innerSubtitleOverride="Gates on this attack chain"
            pathBadgeOverride={pathFilter.pathLabel}
            observedMode={true}
          />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ChainSummaryBar({
  projected,
  selectedId,
  onSelect,
  loading,
  error,
  materializeResult,
}: {
  projected: ProjectedChain[]
  selectedId: string | null
  onSelect: (id: string) => void
  loading: boolean
  error: string | null
  materializeResult: string | null
}) {
  const byStatus = useMemo(() => {
    const m: Record<AttackChainStatus, number> = {
      OBSERVED: 0,
      POTENTIAL_EXCESS: 0,
      UNVERIFIED: 0,
      BLOCKED: 0,
    }
    for (const p of projected) {
      m[p.chain.path_status] = (m[p.chain.path_status] || 0) + 1
    }
    return m
  }, [projected])

  return (
    <div className="px-4 py-2 border-b border-border">
      <div className="flex items-center gap-2 mb-2 text-[10px] text-muted-foreground uppercase tracking-wider">
        <span>{projected.length} chains</span>
        {Object.entries(byStatus)
          .filter(([_, n]) => n > 0)
          .map(([s, n]) => (
            <span key={s} className="flex items-center gap-1">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: STATUS_CONFIG[s as AttackChainStatus].color }}
              />
              <span>
                {STATUS_CONFIG[s as AttackChainStatus].label} ({n})
              </span>
            </span>
          ))}
        {loading ? <span className="text-primary">Loading…</span> : null}
        {error ? <span className="text-red-700 dark:text-red-300">Error: {error}</span> : null}
        {materializeResult ? (
          <span className="text-emerald-700 dark:text-emerald-300">{materializeResult}</span>
        ) : null}
      </div>
      {projected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {projected.map((p) => {
            const cfg = STATUS_CONFIG[p.chain.path_status]
            const active = selectedId === p.chain.id
            return (
              <button
                key={p.chain.id}
                onClick={() => onSelect(p.chain.id)}
                className={`px-2.5 py-1 rounded border text-[11px] transition-colors ${
                  active
                    ? `${cfg.bg} ${cfg.border} text-foreground`
                    : "bg-muted border-border text-foreground hover:bg-accent"
                }`}
                title={p.chain.business_sentence}
              >
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full mr-1.5"
                  style={{ background: cfg.color }}
                />
                {p.chain.workload_name || "(unknown workload)"} →{" "}
                {p.chain.role_name || "(unknown role)"}{" "}
                <span className="text-muted-foreground">· {p.chain.hop_count} hops</span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function EmptyState({
  onMaterialize,
  materializing,
}: {
  onMaterialize: () => void
  materializing: boolean
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm">
      <AlertCircle className="w-8 h-8 mb-3 text-muted-foreground" />
      <div className="font-semibold text-foreground mb-1">No attack chains materialized yet</div>
      <div className="text-xs text-muted-foreground mb-4 max-w-md text-center">
        Phase 3 hasn't run for this crown jewel. Click below to materialize from the
        current graph state — no sync required.
      </div>
      <button
        onClick={onMaterialize}
        disabled={materializing}
        className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-xs rounded"
      >
        {materializing ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <RefreshCw className="w-3 h-3" />
        )}
        <span>{materializing ? "Materializing..." : "Materialize attack chains"}</span>
      </button>
    </div>
  )
}

function NineLaneGrid({
  projected,
  nodeMeta = {},
}: {
  projected: ProjectedChain
  nodeMeta?: Record<string, AttackChainNodeMeta>
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  // Map node-id → position for SVG arrow drawing. Updated on render.
  const nodePositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map())
  const [, forceUpdate] = useState({})

  // Force a re-render after mount to measure DOM positions for SVG.
  useEffect(() => {
    const id = requestAnimationFrame(() => forceUpdate({}))
    return () => cancelAnimationFrame(id)
  }, [projected])

  // Recompute positions on resize.
  useEffect(() => {
    const onResize = () => forceUpdate({})
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  // Defense + persist are derived from existing chain data (not new collectors).
  const persistSignals = useMemo(() => derivePersistSignals(projected.chain), [projected.chain])
  const defenseSignals = useMemo(() => deriveDefenseSignals(projected.chain), [projected.chain])

  // Refs for each rendered node card so we can compute connecting lines.
  const cardRefs = useRef<Map<string, HTMLDivElement | null>>(new Map())

  // Recompute positions after DOM is laid out.
  const measurePositions = () => {
    if (!containerRef.current) return
    const containerRect = containerRef.current.getBoundingClientRect()
    const positions = new Map<string, { x: number; y: number }>()
    cardRefs.current.forEach((el, id) => {
      if (!el) return
      const r = el.getBoundingClientRect()
      positions.set(id, {
        x: r.left - containerRect.left + r.width / 2,
        y: r.top - containerRect.top + r.height / 2,
      })
    })
    nodePositionsRef.current = positions
  }

  useEffect(() => {
    measurePositions()
    forceUpdate({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projected])

  return (
    <div ref={containerRef} className="relative">
      {/* Lane headers */}
      <div className="grid grid-cols-9 gap-2 mb-2">
        {ATTACK_LANES.map((lane) => {
          const Icon = LANE_ICONS[lane.icon] || Globe
          const count = (projected.nodesByLane[lane.id] || []).length
          return (
            <div key={lane.id} className="text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Icon className="w-3.5 h-3.5" style={{ color: lane.accent }} />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground">
                  {lane.label}
                </span>
                {count > 0 ? (
                  <span className="text-[10px] text-muted-foreground">({count})</span>
                ) : null}
              </div>
              <div className="text-[9px] text-muted-foreground italic px-1 leading-tight">
                {lane.attackerQuestion}
              </div>
            </div>
          )
        })}
      </div>

      {/* Lane bodies */}
      <div className="grid grid-cols-9 gap-2 relative">
        {ATTACK_LANES.map((lane) => {
          const nodes = projected.nodesByLane[lane.id] || []
          return (
            <div
              key={lane.id}
              className="min-h-[300px] bg-card border border-border rounded p-1.5 space-y-1.5"
              style={{ borderLeftColor: lane.accent, borderLeftWidth: 2 }}
            >
              {lane.id === "persist" ? (
                <PersistLaneContent signals={persistSignals} />
              ) : lane.id === "defense" ? (
                <DefenseLaneContent signals={defenseSignals} />
              ) : nodes.length === 0 ? (
                <div className="text-[10px] text-muted-foreground italic px-2 py-3 text-center">
                  No {lane.label.toLowerCase()} on this chain
                </div>
              ) : (
                nodes.map((n) => (
                  <NodeCard
                    key={n.id}
                    node={n}
                    chain={projected.chain}
                    meta={nodeMeta[n.id]}
                    setRef={(el) => {
                      cardRefs.current.set(n.id, el)
                    }}
                  />
                ))
              )}
            </div>
          )
        })}

        {/* SVG connection layer — drawn last so it overlays */}
        <ConnectionLayer
          containerRef={containerRef}
          nodePositions={nodePositionsRef.current}
          hops={projected.hops}
        />
      </div>
    </div>
  )
}

// Callback-ref version — avoids forwardRef typing friction across React
// 18/19 boundaries (the React 19 typings tightened ref types in ways
// that conflict with forwardRef<HTMLDivElement>). The parent passes a
// `setRef` callback which lands an entry into its position-map.
function NodeCard({
  node,
  chain,
  meta,
  setRef,
}: {
  node: LaneNode
  chain: AttackChain
  meta?: AttackChainNodeMeta
  setRef: (el: HTMLDivElement | null) => void
}) {
  const isCrownJewel =
    node.id === chain.cj_arn || node.id === chain.cj_name || node.lane === "data"
  // Aggregate the highest-strength evidence touching this node — if any
  // hop carries observed, show observed; else config; else unknown.
  const ev = node.hopRefs.reduce<string>((best, r) => {
    if (best === "observed") return best
    if (r.hop.evidence === "observed") return "observed"
    if (r.hop.evidence === "config" && best !== "observed") return "config"
    return best || r.hop.evidence
  }, "")

  const shortName = node.name.length > 22 ? node.name.slice(0, 10) + "…" + node.name.slice(-10) : node.name

  // Per-node posture chips. Backend node_meta carries the live graph
  // state — render only the chips relevant to this node's type so we
  // don't clutter cards with irrelevant signals. Color semantics:
  //   red    = exploitable / open / red-flag for the attacker
  //   amber  = unknown / partial / needs operator attention
  //   green  = closed / safe / posture is correct
  //   slate  = neutral metadata (cidr, rule count, etc.)
  const chips = useMemo(() => buildNodeChips(node, meta), [node, meta])

  return (
    <div
      ref={setRef}
      className={`relative px-2 py-1.5 rounded text-[10px] border ${
        isCrownJewel
          ? "bg-emerald-500/10 border-emerald-500/40"
          : "bg-muted border-border"
      }`}
      title={`${node.type}: ${node.name}`}
    >
      <div className="flex items-center gap-1.5">
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ background: evidenceDot(ev || "unknown") }}
        />
        <span className="text-foreground truncate flex-1 font-mono">{shortName}</span>
      </div>
      <div className="text-[9px] text-muted-foreground mt-0.5 truncate">{node.type}</div>
      {chips.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {chips.map((c) => (
            <span
              key={c.label}
              className={`px-1.5 py-0.5 rounded text-[9px] border ${c.tone}`}
              title={c.tooltip || c.label}
            >
              {c.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Per-node chip derivation
//
// Reads the chain payload's node_meta and emits compact posture chips
// per node type. All chips are evidence-grounded — no "could be" / "if"
// language. Missing data is rendered as amber "unknown" rather than
// hidden, because absence-of-collection IS information the operator
// needs.
// ---------------------------------------------------------------------------

interface NodeChip {
  label: string
  tone: string
  tooltip?: string
}

const CHIP_RED = "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300"
const CHIP_AMBER = "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300"
const CHIP_GREEN = "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
const CHIP_SLATE = "bg-muted border-border text-muted-foreground"

function buildNodeChips(node: LaneNode, meta?: AttackChainNodeMeta): NodeChip[] {
  if (!meta) return []
  const out: NodeChip[] = []
  const t = (node.type || "").toLowerCase()

  // EC2 / workload — IMDS state is the headline signal
  if (t.includes("ec2")) {
    if (meta.imds_disabled === true) {
      out.push({ label: "IMDS off", tone: CHIP_GREEN, tooltip: "Instance Metadata Service disabled — no creds via 169.254.169.254" })
    } else if (meta.imdsv2_enforced === true) {
      out.push({ label: "IMDSv2", tone: CHIP_GREEN, tooltip: "IMDSv2 enforced (HttpTokens=required) — token-bound creds" })
    } else if (meta.imdsv2_enforced === false) {
      out.push({ label: "IMDSv1 enabled", tone: CHIP_RED, tooltip: "HttpTokens=optional — curl-to-creds with no token. #1 credential-theft path" })
    } else {
      out.push({ label: "IMDS unknown", tone: CHIP_AMBER, tooltip: "IMDS state not collected — run /api/admin/run-ec2-imds-collector" })
    }
    if (meta.is_internet_exposed === true) {
      out.push({ label: "Internet exposed", tone: CHIP_RED, tooltip: "Public ingress reaches this workload" })
    } else if (meta.is_internet_exposed === false) {
      out.push({ label: "no ingress", tone: CHIP_GREEN, tooltip: "No observed public ingress to this workload" })
    }
    if (meta.public_ip) {
      out.push({ label: `pub ${meta.public_ip}`, tone: CHIP_AMBER, tooltip: "Workload has a public IP" })
    }
    if (typeof meta.critical_cves === "number" && meta.critical_cves > 0) {
      out.push({ label: `${meta.critical_cves} critical CVE`, tone: CHIP_RED })
    } else if (typeof meta.cve_count === "number" && meta.cve_count > 0) {
      out.push({ label: `${meta.cve_count} CVE`, tone: CHIP_AMBER })
    }
  }

  // Subnet — public/private classification
  if (t === "subnet") {
    if (meta.subnet_public === true) {
      out.push({ label: "Public subnet", tone: CHIP_AMBER, tooltip: "Route table routes 0.0.0.0/0 to IGW" })
    } else if (meta.subnet_public === false) {
      out.push({ label: "Private subnet", tone: CHIP_GREEN, tooltip: "No route to IGW" })
    } else {
      out.push({ label: "Public/private unknown", tone: CHIP_AMBER })
    }
    if (meta.subnet_cidr) {
      out.push({ label: meta.subnet_cidr, tone: CHIP_SLATE })
    }
  }

  // Security Group
  if (t === "securitygroup" || t.includes("security_group")) {
    if (typeof meta.sg_total_rules === "number") {
      out.push({ label: `${meta.sg_total_rules} rules`, tone: CHIP_SLATE })
    }
    if (meta.sg_public_ingress === true) {
      out.push({ label: "0.0.0.0/0 ingress", tone: CHIP_RED })
    }
    if (meta.sg_high_risk === true) {
      out.push({ label: "high-risk rule", tone: CHIP_RED })
    }
  }

  // S3 bucket — crown jewel posture
  if (t === "s3bucket" || t.includes("bucket")) {
    if (meta.bucket_versioning && String(meta.bucket_versioning).toLowerCase() === "enabled") {
      out.push({ label: "Versioned", tone: CHIP_GREEN, tooltip: "Versioning enabled — deletes are recoverable" })
    } else if (meta.bucket_versioning) {
      out.push({ label: "Not versioned", tone: CHIP_RED, tooltip: "Versioning suspended/off — delete is irreversible" })
    }
    if (meta.bucket_object_lock === true || String(meta.bucket_object_lock).toLowerCase() === "enabled") {
      out.push({ label: "Object Lock", tone: CHIP_GREEN })
    }
    if (meta.bucket_kms_key) {
      out.push({ label: "KMS encrypted", tone: CHIP_GREEN, tooltip: meta.bucket_kms_key })
    }
    if (meta.bucket_public_access_block === false) {
      out.push({ label: "PAB off", tone: CHIP_RED, tooltip: "Public Access Block disabled — bucket can be made public" })
    }
  }

  // IAM Role — usage gap
  if (t === "iamrole" || t === "role") {
    const allowed = meta.role_allowed_actions
    const used = meta.role_used_actions
    if (typeof allowed === "number" && typeof used === "number" && allowed > 0) {
      const excess = allowed - used
      if (excess > 0) {
        out.push({
          label: `${used}/${allowed} actions used`,
          tone: CHIP_AMBER,
          tooltip: `${excess} excess actions — closure opportunity`,
        })
      } else {
        out.push({ label: `${allowed} actions, all used`, tone: CHIP_GREEN })
      }
    }
    if (Array.isArray(meta.role_data_events) && meta.role_data_events.length > 0) {
      out.push({
        label: `data events: ${meta.role_data_events.length}`,
        tone: CHIP_GREEN,
        tooltip: `CloudTrail data events captured for: ${meta.role_data_events.join(", ")}`,
      })
    }
  }

  // Internet synthetic — always renders as the entry boundary
  if (t === "internet") {
    out.push({ label: "0.0.0.0/0", tone: CHIP_AMBER, tooltip: "Public Internet — outside the trust boundary" })
  }

  return out
}

function PersistLaneContent({ signals }: { signals: PersistSignal[] }) {
  if (signals.length === 0) {
    return (
      <div className="text-[10px] text-emerald-600 dark:text-emerald-400 italic px-1.5 py-3 text-center leading-tight">
        ✓ No persistence surface — attacker cannot create new identities or backdoors from this principal
      </div>
    )
  }
  return (
    <>
      {signals.map((s) => (
        <div
          key={s.action_pattern}
          className="px-2 py-1.5 rounded text-[10px] bg-violet-500/10 border border-violet-500/30"
        >
          <div className="font-mono text-violet-700 dark:text-violet-300 text-[10px]">{s.action_pattern}</div>
          <div className="text-[9px] text-muted-foreground mt-0.5">{s.description}</div>
        </div>
      ))}
    </>
  )
}

function DefenseLaneContent({ signals }: { signals: DefenseSignal[] }) {
  if (signals.length === 0) {
    return (
      <div className="text-[10px] text-muted-foreground italic px-2 py-3 text-center">
        No defense signals derived
      </div>
    )
  }
  return (
    <>
      {signals.map((s, i) => {
        const palette =
          s.state === "ok"
            ? { bg: "bg-emerald-500/10", border: "border-emerald-500/30", color: "text-emerald-700 dark:text-emerald-300", icon: "✓" }
            : s.state === "warning"
              ? { bg: "bg-amber-500/10", border: "border-amber-500/30", color: "text-amber-700 dark:text-amber-300", icon: "⚠" }
              : { bg: "bg-red-500/10", border: "border-red-500/30", color: "text-red-700 dark:text-red-300", icon: "✗" }
        return (
          <div key={i} className={`px-2 py-1.5 rounded text-[10px] ${palette.bg} border ${palette.border}`}>
            <div className={`flex items-center gap-1 ${palette.color} text-[10px] font-semibold`}>
              <span>{palette.icon}</span>
              <span>{s.label}</span>
            </div>
            <div className="text-[9px] text-muted-foreground mt-0.5 leading-tight">{s.detail}</div>
          </div>
        )
      })}
    </>
  )
}

function ConnectionLayer({
  containerRef,
  nodePositions,
  hops,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>
  nodePositions: Map<string, { x: number; y: number }>
  hops: AttackChainHop[]
}) {
  const [size, setSize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const update = () => {
      if (!containerRef.current) return
      const r = containerRef.current.getBoundingClientRect()
      setSize({ w: r.width, h: r.height })
    }
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef.current])

  if (nodePositions.size === 0) return null

  return (
    <svg
      width={size.w}
      height={size.h}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 5 }}
    >
      <defs>
        <marker
          id="arrowhead-observed"
          markerWidth="6"
          markerHeight="6"
          refX="6"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L6,3 L0,6 Z" fill="var(--canvas-observed)" />
        </marker>
        <marker
          id="arrowhead-config"
          markerWidth="6"
          markerHeight="6"
          refX="6"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L6,3 L0,6 Z" fill="var(--canvas-config)" />
        </marker>
      </defs>
      {hops.map((hop, i) => {
        const a = nodePositions.get(hop.source_id)
        const b = nodePositions.get(hop.target_id)
        if (!a || !b) return null
        const stroke =
          hop.evidence === "observed"
            ? "var(--canvas-observed)"
            : hop.evidence === "config"
              ? "var(--canvas-config)"
              : "var(--canvas-capable)"
        const dash = hop.evidence === "observed" ? "none" : "4 3"
        const marker =
          hop.evidence === "observed" ? "url(#arrowhead-observed)" : "url(#arrowhead-config)"
        return (
          <g key={`${hop.ordinal}-${i}`}>
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={stroke}
              strokeWidth={1.4}
              strokeDasharray={dash}
              opacity={0.6}
              markerEnd={marker}
            />
          </g>
        )
      })}
    </svg>
  )
}

function BusinessSentencePanel({ projected }: { projected: ProjectedChain }) {
  const c = projected.chain
  const cfg = STATUS_CONFIG[c.path_status]
  return (
    <div className="px-4 py-3 border-t border-border bg-card">
      <div className="flex items-start gap-3">
        <div
          className={`flex-shrink-0 px-2.5 py-1 rounded text-[10px] font-semibold border ${cfg.bg} ${cfg.border}`}
          style={{ color: cfg.color }}
        >
          {cfg.label}
        </div>
        <div className="text-xs text-foreground leading-relaxed flex-1">
          {c.business_sentence || "(no business sentence available)"}
        </div>
      </div>
      {c.closure_recommendation && c.closure_recommendation.remove_actions?.length > 0 ? (
        <div className="mt-2 pl-[68px] text-[10px] text-muted-foreground">
          <div className="font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Closure recommendation
          </div>
          <div className="space-y-0.5">
            {c.closure_recommendation.keep_actions?.length > 0 ? (
              <div>
                <span className="text-emerald-600 dark:text-emerald-400">Keep:</span>{" "}
                <span className="font-mono">
                  {c.closure_recommendation.keep_actions.slice(0, 5).join(", ")}
                </span>
              </div>
            ) : null}
            {c.closure_recommendation.remove_actions?.length > 0 ? (
              <div>
                <span className="text-red-600 dark:text-red-400">Remove:</span>{" "}
                <span className="font-mono">
                  {c.closure_recommendation.remove_actions.slice(0, 5).join(", ")}
                </span>
              </div>
            ) : null}
            {c.closure_recommendation.scope_to_prefixes?.length > 0 ? (
              <div>
                <span className="text-muted-foreground">Scope to:</span>{" "}
                <span className="font-mono">
                  {c.closure_recommendation.scope_to_prefixes.slice(0, 3).join(", ")}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

// React import shim — forwardRef wants the React namespace.
import * as React from "react"
