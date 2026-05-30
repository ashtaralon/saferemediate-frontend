"use client"

/**
 * EXFIL View v3 — single dynamic flow map (greenfield rebuild 2026-05-26).
 *
 * STRUCTURAL TWIN of attacker-view-panel.tsx: one Header + one full-
 * height TrafficFlowMap. No static lane grid, no embedded sub-map, no
 * NotWired footer — those layers from the prior v3 attempt produced
 * the "looks really messy and bad" reaction (Alon, 2026-05-26). This
 * file is the single-map rewrite.
 *
 * Direction inverted vs Attacker View — BFS-forward from the crown
 * jewel. The 9-lane design (exfil-map-design.md §3) is enforced by
 * mapping each lane to one of TFM's existing SystemArchitecture
 * fields, so the canvas naturally lays out 9 columns left-to-right:
 *
 *   1. CJ SOURCE            → entryPoints   (entryLaneLabel="Source")
 *   2. READER PRINCIPAL     → iamRoles + principals
 *   3. READER WORKLOAD      → computeServices
 *   4. STAGING              → (no collector today — honest absence,
 *                              no fabricated card)
 *   5. EGRESS GATE          → securityGroups + nacls
 *   6. EGRESS PATH          → subnets + egressGateways + vpcEndpoints
 *   7. EXFIL CHANNEL        → exfilGate  (typed virtual gate, strength-
 *                              colored: emerald/blue/amber)
 *   8. EXTERNAL DESTINATION → resources
 *   9. DEFENSE              → workloadNetwork banner overlay (TFM's
 *                              evidence-backed "Non-VPC Workload" panel)
 *
 * Reads /api/proxy/attack-chain/exfil-paths (no backend change). Every
 * card on screen traces to a real Neo4j edge resolved by that endpoint;
 * lanes the graph can't fill today render empty rather than mocked.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { ArrowRight, ChevronDown, Crown, Route, AlertTriangle, RefreshCw, Loader2, ExternalLink, Globe, ShieldCheck } from "lucide-react"
import { useRetryFetch } from "@/lib/use-retry-fetch"
import { FreshnessBanner } from "@/components/freshness-banner"
import { postSplitPlan } from "@/lib/api-client"
import { RoleDetailPanel } from "./exfil-role-detail-panel"
import type { CrownJewelSummary } from "@/components/identity-attack-paths/types"
import type {
  SystemArchitecture,
  ServiceNode,
  SubnetNode,
  SecurityCheckpoint,
  EgressGatewayNode,
  ExfilGateNode,
  TrafficFlow,
} from "@/components/dependency-map/traffic-flow-map"
import type { CanvasEdge, CanvasRelationshipType } from "@/lib/types/attack-canvas"

// Heavy renderer — lazy-load so the v2 page doesn't pull the full dep-map
// bundle until the operator switches to exfil view. Same load pattern as
// attacker-view-panel.tsx.
const TrafficFlowMap = dynamic(
  () => import("@/components/dependency-map/traffic-flow-map"),
  { ssr: false },
)

// ─── Backend response types — mirror api/exfil_paths.py shape ─────

// Blast-radius lateral surfaces — populated by the backend's
// _attach_accessor_blast_radius pass (api/exfil_paths.py). Both lists
// answer the question "what ELSE does this role unlock?" — the
// operational signal Alon called "our killer solution":
//   also_reaches: same accessor → other jewels (cross-bucket lateral)
//   shared_with:  other workloads → same role (cross-workload lateral)
export interface BlastRadiusJewel {
  id: string
  name: string
  type: string
  hits: number
}
export interface BlastRadiusConsumer {
  id: string
  name: string
  type: string
  system_name: string | null
}

// ATLAS multi-hop chain enrichment — Layer A of the killer-solution
// stack (2026-05-27). Populated by api/exfil_paths.py's
// _attach_atlas_enrichment when include_atlas=true. Each path's
// (workload, jewel) pair gets one ATLAS engine call; the slim
// summary below is what reaches the UI. Null when the engine failed
// or timed out for this pair — rendered as "ATLAS unavailable", NEVER
// as "no chains" (that would fabricate a clean posture from an error).
export interface AtlasChainStep {
  chain_id: string
  step_count: number
  primitives_used: string[]
  blocking_controls: string[]
  feasibility_score: number
  // Layer B (2026-05-27) — union of state_delta adds across every
  // step of the chain. Used downstream by keystone aggregation; the
  // pill itself does not render this list.
  traversed_node_ids?: string[]
}
export interface AtlasChainSummary {
  chain_count: number
  dead_end_count: number
  chains: AtlasChainStep[]
  catalog_version: string
  engine_version: string
  elapsed_ms: number
  coverage_warnings: Array<{ code: string; message: string }>
}

// Layer B (2026-05-27) — top-level ATLAS rollup attached to the
// EXFIL payload when include_atlas=true. Drives the "ATLAS · N
// chains across M paths" header pill AND the empty-state copy when
// no chains are returned (surfaces coverage_warnings instead of a
// fabricated "safe" message).
export interface AtlasSummary {
  enabled: boolean
  total_chains: number
  total_dead_ends: number
  pairs_called: number
  pairs_succeeded: number
  pairs_failed: number
  coverage_warnings: Array<{ code: string; message: string }>
  catalog_version: string | null
  engine_version: string | null
}

// Layer B (2026-05-27) — a "keystone" is a graph node that appears
// in many ATLAS-validated chains for this crown jewel. Killing one
// keystone drops N chains at once. Backend filters out the jewel
// itself (trivial 100% match, no actionable remediation), and
// drops synthetic IDs that don't back to a real graph node.
//
// Layer C (2026-05-27) — node_arn + active_plan_id added for the
// deep-link CTA. node_arn is non-null only for IAMRole nodes (the
// only type with a shared-roles split-plan flow today).
// active_plan_id is non-null when a plan already exists → CTA can
// navigate in one click. Null → CTA POSTs to mint then navigates.
export interface ExfilKeystone {
  node_id: string
  node_name: string
  node_labels: string[]
  system_name: string | null
  chain_count_killed: number
  chain_count_total: number
  pct_killed: number
  sample_chain_ids: string[]
  node_arn?: string | null
  active_plan_id?: string | null
}

interface ExfilAccessor {
  id: string
  name: string
  type: string
  provenance: "capable" | "observed"
  allowed_actions_count: number | null
  used_actions_count: number | null
  unused_actions_count: number | null
  rel_types: string[]
  hit_count: number
  total_bytes: number
  last_seen: string | null
  also_reaches?: BlastRadiusJewel[]
  shared_with?: BlastRadiusConsumer[]
}

interface ExfilNetworkEgressItem {
  kind: string
  id: string
  name: string
  channel?: string
  accessor_id?: string
  accessor_name?: string
  // 2026-05-30 — route provenance from backend:
  //   routed=true  → the subnet's route table actually targets this
  //                  gateway. AUTHORITATIVE for "where bytes go".
  //   routed=false → gateway exists in the VPC but no route points
  //                  at it. Capability hint only — backend drops
  //                  these from the merged set when routed gateways
  //                  exist for the same subnet.
  // route_destination_cidr / route_target_service describe WHAT the
  // route is for: "0.0.0.0/0" for default routes via IGW/NAT,
  // "com.amazonaws.<region>.s3" for Gateway VPCEs.
  service_name?: string | null
  routed?: boolean
  route_destination_cidr?: string | null
  route_target_service?: string | null
  via_workload: { id: string; name: string; type: string }
  via_subnet: {
    id: string
    name: string
    public: boolean | null
    route_table?: {
      id: string
      name: string
      route_count?: number | null
      is_main?: boolean | null
    } | null
  }
  via_vpc: { id: string; name: string }
  via_security_groups?: Array<{
    id: string
    name: string
    inbound_rule_count?: number | null
    outbound_rule_count?: number | null
    has_public_ingress?: boolean | null
  }>
  provenance: "capable" | "observed"
}

interface WorkloadNetworkPayload {
  is_vpc_attached: boolean
  vpc_id: string | null
  vpc_name: string | null
  subnets: Array<{ id: string; name: string | null; is_public: boolean | null }>
  security_groups: Array<{ id: string; name: string | null }>
  evidence: string
  workload_count_queried: number
  workload_count_in_sample: number
}

// Layer A v2 (2026-05-27) — stack-components enrichment. Fills the
// empty PRINCIPALS / IAM POLICIES / INSTANCE PROFILES / API CALLS
// sidebar lanes that previously read as "Cyntro found nothing."
export interface StackComponentsPrincipal {
  id: string
  arn: string
  session_name: string
  calls: number
  last_seen: string | null
}
export interface StackComponentsPolicy {
  id: string
  name: string
  arn: string | null
  attachment_type: string | null
  is_aws_managed: boolean | null
}
export interface StackComponentsApiCall {
  action: string
  calls: number
  last_seen: string | null
}
export interface StackComponentsInstanceProfile {
  id: string
  arn: string
  name: string
  attached_count: number
}
export interface StackComponentsPayload {
  principals: StackComponentsPrincipal[]
  iam_policies: StackComponentsPolicy[]
  api_calls: StackComponentsApiCall[]
  instance_profiles: StackComponentsInstanceProfile[]
}

// Neo4j-grounded remediation prescriptions — populated by the
// backend's _attach_remediation (api/exfil_paths.py). Every field
// here is either a Cypher row result or an honest null/empty.
export interface RemediationIAM {
  allowed_actions: string[]
  used_actions: string[]
  unused_actions: string[]
  observed_not_in_allowed: string[]
  destructive_unused: string[]
  used_cached_was_stale: boolean
  // Honesty gate — true when the role HAS policies (via edges or
  // property names) but allowed_actions list is empty. Means
  // lp_collector hasn't expanded the policies; cannot diff.
  allowed_not_collected?: boolean
  policy_edge_count?: number
  attached_policy_names_count?: number
  inline_policy_names_count?: number
  // Authoritative observed footprint when allowed_not_collected
  observed_actions?: string[]
}
export interface RemediationSGRule {
  direction: string
  protocol: string
  from_port: number
  to_port: number
  source: string
  source_type: string
  description: string
  is_public: boolean
  is_high_risk: boolean
  port_name: string | null
}
export interface RemediationSGGroup {
  sg_id: string
  sg_name: string
  outbound_rules: RemediationSGRule[]
  inbound_rules: RemediationSGRule[]
  public_egress_rules: RemediationSGRule[]
  has_public_ingress: boolean
}
export interface RemediationSG {
  applies: boolean
  sgs_collected: boolean
  groups: RemediationSGGroup[]
}
export interface RemediationDataAccess {
  bucket_policy_collected: boolean
  has_source_vpc_condition: boolean | null
  public_access_block: boolean | null
  versioning: string | null
  kms_encrypted: boolean | null
  access_logging_enabled: boolean | null
}
export interface RemediationPayload {
  iam: RemediationIAM
  sg: RemediationSG
  data_access: RemediationDataAccess
}

interface ExfilPath {
  path_id: string
  accessor_id: string
  accessor_name: string
  accessor_type: string
  accessor_provenance: "capable" | "observed"
  channel: string
  channel_label: string
  jewel_hits: number
  workload_count: number
  workload_sample: Array<{ id: string; name: string; type: string }>
  gateway_count: number
  // gateway_sample carries route provenance from the backend (2026-05-30):
  //   routed=true  → subnet's route table actually targets this gateway
  //                  (the AUTHORITATIVE answer for "where do bytes go")
  //   routed=false → gateway exists in the same VPC but no route points
  //                  at it (capability hint only). Today the backend
  //                  drops these from gateway_sample when ANY routed
  //                  gateway is found for the same subnet — kept in
  //                  the type for forwards-compat.
  // route_destination_cidr → "0.0.0.0/0" for default routes via IGW/NAT
  // route_target_service   → "com.amazonaws.eu-west-1.s3" for Gateway
  //                          VPCEs (the AWS service prefix list this
  //                          VPCE handles)
  gateway_sample: Array<{
    id: string
    name: string
    kind: string
    service_name?: string | null
    routed?: boolean
    route_destination_cidr?: string | null
    route_target_service?: string | null
  }>
  workload_network: WorkloadNetworkPayload | null
  // ATLAS chain enrichment — present when backend computed it, null
  // when the call failed/timed out, undefined when include_atlas=false.
  // Three states are intentionally distinct — see AtlasPill below.
  atlas?: AtlasChainSummary | null
  // Stack-components enrichment — populated for every path; empty
  // arrays when the role has no observed sessions / no policy
  // attachments / etc. Missing field would be a backend bug.
  stack_components?: StackComponentsPayload
  // Neo4j-grounded remediation prescriptions — Alon 2026-05-27 "stop,
  // why u dont fetch data from neo4j? why templates?" — replaces the
  // earlier templated panel. Every list inside is a Cypher row diff.
  remediation?: RemediationPayload
}

interface ExfilDestination {
  kind: "internet" | "external_account" | "external_region"
  id: string
  label: string
  capable_route_count: number
  observed_route_count: number
  observed_bytes_24h: number
  icon: string
  provenance: "capable" | "observed"
}

interface ExfilPayload {
  ok: boolean
  error?: string
  system_name?: string
  jewel: { id: string; name: string; type: string; classification: string | null }
  accessors: ExfilAccessor[]
  paths?: ExfilPath[]
  egress_lanes: {
    network: ExfilNetworkEgressItem[]
    identity: { items: unknown[]; not_wired: true; not_wired_reason: string }
    data_propagation: { items: unknown[]; not_wired: true; not_wired_reason: string }
  }
  destinations: ExfilDestination[]
  // Layer B (2026-05-27) — both fields are non-null only when the
  // request set include_atlas=true. Empty keystones[] is a real
  // signal (ATLAS ran but found no shared-node concentration);
  // null atlas_summary means ATLAS was skipped entirely.
  atlas_summary?: AtlasSummary | null
  keystones?: ExfilKeystone[]
  observed_exfil: { available: boolean; not_wired_reason: string }
  phase: string
  phase_note: string
}

// ─── Component ────────────────────────────────────────────────────

interface ExfilViewV3Props {
  systemName: string
  jewel: CrownJewelSummary | null
}

export function ExfilViewV3({ systemName, jewel }: ExfilViewV3Props) {
  // Stable request body — recomputed only on system/jewel change, same
  // pattern as attacker-view-panel.tsx to keep useRetryFetch's dependency
  // comparison stable across renders.
  const requestBody = useMemo(
    () =>
      JSON.stringify({
        system_name: systemName,
        jewel_id: jewel?.id ?? "",
        include_capable: true,
        include_observed: true,
        max_destinations: 50,
        // ATLAS multi-hop chain enrichment — Layer A (2026-05-27).
        // Default ON so the killer-solution chain count is visible on
        // first render. Backend dedupes by workload + caps at 4 parallel
        // calls (ThreadPoolExecutor, 30s timeout). Graceful null on
        // failure — never a fabricated "0 chains" from an error.
        include_atlas: true,
        atlas_max_hops: 6,
      }),
    [systemName, jewel?.id],
  )

  const fetchInit = useMemo<RequestInit>(
    () => ({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: requestBody,
    }),
    [requestBody],
  )

  const enabled = !!systemName && !!jewel?.id
  const { data, loading, error, retry, retrying, attempt } = useRetryFetch<ExfilPayload>(
    enabled ? "/api/proxy/attack-chain/exfil-paths" : null,
    {
      fetchInit,
      refetchKey: `${systemName}:${jewel?.id ?? ""}`,
      maxRetries: 2,
      initialDelayMs: 1000,
    },
  )

  // Per-path selection — each (accessor, channel) chain renders as its
  // own canvas. URL-synced so deep-links survive reload / back-button.
  //
  // 2026-05-26: unified URL-read + validation into a single effect to
  // kill the race that broke deep-link round-trip — previously the
  // mount effect set state from URL, but a parallel validation effect
  // fired with `selectedPathId === null` on the first render after
  // data arrived and reset to paths[0] before the mount effect's
  // setState propagated. Now we read URL inline on every (re)validate
  // so the URL value wins as long as it matches a real path_id.
  const [selectedPathId, setSelectedPathId] = useState<string | null>(null)
  // Role detail panel state — 2026-05-27. Click a role chip on the
  // canvas → its SecurityCheckpoint is stashed here → RoleDetailPanel
  // renders as an overlay slide-in. Null when nothing selected.
  const [detailRole, setDetailRole] = useState<SecurityCheckpoint | null>(null)

  useEffect(() => {
    if (!data?.paths || data.paths.length === 0) {
      setSelectedPathId(null)
      return
    }
    // Keep current selection if still valid.
    if (selectedPathId && data.paths.some((p) => p.path_id === selectedPathId)) {
      return
    }
    // Try URL value first — wins over the default-pick if it matches
    // a real path. This makes deep-links survive reload.
    let urlPath: string | null = null
    if (typeof window !== "undefined") {
      try {
        urlPath = new URLSearchParams(window.location.search).get("exfil_path")
      } catch {
        // ignore (SSR / sandboxed env)
      }
    }
    if (urlPath && data.paths.some((p) => p.path_id === urlPath)) {
      setSelectedPathId(urlPath)
      return
    }
    // Backend pre-sorts paths[] highest-traffic first; fall back to [0].
    setSelectedPathId(data.paths[0]?.path_id ?? null)
  }, [data, selectedPathId])

  useEffect(() => {
    if (typeof window === "undefined" || !selectedPathId) return
    try {
      const url = new URL(window.location.href)
      if (url.searchParams.get("exfil_path") === selectedPathId) return
      url.searchParams.set("exfil_path", selectedPathId)
      window.history.replaceState(null, "", url.toString())
    } catch {
      // ignore
    }
  }, [selectedPathId])

  const selectedPath = useMemo<ExfilPath | null>(() => {
    if (!data?.paths || !selectedPathId) return null
    return data.paths.find((p) => p.path_id === selectedPathId) ?? null
  }, [data, selectedPathId])

  // Sibling paths — other channels under the SAME accessor as the
  // currently-selected path. Surfaced as a chip strip on the canvas
  // header (see "Other channels for this role" below) so an operator
  // looking at e.g. CyntroLambdaTier1-pilot|serverless_direct (8 non-VPC
  // Lambdas) can SEE that the same role ALSO has a network_via_igw
  // path (6 VPC-attached Lambdas + IGW + VPCE) without hunting in the
  // path-picker dropdown. Operator-traced 2026-05-30: "from S3 to
  // what?? we need to see traffic out of the VPC" — the VPC path
  // existed, was in paths[], but the default sort tiebreak landed
  // them on serverless_direct.
  const siblingPaths = useMemo<ExfilPath[]>(() => {
    if (!data?.paths || !selectedPath) return []
    return data.paths.filter(
      (p) =>
        p.accessor_id === selectedPath.accessor_id &&
        p.path_id !== selectedPath.path_id,
    )
  }, [data, selectedPath])

  const architecture = useMemo<SystemArchitecture | null>(() => {
    if (!data || !data.ok) return null
    return buildExfilArchitecture(data, selectedPath)
  }, [data, selectedPath])

  if (!enabled) {
    return (
      <div className="flex flex-col h-full">
        <Header jewel={jewel} subtitle="Select a crown jewel to see its exfil surface" />
        <div className="flex-1 flex items-center justify-center text-sm text-slate-500">
          No crown jewel selected.
        </div>
      </div>
    )
  }

  if (loading) {
    const retryLabel =
      retrying && attempt > 0
        ? `Backend was slow — retrying (attempt ${attempt + 1})…`
        : "Walking forward from the jewel — mapping every door the data can leave through…"
    return (
      <div className="flex flex-col h-full">
        <Header jewel={jewel} subtitle="Computing the exfiltration surface…" />
        <div className="flex-1 flex items-center justify-center text-sm text-slate-500">
          {retryLabel}
        </div>
      </div>
    )
  }

  if (error || !data || !data.ok) {
    const msg = error || data?.error || "Exfil paths failed"
    return (
      <div className="flex flex-col h-full">
        <Header jewel={jewel} subtitle="Could not load exfil view" />
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 max-w-md text-sm text-red-200">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4" />
              <span className="font-semibold">Exfil view failed</span>
            </div>
            <div className="text-xs text-red-200/80">{msg}</div>
            <button
              type="button"
              onClick={retry}
              className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-red-400/40 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-100 hover:bg-red-500/20"
            >
              <RefreshCw className="h-3 w-3" />
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!architecture) return null

  const paths = data.paths ?? []
  const capableCount = data.accessors.filter((a) => a.provenance === "capable").length
  const observedCount = data.accessors.filter((a) => a.provenance === "observed").length

  // Header subtitle: simple counts only. No archetype noise, no
  // "phase X / collectors pending" jargon — operators read this at a
  // glance to know how big the surface is.
  const subtitle = paths.length
    ? `${paths.length} exfil path${paths.length === 1 ? "" : "s"} · ${observedCount} observed reader${observedCount === 1 ? "" : "s"} · ${capableCount} capable reader${capableCount === 1 ? "" : "s"} · ${data.destinations.length} destination${data.destinations.length === 1 ? "" : "s"}`
    : "No accessors or paths resolved for this jewel"

  const innerSubtitle = selectedPath
    ? `${selectedPath.channel_label} via ${friendlyAccessorName(selectedPath.accessor_name)} · ${selectedPath.workload_count} workload${selectedPath.workload_count === 1 ? "" : "s"} · ${selectedPath.gateway_count} gateway${selectedPath.gateway_count === 1 ? "" : "s"} · ${selectedPath.jewel_hits.toLocaleString()} read${selectedPath.jewel_hits === 1 ? "" : "s"}`
    : data.observed_exfil.available
      ? "Data exit paths — capable (amber) vs observed (red)"
      : "Capable data-exit paths — observed-exfil layer pending"

  const pathSelectorNode =
    paths.length > 0 ? (
      <PathSelector
        paths={paths}
        selectedPathId={selectedPathId}
        onSelect={setSelectedPathId}
      />
    ) : null

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <Header jewel={jewel} subtitle={subtitle} />
      <KeystoneStrip
        atlasSummary={data.atlas_summary}
        keystones={data.keystones ?? []}
      />
      {siblingPaths.length > 0 && (
        <div
          className="flex items-center gap-2 px-6 py-2 border-b border-slate-800/60 bg-slate-900/40 text-[10px]"
        >
          <span className="text-slate-500 uppercase tracking-wider font-bold">
            Same role · other channels
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {siblingPaths.map((p) => (
              <button
                key={p.path_id}
                type="button"
                onClick={() => setSelectedPathId(p.path_id)}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-700/60 bg-slate-800/40 px-2 py-0.5 hover:border-amber-500/40 hover:bg-amber-500/5 transition-colors"
                title={`Switch to ${p.channel_label} · ${p.workload_count} workloads · ${p.gateway_count} gateways`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${
                  p.channel === "network_via_igw" ? "bg-emerald-400"
                  : p.channel === "serverless_direct" ? "bg-amber-400"
                  : p.channel === "ec2_no_egress" ? "bg-orange-400"
                  : "bg-slate-400"
                }`} />
                <span className="text-slate-200 font-medium">{p.channel_label}</span>
                <span className="text-slate-500">
                  · {p.workload_count}w · {p.gateway_count}g
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="relative" style={{ minHeight: "640px" }}>
        <TrafficFlowMap
          systemName={systemName}
          architectureOverride={architecture}
          observedMode={true}
          titleOverride=""
          innerTitleOverride={
            selectedPath
              ? `Exfil path · ${selectedPath.channel_label}`
              : "Exfiltration Surface"
          }
          innerSubtitleOverride={innerSubtitle}
          pathBadgeOverride={
            selectedPath
              ? `${friendlyAccessorName(selectedPath.accessor_name)} → ${data.jewel.name}`
              : `Exfil → ${data.jewel.name}`
          }
          headerSlot={pathSelectorNode}
          defaultShowVPCBoundaries={true}
          // Role chip click opens the side panel — Alon feedback
          // 2026-05-27 "i cant understand nothing." Chip stays
          // compact (summary line only); panel carries the 5 sections
          // as tabs.
          onRoleClick={(role) => setDetailRole(role)}
        />
        {detailRole && (
          <RoleDetailPanel
            roleId={detailRole.id}
            roleName={detailRole.name}
            usedCount={detailRole.usedCount}
            totalCount={detailRole.totalCount}
            gapCount={detailRole.gapCount}
            alsoReaches={detailRole.alsoReaches ?? []}
            sharedWith={detailRole.sharedWith ?? []}
            assumedBy={detailRole.assumedBy ?? []}
            policiesAttached={detailRole.policiesAttached ?? []}
            actionsUsed={detailRole.actionsUsed ?? []}
            onClose={() => setDetailRole(null)}
          />
        )}
      </div>
      {/* DAMAGE + REMEDIATION panel — Alon 2026-05-27, the green-
          highlighted empty space below the canvas. Plain-English
          summary of: what this path does, blast radius, concrete
          remediation actions across IAM/SG/data-access, and every
          destination data is observed leaving to. */}
      <DamageRemediationPanel
        payload={data}
        selectedPath={selectedPath}
      />
    </div>
  )
}

// ─── Header ───────────────────────────────────────────────────────
// Mirrors attacker-view-panel.tsx Header structure — same sticky top
// bar, same FreshnessBanner pill, jewel slot on right. The only
// semantic flip: "target" → "source" because the jewel IS the data
// origin in EXFIL, not the attacker's destination.

// ─── DAMAGE + REMEDIATION panel ──────────────────────────────────
// Alon 2026-05-27: the empty space below the canvas. Plain-English
// damage summary, blast-radius numbers, concrete remediation
// actions across IAM/SG/data-access, and every observed destination
// where data leaves to.
//
// Honest rendering — every fact ties to a real data point:
//   damage           → derived from selectedPath + accessor counts
//   blast_radius     → from accessor.also_reaches / shared_with
//   remediation_iam  → from accessor.used_actions vs allowed_actions
//   remediation_sg   → from path.workload_network (SG / SG rules)
//   remediation_data → bucket policy / VPC endpoint status (when
//                      collected; otherwise honest empty state)
//   destinations     → from payload.destinations[] (jewel-scoped)
// Anything not yet collected renders an explicit "collector pending"
// note rather than faking the data.

function DamageRemediationPanel({
  payload,
  selectedPath,
}: {
  payload: ExfilPayload
  selectedPath: ExfilPath | null
}) {
  if (!selectedPath) {
    return (
      <div className="px-6 py-6 border-t border-slate-800 bg-slate-950/40">
        <div className="text-xs text-slate-500 italic">
          Select an exfil path above to see the damage assessment and
          remediation actions.
        </div>
      </div>
    )
  }

  const accessor = payload.accessors.find(
    (a) => a.id === selectedPath.accessor_id,
  )
  const allowed = accessor?.allowed_actions_count ?? 0
  const used = accessor?.used_actions_count ?? 0
  const unused = accessor?.unused_actions_count ?? Math.max(0, allowed - used)
  const observed = accessor?.provenance === "observed"
  const lateralJewels = accessor?.also_reaches?.length ?? 0
  const sharedWorkloads = accessor?.shared_with?.length ?? 0
  const isNonVpc = !selectedPath.workload_network?.is_vpc_attached
  const sgList = selectedPath.workload_network?.security_groups ?? []
  const subnetList = selectedPath.workload_network?.subnets ?? []
  const hasPublicSubnet = subnetList.some((s) => s.is_public === true)
  const channel = selectedPath.channel_label
  const workloadKind =
    selectedPath.workload_sample?.[0]?.type || "workload"

  // ──── DAMAGE — plain English ────
  const damageSentences: string[] = []
  damageSentences.push(
    `An attacker who compromises ${workloadKind} ${
      selectedPath.workload_sample?.[0]?.name ?? "(unknown)"
    } can read ${payload.jewel.name} via the ${friendlyAccessorName(selectedPath.accessor_name)} role.`,
  )
  if (observed && selectedPath.jewel_hits > 0) {
    damageSentences.push(
      `Cyntro has observed ${selectedPath.jewel_hits.toLocaleString()} reads on this path${
        selectedPath.workload_network?.evidence ? "" : ""
      } — this isn't theoretical, the data is actively moving.`,
    )
  }
  if (allowed > 0) {
    damageSentences.push(
      `The role grants ${allowed} permissions; ${used > 0 ? `${used} are exercised by observed traffic` : "none are exercised by observed traffic"}. ${unused > 0 ? `The other ${unused} are unused excess — pure attack surface.` : ""}`,
    )
  }
  if (isNonVpc) {
    damageSentences.push(
      `The workload is not VPC-attached, so VPC Flow Logs / SG egress / NACLs do not gate this path. IAM is the only line of defense.`,
    )
  } else if (hasPublicSubnet) {
    damageSentences.push(
      `The workload sits in a public subnet — egress to the Internet has a direct route.`,
    )
  }

  // ──── BLAST RADIUS — what else does this unlock ────
  const blastChips: Array<{
    label: string
    sub: string
    tone: "red" | "amber" | "slate"
  }> = []
  blastChips.push({
    label: `${lateralJewels} other jewel${lateralJewels === 1 ? "" : "s"}`,
    sub: lateralJewels > 0
      ? `Same role reads these too — kill the role, kill ${lateralJewels + 1} reach lines`
      : "This role only reaches this jewel — narrow blast",
    tone: lateralJewels >= 3 ? "red" : lateralJewels >= 1 ? "amber" : "slate",
  })
  blastChips.push({
    label: `${sharedWorkloads} other workload${sharedWorkloads === 1 ? "" : "s"}`,
    sub: sharedWorkloads > 0
      ? `Other footholds carry the same role — compromise any one to land here`
      : `Only this workload carries the role — bounded foothold surface`,
    tone: sharedWorkloads >= 3 ? "red" : sharedWorkloads >= 1 ? "amber" : "slate",
  })
  blastChips.push({
    label: `${payload.destinations.length} destination${payload.destinations.length === 1 ? "" : "s"}`,
    sub:
      payload.destinations.length > 0
        ? "Data leaving via these exit points (see Destinations below)"
        : "No exit points resolved — collector pending",
    tone: payload.destinations.length >= 2 ? "red" : payload.destinations.length === 1 ? "amber" : "slate",
  })

  // ──── REMEDIATION — Neo4j-grounded ──────────────────────────────
  // No templates. Every claim below ties to a Cypher row from the
  // backend's _compute_remediation. When data isn't collected we
  // render an honest "not collected" state instead of inventing
  // a recommendation.
  const rem = selectedPath.remediation

  // ──── DESTINATIONS ────
  const destinationRows = payload.destinations.map((d) => ({
    label: d.label,
    kind: d.kind,
    icon: d.icon,
    observed: d.observed_route_count,
    capable: d.capable_route_count,
    bytes24h: d.observed_bytes_24h,
    provenance: d.provenance,
  }))
  const destinationCollectorWired = payload.observed_exfil?.available ?? false

  return (
    <div className="px-6 py-6 border-t border-slate-800 bg-slate-950/40 space-y-5">
      {/* DAMAGE */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-red-200">
            Damage on this path
          </h3>
        </div>
        <div className="text-sm text-slate-200 leading-relaxed space-y-1.5">
          {damageSentences.map((s, i) => (
            <p key={i}>{s}</p>
          ))}
        </div>
      </section>

      {/* BLAST RADIUS */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <span className="h-4 w-4 rounded-full bg-amber-500/40 border border-amber-400" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-amber-200">
            Blast radius beyond this path
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {blastChips.map((c, i) => {
            const tone =
              c.tone === "red"
                ? "bg-red-500/10 border-red-500/40 text-red-200"
                : c.tone === "amber"
                  ? "bg-amber-500/10 border-amber-500/40 text-amber-200"
                  : "bg-slate-700/30 border-slate-600/50 text-slate-300"
            return (
              <div key={i} className={`rounded border px-3 py-2 ${tone}`}>
                <div className="text-base font-bold">{c.label}</div>
                <div className="text-[11px] mt-1 opacity-90">{c.sub}</div>
              </div>
            )
          })}
        </div>
      </section>

      {/* REMEDIATION — Neo4j-grounded. Every section reads its data
          from selectedPath.remediation. When the field is absent,
          we render an explicit "remediation enrichment not computed"
          state — no faking. */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-200">
            How to reduce the damage
          </h3>
          <span className="text-[10px] text-emerald-300/60">
            · all claims tied to Neo4j rows
          </span>
        </div>
        {!rem ? (
          <div className="rounded border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
            Remediation enrichment not yet computed for this path. Refresh
            the page; if this persists, the backend's _attach_remediation
            failed for this accessor (check Render logs).
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <RemediationIAMCol rem={rem.iam} roleName={friendlyAccessorName(selectedPath.accessor_name)} />
            <RemediationSGCol rem={rem.sg} />
            <RemediationDataCol rem={rem.data_access} jewelName={payload.jewel.name} />
          </div>
        )}
      </section>

      {/* DESTINATIONS — every domain / external endpoint data leaves to */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <Globe className="h-4 w-4 text-cyan-300" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-cyan-200">
            Where data leaves to
          </h3>
        </div>
        {destinationRows.length === 0 ? (
          <div className="text-xs text-slate-500 italic px-3 py-2 rounded border border-slate-800 bg-slate-900/40">
            No destinations resolved for this jewel.
          </div>
        ) : (
          <div className="rounded border border-slate-800 bg-slate-900/40 divide-y divide-slate-800/60">
            {destinationRows.map((d) => (
              <div
                key={d.label}
                className="px-3 py-2 flex items-center gap-3 text-sm"
              >
                <span
                  className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded border ${
                    d.provenance === "observed"
                      ? "border-red-500/50 text-red-200 bg-red-500/10"
                      : "border-amber-500/50 text-amber-200 bg-amber-500/10"
                  }`}
                >
                  {d.provenance}
                </span>
                <span className="text-slate-200 font-mono flex-1 truncate">
                  {d.label}
                </span>
                <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                  {d.kind}
                </span>
                <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                  {d.observed} observed · {d.capable} capable
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="text-[11px] text-slate-500 mt-2 leading-relaxed">
          {destinationCollectorWired ? (
            <>Destinations reflect real CloudTrail / VPC Flow Log exit traces.</>
          ) : (
            <>
              <strong className="text-amber-300/80">
                Domain-level destination resolution is collector-pending (Phase D).
              </strong>{" "}
              Today's destinations are aggregated exit channels (Internet /
              external account / external region). Resolving to specific
              external domains requires the Route 53 Resolver Query Log
              collector + the EXFILTRATED_TO edge writer — both queued.
            </>
          )}
        </div>
      </section>
    </div>
  )
}

// ── IAM remediation column — Neo4j-grounded ─────────────────────
// Renders specific action names from r.allowed_actions diffed against
// observed ACTUAL_API_CALL edges. Surfaces destructive actions (Delete
// / Terminate / Remove verbs) as red.
function RemediationIAMCol({
  rem,
  roleName,
}: {
  rem: RemediationIAM
  roleName: string
}) {
  const unused = rem.unused_actions ?? []
  const used = rem.used_actions ?? []
  const destructive = new Set(rem.destructive_unused ?? [])
  const observedNotInAllowed = rem.observed_not_in_allowed ?? []
  const allowedNotCollected = rem.allowed_not_collected === true
  const policyEdges = rem.policy_edge_count ?? 0
  const observedActions = rem.observed_actions ?? []

  // HONESTY GATE — when allowed_actions list isn't expanded but
  // policies ARE attached, we cannot compute the diff. Render that
  // state explicitly rather than claiming "no gap" or labeling
  // every observed action as a "discrepancy."
  if (allowedNotCollected) {
    return (
      <div className="rounded border border-amber-500/40 bg-slate-900/40 p-3 space-y-3">
        <h4 className="text-[10px] uppercase tracking-wider font-bold text-rose-300">
          IAM role permissions
        </h4>
        <div className="rounded border border-amber-500/40 bg-amber-500/10 px-2.5 py-2">
          <div className="text-[12px] font-semibold text-amber-200">
            Cannot compute unused-permission gap on this role yet.
          </div>
          <div className="text-[11px] text-amber-300/80 mt-1 leading-snug">
            <span className="font-mono">{roleName}</span> has{" "}
            {policyEdges > 0 ? `${policyEdges} IAMPolicy node${policyEdges === 1 ? "" : "s"} attached` : "policies referenced by name"}{" "}
            in the graph, but{" "}
            <span className="font-mono">r.allowed_actions</span> is empty —
            the lp_collector hasn't expanded the policies into a flat action
            list for this role. Without that baseline, Cyntro can't honestly
            recommend which permissions to remove.
          </div>
          <div className="text-[11px] text-amber-300/80 mt-1 leading-snug">
            Run <span className="font-mono">/api/admin/lp-collect-role?role_arn={"<arn>"}</span>{" "}
            (or the next scheduled lp_collector cycle) to populate the baseline.
          </div>
        </div>
        {observedActions.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-300">
              Observed footprint ({observedActions.length} action{observedActions.length === 1 ? "" : "s"})
            </div>
            <div className="text-[11px] text-slate-400 leading-snug">
              Distinct IAM actions observed via ACTUAL_API_CALL edges in the
              graph. This is what the role is actually being used for — the
              minimum scope a future tight policy would need to keep.
            </div>
            <div className="flex flex-wrap gap-1 pt-1">
              {observedActions.map((a) => (
                <span
                  key={a}
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                    a.startsWith("s3:Delete") ||
                    a.startsWith("kms:") ||
                    a.startsWith("ec2:Delete")
                      ? "border-amber-500/50 bg-amber-500/10 text-amber-200"
                      : "border-slate-700 bg-slate-800/40 text-slate-300"
                  }`}
                  title={a}
                >
                  {a}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="rounded border border-rose-500/30 bg-slate-900/40 p-3 space-y-3">
      <h4 className="text-[10px] uppercase tracking-wider font-bold text-rose-300">
        IAM role permissions
      </h4>
      {unused.length === 0 ? (
        <div className="text-[12px] text-emerald-300/90">
          ✓ All {rem.allowed_actions?.length ?? 0} allowed actions are exercised
          by observed traffic. No unused-permission gap on this path.
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-[12px] text-slate-200 font-semibold leading-snug">
            Remove {unused.length} unused permission
            {unused.length === 1 ? "" : "s"} from{" "}
            <span className="font-mono text-rose-200">{roleName}</span>
          </div>
          <div className="text-[11px] text-slate-400 leading-snug">
            Allowed but never observed on{" "}
            <span className="text-slate-300">ACTUAL_API_CALL</span> edges:
          </div>
          <ul className="space-y-1">
            {unused.map((a) => (
              <li
                key={a}
                className={`text-[11px] font-mono px-1.5 py-0.5 rounded border ${
                  destructive.has(a)
                    ? "border-red-500/50 bg-red-500/10 text-red-200"
                    : "border-slate-700 bg-slate-800/40 text-slate-300"
                }`}
                title={
                  destructive.has(a)
                    ? "Destructive action — removing this eliminates the worst-case write/delete blast"
                    : "Unused — observed CloudTrail shows no use"
                }
              >
                {destructive.has(a) && (
                  <span className="text-[9px] uppercase tracking-wider font-bold mr-1.5 text-red-300">
                    destructive
                  </span>
                )}
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}
      {used.length > 0 && (
        <div className="space-y-1 pt-2 border-t border-slate-800">
          <div className="text-[10px] uppercase tracking-wider font-bold text-emerald-300/80">
            Keep ({used.length})
          </div>
          <div className="flex flex-wrap gap-1">
            {used.map((a) => (
              <span
                key={a}
                className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/5 text-emerald-200"
              >
                {a}
              </span>
            ))}
          </div>
        </div>
      )}
      {observedNotInAllowed.length > 0 && (
        <div className="space-y-1 pt-2 border-t border-slate-800">
          <div className="text-[10px] uppercase tracking-wider font-bold text-amber-300/80">
            Discrepancy — observed but not in allowed_actions
          </div>
          <div className="flex flex-wrap gap-1">
            {observedNotInAllowed.map((a) => (
              <span
                key={a}
                className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-200"
                title="Action observed via ACTUAL_API_CALL but not in this role's allowed_actions — either wildcard match (s3:Get* covering s3:Head*) or per-principal attribution gap"
              >
                {a}
              </span>
            ))}
          </div>
          <div className="text-[10px] text-amber-300/70">
            Likely wildcard expansion (s3:Get* covering s3:Head*) or
            per-principal attribution gap.
          </div>
        </div>
      )}
      {rem.used_cached_was_stale && (
        <div className="text-[10px] text-slate-500 pt-2 border-t border-slate-800">
          Note: cached <span className="font-mono">used_actions_count</span> on
          the IAMRole node was stale. Live diff against ACTUAL_API_CALL is the
          authoritative number.
        </div>
      )}
    </div>
  )
}

// ── SG remediation column — Neo4j-grounded ──────────────────────
function RemediationSGCol({ rem }: { rem: RemediationSG }) {
  return (
    <div className="rounded border border-cyan-500/30 bg-slate-900/40 p-3 space-y-2">
      <h4 className="text-[10px] uppercase tracking-wider font-bold text-cyan-300">
        Security groups / network
      </h4>
      {!rem.applies ? (
        <div className="text-[12px] text-slate-300 leading-snug">
          <span className="font-semibold">Not applicable on this path.</span>
          <div className="text-[11px] text-slate-400 mt-1">
            Workload is not VPC-attached — reaches AWS services via the public
            API endpoint (Service Plane). SG / NACL / subnet controls don't
            gate this exfil. IAM is the only gate.
          </div>
        </div>
      ) : !rem.sgs_collected ? (
        <div className="text-[12px] text-amber-200 leading-snug">
          <span className="font-semibold">SG rules not collected.</span>
          <div className="text-[11px] text-amber-300/70 mt-1">
            Workload is VPC-attached but no SG rule data is in Neo4j. Run{" "}
            <span className="font-mono">/api/admin/run-consumer-edges</span>
            then refresh.
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          {rem.groups.map((g) => (
            <div key={g.sg_id} className="space-y-1.5">
              <div className="text-[11px] font-mono text-slate-100">
                {g.sg_name}
                <span className="text-[10px] text-slate-500 ml-1.5">
                  · {g.outbound_rules.length} outbound rule
                  {g.outbound_rules.length === 1 ? "" : "s"}
                </span>
              </div>
              {g.public_egress_rules.length > 0 ? (
                <div className="space-y-1">
                  <div className="text-[11px] text-red-300 font-semibold">
                    {g.public_egress_rules.length} PUBLIC egress rule
                    {g.public_egress_rules.length === 1 ? "" : "s"} — remove or
                    scope:
                  </div>
                  <ul className="space-y-0.5">
                    {g.public_egress_rules.map((r, i) => (
                      <li
                        key={i}
                        className="text-[11px] font-mono text-red-200 px-1.5 py-0.5 rounded border border-red-500/40 bg-red-500/10"
                      >
                        {r.protocol === "all" || r.from_port === -1
                          ? `ALL TRAFFIC → ${r.source}`
                          : `${r.protocol} ${r.from_port}${
                              r.from_port !== r.to_port ? `-${r.to_port}` : ""
                            } → ${r.source}`}
                      </li>
                    ))}
                  </ul>
                  <div className="text-[10px] text-red-300/70">
                    Replace with a VPC endpoint and/or scoped egress to the
                    specific AWS service prefix.
                  </div>
                </div>
              ) : (
                <div className="text-[11px] text-emerald-300/80">
                  No 0.0.0.0/0 egress rules on this SG — already scoped.
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Data-access remediation column — Neo4j-grounded ─────────────
function RemediationDataCol({
  rem,
  jewelName,
}: {
  rem: RemediationDataAccess
  jewelName: string
}) {
  // Each row is one bucket-side posture signal. Tone = red when it's
  // a vulnerability the operator should close, emerald when it's
  // already in place, slate when the collector hasn't populated the
  // field (honest "we don't know" vs. faking a recommendation).
  type Row = {
    label: string
    state: "good" | "bad" | "unknown"
    detail: string
  }
  const rows: Row[] = []

  // 1. Source-VPC condition
  if (!rem.bucket_policy_collected) {
    rows.push({
      label: "aws:SourceVpc / SourceVpce condition",
      state: "unknown",
      detail:
        "Bucket policy not collected — cannot check whether the condition is in place. Run the S3 collector with bucket-policy enabled to evaluate.",
    })
  } else if (rem.has_source_vpc_condition === true) {
    rows.push({
      label: "aws:SourceVpc / SourceVpce condition",
      state: "good",
      detail:
        "Bucket policy already restricts access to traffic from the VPC endpoint. No action.",
    })
  } else {
    rows.push({
      label: "aws:SourceVpc / SourceVpce condition",
      state: "bad",
      detail:
        "Bucket policy has no SourceVpc/Vpce restriction. Add the condition so the bucket can only be read by callers traversing the VPC endpoint.",
    })
  }

  // 2. Public access block
  if (rem.public_access_block === null) {
    rows.push({
      label: "Public Access Block",
      state: "unknown",
      detail: "PAB state not collected — re-run the S3 collector to capture.",
    })
  } else if (rem.public_access_block) {
    rows.push({
      label: "Public Access Block",
      state: "good",
      detail: "PAB enabled — bucket cannot be made public via policy or ACL.",
    })
  } else {
    rows.push({
      label: "Public Access Block",
      state: "bad",
      detail: `Enable PAB on ${jewelName} so a misconfigured policy can't make the bucket public.`,
    })
  }

  // 3. Versioning
  if (rem.versioning === null) {
    rows.push({
      label: "Versioning",
      state: "unknown",
      detail: "Versioning state not collected.",
    })
  } else if (String(rem.versioning).toLowerCase() === "enabled") {
    rows.push({
      label: "Versioning",
      state: "good",
      detail: "Versioning enabled — deletes are recoverable.",
    })
  } else {
    rows.push({
      label: "Versioning",
      state: "bad",
      detail: `Versioning is ${rem.versioning}. Enable so s3:DeleteObject (which the role currently allows) doesn't make data irrecoverable.`,
    })
  }

  // 4. KMS encryption
  rows.push({
    label: "KMS encryption",
    state: rem.kms_encrypted === true ? "good" : rem.kms_encrypted === false ? "bad" : "unknown",
    detail:
      rem.kms_encrypted === true
        ? "Bucket encrypted with a KMS key — exfil is gated on KMS access as well as IAM."
        : rem.kms_encrypted === false
          ? "No KMS encryption — only IAM gates exfil. Consider a customer-managed KMS key for an extra control plane."
          : "Encryption state not collected.",
  })

  // 5. Access logging
  if (rem.access_logging_enabled === null) {
    rows.push({
      label: "Access logging",
      state: "unknown",
      detail: "Access-logging state not collected.",
    })
  } else if (rem.access_logging_enabled) {
    rows.push({
      label: "Access logging",
      state: "good",
      detail:
        "S3 server-side access logging is on — egress events have a forensic trail.",
    })
  } else {
    rows.push({
      label: "Access logging",
      state: "bad",
      detail: `Enable S3 server-side access logging on ${jewelName} — bridges the gap until EXFILTRATED_TO collector (Phase D) is wired.`,
    })
  }

  return (
    <div className="rounded border border-emerald-500/30 bg-slate-900/40 p-3 space-y-2.5">
      <h4 className="text-[10px] uppercase tracking-wider font-bold text-emerald-300">
        Data-access permissions
      </h4>
      {rows.map((r, i) => {
        const tone =
          r.state === "good"
            ? "text-emerald-300/90"
            : r.state === "bad"
              ? "text-red-200"
              : "text-slate-400"
        const stateLabel =
          r.state === "good" ? "✓" : r.state === "bad" ? "✗" : "—"
        return (
          <div key={i} className="space-y-0.5">
            <div className={`text-[12px] font-semibold ${tone}`}>
              <span className="mr-1.5">{stateLabel}</span>
              {r.label}
            </div>
            <div className="text-[11px] text-slate-400 leading-snug pl-4">
              {r.detail}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function RemediationColumn({
  title,
  color,
  items,
}: {
  title: string
  color: "rose" | "cyan" | "emerald"
  items: Array<{ action: string; rationale: string }>
}) {
  const headerTone =
    color === "rose"
      ? "text-rose-300"
      : color === "cyan"
        ? "text-cyan-300"
        : "text-emerald-300"
  const borderTone =
    color === "rose"
      ? "border-rose-500/30"
      : color === "cyan"
        ? "border-cyan-500/30"
        : "border-emerald-500/30"
  return (
    <div className={`rounded border ${borderTone} bg-slate-900/40 p-3 space-y-2.5`}>
      <h4
        className={`text-[10px] uppercase tracking-wider font-bold ${headerTone}`}
      >
        {title}
      </h4>
      {items.map((it, i) => (
        <div key={i} className="space-y-1">
          <div className="text-[12px] text-slate-200 font-semibold leading-snug">
            {it.action}
          </div>
          <div className="text-[11px] text-slate-400 leading-snug">
            {it.rationale}
          </div>
        </div>
      ))}
    </div>
  )
}

function Header({ jewel, subtitle }: { jewel: CrownJewelSummary | null; subtitle: string }) {
  return (
    <div className="px-6 py-3 border-b border-slate-800/60 bg-slate-950/95 backdrop-blur sticky top-0 z-10 flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5 flex items-center gap-1.5">
          <ArrowRight className="h-3 w-3 text-amber-300" />
          EXFIL VIEW · where the data leaves
          <FreshnessBanner variant="pill" className="ml-2" />
        </div>
        <div className="text-[11px] text-slate-400">{subtitle}</div>
      </div>
      {jewel && (
        <div className="text-right shrink-0">
          <div className="flex items-center gap-1.5 justify-end mb-0.5">
            <Crown className="h-3 w-3 text-amber-400" />
            <span className="text-[10px] uppercase tracking-wider text-slate-500">source</span>
          </div>
          <div
            className="text-xs font-mono text-amber-200/90 break-all max-w-[520px]"
            title={jewel.name}
          >
            {jewel.name}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Keystone strip ──────────────────────────────────────────────
// Layer B (2026-05-27). Horizontal chip strip beneath the Header
// showing the top N keystone nodes — graph nodes whose removal would
// drop the most ATLAS-validated chains. Each chip = (label, name,
// "kills X/Y" badge with hue keyed off pct_killed).
//
// Render contract — three honest states:
//   atlas_summary missing   → omit strip entirely (include_atlas=false)
//   atlas_summary present, total_chains=0
//                           → render "ATLAS · 0 chains" empty-state
//                              with coverage_warnings codes if any
//   atlas_summary present + total_chains>0 + keystones non-empty
//                           → render chips
//
// Cap visible chips at 5 — past that the strip wraps + signal degrades.
function KeystoneStrip({
  atlasSummary,
  keystones,
}: {
  atlasSummary: AtlasSummary | null | undefined
  keystones: ExfilKeystone[]
}) {
  // Layer C (2026-05-27) — CTA wiring. Each IAMRole keystone chip is
  // a button that opens the existing shared-roles split-plan view.
  // If active_plan_id is already set (backend pre-fetched it), one
  // click navigates. Otherwise we POST to mint the plan first, then
  // navigate — same two-step pattern as the list-view CTA at
  // components/iam-shared-roles-list-view.tsx:334-350. Non-IAMRole
  // keystones stay as non-clickable spans for now (no shared-roles
  // flow applies; future layer can add per-type CTAs).
  const router = useRouter()
  const [mintingId, setMintingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const openOrCreatePlan = useCallback(
    async (k: ExfilKeystone) => {
      if (!k.node_arn) return
      // Active plan already exists — instant navigate.
      if (k.active_plan_id) {
        router.push(
          `/iam/shared-roles/by-plan/${encodeURIComponent(k.active_plan_id)}`,
        )
        return
      }
      setMintingId(k.node_id)
      setError(null)
      try {
        // Self-attested identity until SSO — same caveat the list-view
        // CTA uses; recorded on the plan node verbatim by the backend.
        const plan = await postSplitPlan(k.node_arn, "self@cyntro.io")
        router.push(
          `/iam/shared-roles/by-plan/${encodeURIComponent(plan.plan_id)}`,
        )
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        setError(msg)
        setMintingId(null)
      }
    },
    [router],
  )

  if (!atlasSummary || !atlasSummary.enabled) return null

  // Empty-state — ATLAS ran but found nothing. Honestly surface why
  // (coverage warnings or catalog gap) instead of hiding the strip.
  if (atlasSummary.total_chains === 0) {
    const warnings = atlasSummary.coverage_warnings
    const catalog = atlasSummary.catalog_version ?? "unknown"
    return (
      <div className="px-6 py-2 border-b border-slate-800/60 bg-slate-900/40 flex items-center gap-3 text-[10px] text-slate-400">
        <span className="text-[9px] uppercase tracking-wider font-bold text-slate-500">
          Keystones
        </span>
        <span className="text-slate-500">·</span>
        <span title={`ATLAS catalog ${catalog} returned 0 chains for the queried pairs`}>
          ATLAS · 0 chains validated against catalog{" "}
          <span className="font-mono text-slate-300">{catalog}</span>
        </span>
        {warnings.length > 0 && (
          <span
            className="text-amber-300/80"
            title={warnings.map((w) => `${w.code}: ${w.message}`).join("\n")}
          >
            · {warnings.length} coverage note{warnings.length === 1 ? "" : "s"}
          </span>
        )}
      </div>
    )
  }

  // Real chips — top 5 keystones. Hue scales with pct_killed:
  //   ≥0.75 → red (must-fix; kills most chains)
  //   ≥0.40 → amber
  //   <0.40 → slate (low-leverage)
  const visible = keystones.slice(0, 5)
  const toneFor = (pct: number) =>
    pct >= 0.75
      ? "bg-red-500/10 text-red-200 border-red-500/40 hover:bg-red-500/20"
      : pct >= 0.4
        ? "bg-amber-500/10 text-amber-200 border-amber-500/40 hover:bg-amber-500/20"
        : "bg-slate-800/60 text-slate-300 border-slate-700/60 hover:bg-slate-800"

  const labelFor = (k: ExfilKeystone): string => {
    // Pick the first non-structural label (Service/Resource/Node
    // already filtered server-side). Falls through to "Node" if
    // the array is empty — defensive, shouldn't happen in practice.
    return k.node_labels[0] ?? "Node"
  }

  return (
    <div className="px-6 py-2 border-b border-slate-800/60 bg-slate-900/40 flex items-center gap-2 text-[10px] overflow-x-auto">
      <span className="text-[9px] uppercase tracking-wider font-bold text-slate-500 shrink-0">
        Keystones
      </span>
      <span className="text-slate-500 shrink-0">·</span>
      <span
        className="text-[9px] uppercase tracking-wider font-semibold text-slate-400 shrink-0"
        title={`Kill any of these to drop the listed share of ${atlasSummary.total_chains} ATLAS-validated chain${atlasSummary.total_chains === 1 ? "" : "s"}`}
      >
        Top {visible.length} of {keystones.length}
      </span>
      {visible.map((k) => {
        const pctTxt = Math.round(k.pct_killed * 100)
        const labelText = labelFor(k)
        const isIamRole = labelText === "IAMRole" && !!k.node_arn
        const isLoading = mintingId === k.node_id
        const titleText = isIamRole
          ? `Open shared-roles split plan for ${k.node_name} — ${k.active_plan_id ? "active plan exists, navigates immediately" : "no active plan yet, will mint then navigate"}. Kill this role and ${k.chain_count_killed} of ${k.chain_count_total} ATLAS chains drop. Sample chain IDs: ${k.sample_chain_ids.join(", ")}`
          : `${labelText} ${k.node_name} appears in ${k.chain_count_killed} of ${k.chain_count_total} ATLAS chains. No deep-link CTA for this node type yet. Sample chain IDs: ${k.sample_chain_ids.join(", ")}`

        const chipBody = (
          <>
            <span className="text-[8px] uppercase tracking-wider font-bold opacity-80">
              {labelText}
            </span>
            <span className="text-[10px] font-mono truncate max-w-[180px]">
              {k.node_name}
            </span>
            <span className="text-[9px] font-bold tabular-nums opacity-90">
              kills {k.chain_count_killed}/{k.chain_count_total} · {pctTxt}%
            </span>
            {isIamRole &&
              (isLoading ? (
                <Loader2 className="h-3 w-3 animate-spin opacity-80" />
              ) : k.active_plan_id ? (
                <ExternalLink className="h-3 w-3 opacity-80" />
              ) : (
                <ArrowRight className="h-3 w-3 opacity-80" />
              ))}
          </>
        )

        if (isIamRole) {
          return (
            <button
              key={k.node_id}
              type="button"
              onClick={() => openOrCreatePlan(k)}
              disabled={isLoading}
              className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 shrink-0 transition-colors cursor-pointer ${toneFor(k.pct_killed)} ${isLoading ? "opacity-60" : ""}`}
              title={titleText}
            >
              {chipBody}
            </button>
          )
        }
        return (
          <span
            key={k.node_id}
            className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 shrink-0 ${toneFor(k.pct_killed)}`}
            title={titleText}
          >
            {chipBody}
          </span>
        )
      })}
      {keystones.length > visible.length && (
        <span className="text-[9px] text-slate-500 shrink-0">
          +{keystones.length - visible.length} more
        </span>
      )}
      {error && (
        <span
          className="text-[9px] text-red-300 shrink-0"
          title={error}
        >
          · plan mint failed
        </span>
      )}
    </div>
  )
}

// ─── Path selector ───────────────────────────────────────────────
// Compact dropdown rendered INLINE in TFM's top toolbar (via headerSlot).
// Inline so it stays visible in TFM's full-screen mode where outer panel
// chrome is hidden. Dropdown so 7+ paths fit a single toolbar row.

function PathSelector({
  paths,
  selectedPathId,
  onSelect,
}: {
  paths: ExfilPath[]
  selectedPathId: string | null
  onSelect: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current) return
      if (!containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [open])

  // Tone per channel — used on both the trigger dot AND each row dot so
  // operators can scan-distinguish channels at a glance.
  const dotFor = (channel: string): string =>
    ({
      network_via_igw: "bg-amber-400",
      serverless_direct: "bg-violet-400",
      ec2_no_egress: "bg-slate-300",
      direct_api: "bg-rose-400",
    }) as Record<string, string>[channel] || "bg-slate-300"

  const selected = paths.find((p) => p.path_id === selectedPathId) ?? paths[0]
  if (!selected) return null

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full border border-slate-600/60 bg-slate-800/60 hover:bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-100"
        title="Switch exfil path"
      >
        <Route className="h-3 w-3 text-slate-400" />
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
          Path {paths.indexOf(selected) + 1}/{paths.length}
        </span>
        <span className={`h-1.5 w-1.5 rounded-full ${dotFor(selected.channel)}`} />
        <span className="truncate max-w-[200px]">{selected.channel_label}</span>
        <AtlasPill atlas={selected.atlas} compact />
        <ChevronDown
          className={`h-3 w-3 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 z-50 w-[420px] max-w-[calc(100vw-32px)] rounded-lg border border-slate-700 bg-slate-900 shadow-2xl shadow-black/60 ring-1 ring-black/40">
          <div className="px-3 py-2 border-b border-slate-800 text-[9px] font-bold uppercase tracking-wider text-slate-500">
            {paths.length} exfil path{paths.length === 1 ? "" : "s"} — pick one to inspect
          </div>
          <div className="max-h-[60vh] overflow-y-auto py-1">
            {paths.map((p, idx) => {
              const isSelected = p.path_id === selectedPathId
              const observed = p.accessor_provenance === "observed"
              return (
                <button
                  key={p.path_id}
                  type="button"
                  onClick={() => {
                    onSelect(p.path_id)
                    setOpen(false)
                  }}
                  className={`w-full text-left px-3 py-2 flex items-center gap-2.5 transition-colors ${
                    isSelected ? "bg-slate-800/80" : "hover:bg-slate-800/50"
                  }`}
                >
                  <span className="text-[9px] font-mono text-slate-500 w-4 shrink-0">
                    {idx + 1}
                  </span>
                  <span className={`h-2 w-2 rounded-full shrink-0 ${dotFor(p.channel)}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono text-slate-200 truncate">
                        {friendlyAccessorName(p.accessor_name)}
                      </span>
                      <span
                        className={`text-[8px] uppercase tracking-wider font-bold ${observed ? "text-red-300" : "text-amber-300"}`}
                      >
                        {observed ? "observed" : "capable"}
                      </span>
                      <AtlasPill atlas={p.atlas} compact />
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {p.channel_label} · {p.workload_count} workload
                      {p.workload_count === 1 ? "" : "s"} · {p.gateway_count} gateway
                      {p.gateway_count === 1 ? "" : "s"}
                    </div>
                  </div>
                  <span className="text-[10px] tabular-nums font-mono text-slate-400 shrink-0">
                    {compactNumber(p.jewel_hits)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function compactNumber(n: number): string {
  if (!isFinite(n) || n < 1) return "0"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`
  return String(Math.round(n))
}

// ─── ATLAS pill ──────────────────────────────────────────────────
// Small chain-count badge rendered on each path row and inline in the
// selected-path subtitle. Three honest states:
//   undefined → backend didn't compute (include_atlas was false)
//                — pill is omitted entirely (no fabricated "0")
//   null      → backend tried but failed/timed out
//                — pill says "ATLAS · unavailable" in slate-dim
//   summary   → real engine output
//                — pill says "ATLAS · N chains" with hue derived from
//                  chain_count (emerald for ≥1, slate for 0; the 0
//                  state is a real signal: catalog/coverage gap)
//
// Patent-sensitive note: the pill is a display-only projection of
// AtlasChainSummary; it does not re-implement ATLAS logic.
function AtlasPill({
  atlas,
  compact = false,
}: {
  atlas: AtlasChainSummary | null | undefined
  compact?: boolean
}) {
  if (atlas === undefined) return null
  if (atlas === null) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded ${
          compact ? "px-1.5 py-[1px] text-[8px]" : "px-1.5 py-0.5 text-[9px]"
        } font-bold uppercase tracking-wider bg-slate-800/60 text-slate-500 border border-slate-700/60`}
        title="ATLAS engine call failed or timed out for this path"
      >
        ATLAS · unavailable
      </span>
    )
  }
  const hasChains = atlas.chain_count > 0
  const toneClass = hasChains
    ? "bg-emerald-500/10 text-emerald-200 border-emerald-500/30"
    : "bg-slate-800/60 text-slate-400 border-slate-700/60"
  const label = hasChains
    ? `ATLAS · ${atlas.chain_count} chain${atlas.chain_count === 1 ? "" : "s"}`
    : `ATLAS · 0 chains`
  const titleSuffix = atlas.dead_end_count
    ? ` · ${atlas.dead_end_count} dead-end${atlas.dead_end_count === 1 ? "" : "s"}`
    : ""
  const titleText = hasChains
    ? `${atlas.chain_count} multi-hop chain${atlas.chain_count === 1 ? "" : "s"} validated by ATLAS (${atlas.catalog_version})${titleSuffix} — ${atlas.elapsed_ms}ms`
    : `ATLAS engine ran but found 0 chains for this (workload→jewel) pair against catalog ${atlas.catalog_version}. ${atlas.coverage_warnings.length ? `Coverage notes: ${atlas.coverage_warnings.map((w) => w.code).join(", ")}.` : "May reflect catalog/assumption coverage gap, not absence of risk."}`
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border ${
        compact ? "px-1.5 py-[1px] text-[8px]" : "px-1.5 py-0.5 text-[9px]"
      } font-bold uppercase tracking-wider ${toneClass}`}
      title={titleText}
    >
      {label}
    </span>
  )
}

// ─── Architecture builder ────────────────────────────────────────
//
// Project the EXFIL payload into a SystemArchitecture that
// TrafficFlowMap can render. BFS-forward from the jewel — opposite
// direction from the attacker-view buildAttackerArchitecture.
//
// 9-lane mapping (design doc §3):
//   1. CJ SOURCE            → entryPoints + entryLaneLabel="Source"
//   2. READER PRINCIPAL     → iamRoles (+ principals if non-role actor)
//   3. READER WORKLOAD      → computeServices
//   4. STAGING              → no lane today (honestly empty)
//   5. EGRESS GATE          → securityGroups + nacls
//   6. EGRESS PATH          → subnets + egressGateways (+ vpcEndpoints)
//   7. EXFIL CHANNEL        → exfilGate (typed, strength-colored)
//   8. EXTERNAL DESTINATION → resources
//   9. DEFENSE              → workloadNetwork overlay banner
//
// Heavy serverless fans (e.g. a single role attached to 14 Lambdas)
// would dominate the canvas — cap the compute lane and emit a
// "+N more" placeholder so the count stays honest without exploding
// the visual.
const EXFIL_COMPUTE_VISIBLE_CAP = 5

function buildExfilArchitecture(
  payload: ExfilPayload,
  selectedPath: ExfilPath | null,
): SystemArchitecture {
  const computeServices: ServiceNode[] = []
  const resources: ServiceNode[] = []
  const iamRoles: SecurityCheckpoint[] = []
  const subnets: SubnetNode[] = []
  const securityGroups: SecurityCheckpoint[] = []
  const egressGateways: EgressGatewayNode[] = []
  const exfilGate: ExfilGateNode[] = []
  const entryPoints: ServiceNode[] = []
  const flows: TrafficFlow[] = []
  const seen = new Set<string>()

  // Explicit-edges contract for TFM's renderer — each synthesized flow
  // gets a paired CanvasEdge with relationship + plane classification.
  // Renderer draws one plane-colored curve per edge; flows[] stays for
  // back-compat header math (totalBytes / totalConnections).
  const builtEdges: CanvasEdge[] = []
  const edgeKeys = new Set<string>()
  const pushEdge = (
    source: string,
    target: string,
    relationship: string,
    observed: boolean | null,
    bytes: number | null,
    hitCount: number | null,
    port: number | null,
    protocol: string | null,
  ) => {
    if (!source || !target) return
    const rel = relationship.toUpperCase()
    const id = `${source}|${rel}|${target}`
    if (edgeKeys.has(id)) return
    edgeKeys.add(id)
    builtEdges.push({
      id,
      source_aws_id: source,
      target_aws_id: target,
      relationship: rel as CanvasRelationshipType,
      observed,
      hit_count: hitCount,
      bytes,
      first_seen: null,
      last_seen: null,
      port,
      protocol,
    })
  }

  // When a path is selected, restrict to its (accessor, channel) slice.
  // Otherwise show every row (initial-frame fallback before selection).
  const networkRows = selectedPath
    ? payload.egress_lanes.network.filter(
        (e) =>
          e.accessor_id === selectedPath.accessor_id &&
          (e.channel ?? "") === selectedPath.channel,
      )
    : payload.egress_lanes.network

  const accessorsForPath = selectedPath
    ? payload.accessors.filter((a) => a.id === selectedPath.accessor_id)
    : payload.accessors

  // ── 1. CJ SOURCE ──────────────────────────────────────────────────
  // Jewel renders in entryPoints with entryLaneLabel="Source" so the
  // leftmost lane header reads "Source", not "Entry". Chip type derived
  // from the real jewel.type so the badge honestly reflects what the
  // resource IS (S3, DynamoDB, RDS, …) instead of "PRINCIPAL".
  const jewelId = payload.jewel.id
  entryPoints.push({
    id: jewelId,
    name: payload.jewel.name,
    shortName: shortName(payload.jewel.name),
    type: jewelToNodeType(payload.jewel.type),
    instanceId: jewelId.slice(-12),
  })

  // ── 2. READER PRINCIPAL ──────────────────────────────────────────
  // IAM role(s) that read the jewel. Carries used / allowed action
  // counts so the role card's gap ring renders against real numbers.
  for (const a of accessorsForPath) {
    if (seen.has(a.id)) continue
    seen.add(a.id)
    const friendlyName = friendlyAccessorName(a.name)
    iamRoles.push({
      id: a.id,
      type: "iam_role",
      name: friendlyName,
      shortName: shortName(friendlyName, 30),
      usedCount: a.used_actions_count ?? 0,
      totalCount: a.allowed_actions_count ?? 0,
      gapCount: a.unused_actions_count ?? 0,
      connectedSources: [],
      connectedTargets: [],
      // Blast-radius lateral surfaces only — keep the role chip slim.
      // The dense assumedBy/policiesAttached/actionsUsed inline-sections
      // that briefly lived on the role chip (2026-05-27 mid-day) were
      // reverted late afternoon — operator feedback "i cant understand
      // nothing." Those data points still surface in the STACK
      // COMPONENTS sidebar (PRINCIPALS / IAM POLICIES / API CALLS),
      // which is the right place for them. The role chip stays focused
      // on the LATERAL story (where else does this role reach).
      alsoReaches: a.also_reaches ?? [],
      sharedWith: a.shared_with ?? [],
    })
    // Jewel → accessor (the read edge inverted into "data leaves jewel
    // via this accessor"). Animated red line when observed.
    flows.push({
      sourceId: jewelId,
      targetId: a.id,
      ports: [],
      protocol: "iam",
      bytes: a.total_bytes,
      connections: a.hit_count || 1,
      isActive: a.provenance === "observed",
    })
    pushEdge(
      jewelId,
      a.id,
      "ACCESSES_RESOURCE",
      a.provenance === "observed",
      a.total_bytes ?? 0,
      a.hit_count ?? 0,
      null,
      null,
    )
  }

  // ── 3. READER WORKLOAD ───────────────────────────────────────────
  // Workloads carrying the accessor role. De-duped by id. Heavy fans
  // (one role × 14 Lambdas) collapse into top-N + "+N more".
  const allWorkloads: ServiceNode[] = []
  for (const e of networkRows) {
    const w = e.via_workload
    if (!w?.id || seen.has(w.id)) continue
    seen.add(w.id)
    allWorkloads.push({
      id: w.id,
      name: w.name,
      shortName: shortName(w.name, 30),
      type: w.type.toLowerCase().includes("lambda") ? "lambda" : "compute",
      instanceId: w.id.startsWith("i-") ? w.id : w.id.slice(-12),
    })
  }
  if (allWorkloads.length <= EXFIL_COMPUTE_VISIBLE_CAP) {
    computeServices.push(...allWorkloads)
  } else {
    computeServices.push(...allWorkloads.slice(0, EXFIL_COMPUTE_VISIBLE_CAP))
    const hiddenCount = allWorkloads.length - EXFIL_COMPUTE_VISIBLE_CAP
    computeServices.push({
      id: `__exfil_more__:${allWorkloads.length}`,
      name: `+${hiddenCount} more workload${hiddenCount === 1 ? "" : "s"}`,
      shortName: `+${hiddenCount} more`,
      type: "compute",
      instanceId: `${hiddenCount} hidden`,
    })
  }

  // ── 5+6. EGRESS GATE + EGRESS PATH (network) ─────────────────────
  // Subnets, route-tables, security groups, gateways. Sourced from the
  // network-egress payload's via_subnet / via_security_groups + the
  // EGRESS_KINDS rows. Lane 4 (STAGING) intentionally stays empty —
  // no collector today; absence is the honest signal.
  const subnetSeen = new Set<string>()
  for (const e of networkRows) {
    const s = e.via_subnet
    if (!s?.id || subnetSeen.has(s.id)) continue
    subnetSeen.add(s.id)
    subnets.push({
      id: s.id,
      name: s.name,
      shortName: shortName(s.name, 26),
      isPublic: s.public,
      vpcId: e.via_vpc?.id ?? undefined,
      connectedComputeIds: [],
      routeTableId: s.route_table?.id,
      routeTableCount: s.route_table?.route_count ?? undefined,
      routeTableIsMain: s.route_table?.is_main ?? undefined,
    } as SubnetNode)
  }

  // 2026-05-30 — track which workload(s) each SG is attached to so the
  // canvas can label per-SG attribution. Critical on multi-reader
  // exfil paths where two SGs ("alon-demo-app-sg" + "default") look
  // ambiguous without knowing which compute they belong to.
  const sgToWorkloads = new Map<string, Set<string>>()
  for (const e of networkRows) {
    const wlName = e.via_workload?.name
    if (!wlName) continue
    for (const sg of e.via_security_groups || []) {
      if (!sg?.id) continue
      if (!sgToWorkloads.has(sg.id)) sgToWorkloads.set(sg.id, new Set())
      sgToWorkloads.get(sg.id)!.add(wlName)
    }
  }

  const sgSeen = new Set<string>()
  for (const e of networkRows) {
    for (const sg of e.via_security_groups || []) {
      if (!sg?.id || sgSeen.has(sg.id)) continue
      sgSeen.add(sg.id)
      const inb = Number(sg.inbound_rule_count ?? 0) || 0
      const outb = Number(sg.outbound_rule_count ?? 0) || 0
      securityGroups.push({
        id: sg.id,
        type: "security_group",
        name: sg.name,
        shortName: shortName(sg.name, 24),
        usedCount: 0,
        totalCount: inb + outb,
        gapCount: 0,
        connectedSources: [],
        connectedTargets: [],
        attachedWorkloads: Array.from(sgToWorkloads.get(sg.id) ?? []),
      })
    }
  }

  // Backfill subnets + SGs from path.workload_network when networkRows
  // didn't carry them (serverless_direct paths emit WorkloadOnly rows
  // without subnet/SG edges, but the workload itself may still be
  // VPC-attached). workload_network is the authoritative per-workload
  // signal — use it as a backfill source.
  if (selectedPath?.workload_network?.is_vpc_attached) {
    for (const s of selectedPath.workload_network.subnets) {
      if (!s.id || subnetSeen.has(s.id)) continue
      subnetSeen.add(s.id)
      subnets.push({
        id: s.id,
        name: s.name ?? s.id,
        shortName: shortName(s.name ?? s.id, 26),
        isPublic: s.is_public ?? undefined,
        vpcId: selectedPath.workload_network.vpc_id ?? undefined,
        connectedComputeIds: [],
      } as SubnetNode)
    }
    for (const sg of selectedPath.workload_network.security_groups) {
      if (!sg.id || sgSeen.has(sg.id)) continue
      sgSeen.add(sg.id)
      securityGroups.push({
        id: sg.id,
        type: "security_group",
        name: sg.name ?? sg.id,
        shortName: shortName(sg.name ?? sg.id, 24),
        usedCount: 0,
        totalCount: 0,
        gapCount: 0,
        connectedSources: [],
        connectedTargets: [],
      })
    }
  }

  // EGRESS PATH gateways — real AWS gateway resources only. WorkloadOnly
  // placeholder rows in networkRows are NOT gateways; filtering them out
  // prevents the "EGRESS GATEWAYS (15)" miscount on serverless paths.
  const EGRESS_KINDS = new Set([
    "InternetGateway",
    "NATGateway",
    "EgressOnlyInternetGateway",
    "TransitGateway",
    "VPCEndpoint",
  ])
  for (const e of networkRows) {
    if (!EGRESS_KINDS.has(e.kind)) continue
    if (seen.has(e.id)) continue
    seen.add(e.id)
    const kind = (e.kind as EgressGatewayNode["kind"]) || "InternetGateway"
    const kindLabel: Record<string, string> = {
      InternetGateway: "IGW",
      NATGateway: "NAT GW",
      EgressOnlyInternetGateway: "Egress-only IGW",
      TransitGateway: "Transit GW",
      VPCEndpoint: "VPC Endpoint",
    }
    egressGateways.push({
      id: e.id,
      name: e.name,
      shortName: shortName(e.name),
      vpcId: e.via_vpc?.id ?? null,
      kind: kind,
      kindLabel: kindLabel[kind] || kind,
      // 2026-05-30 — route provenance for "via 0.0.0.0/0" or
      // "via com.amazonaws.eu-west-1.s3" subtitle on the chip.
      // Defensive ?? null because the backend may omit these fields
      // for in-vpc-only gateways (now filtered out backend-side, but
      // forwards-compat for older API responses).
      routed: e.routed ?? false,
      routeDestinationCidr: e.route_destination_cidr ?? null,
      routeTargetService: e.route_target_service ?? null,
      serviceHint:
        e.route_target_service?.split(".").pop() ??
        e.service_name?.split(".").pop(),
    })
    if (e.via_workload?.id) {
      flows.push({
        sourceId: e.via_workload.id,
        targetId: e.id,
        ports: [],
        protocol: "tcp",
        bytes: 0,
        connections: 0,
        isActive: false,
      })
      pushEdge(e.via_workload.id, e.id, "ROUTES_VIA", false, 0, 0, null, null)
      const sgIdForEdge = e.via_security_groups?.[0]?.id
      if (sgIdForEdge) {
        pushEdge(e.via_workload.id, sgIdForEdge, "SECURED_BY", false, 0, 0, null, null)
      }
    }
  }

  // ── 7. EXFIL CHANNEL + 8. EXTERNAL DESTINATION ───────────────────
  // One virtual ExfilGate card per selected path, color-coded by gate
  // strength (emerald=strong, blue=weak_observable, amber=weak_unobservable).
  // Destination card sits to the right of the gate — Internet for IGW/NAT
  // paths, "AWS partition" for service-plane paths (no further controls).
  if (selectedPath) {
    const observedRouteCount = payload.destinations.reduce(
      (s, d) => s + (d.observed_route_count || 0),
      0,
    )
    const observedBytes = payload.destinations.reduce(
      (s, d) => s + (d.observed_bytes_24h || 0),
      0,
    )
    const isObserved = observedRouteCount > 0

    let destId: string
    let destLabel: string
    let destType: "internet" | "storage"
    let destProtocol: string
    let routeSourceIds: string[]
    let destIsTracked = false

    const gateId = `exfil-gate:${selectedPath.path_id}`
    let gateKind: ExfilGateNode["kind"]
    let gateKindLabel: string
    let gateName: string
    let gateStrength: ExfilGateNode["gateStrength"]
    let gateHint: string

    if (selectedPath.channel === "network_via_igw") {
      const realGw = egressGateways[0]
      gateKind = realGw?.kind === "NATGateway" ? "NATGateway" : "InternetGateway"
      gateKindLabel = realGw?.kindLabel ?? "IGW"
      gateName = realGw?.name ?? "Internet Gateway"
      gateStrength = "weak_observable"
      gateHint = "VPC Flow Logs · SG egress is the final gate"
      destId = "internet"
      destLabel = "Internet"
      destType = "internet"
      destProtocol = "internet"
      routeSourceIds = egressGateways.map((g) => g.id)
      destIsTracked = true
    } else if (selectedPath.channel === "direct_api") {
      gateKind = "AWSServicePlane"
      gateKindLabel = "AWS Control Plane"
      gateName = "Public AWS API endpoint"
      gateStrength = "weak_unobservable"
      gateHint = "IAM is the only gate — no VPC, no SG"
      destId = `exfil-dest:aws-partition:${selectedPath.path_id}`
      destLabel = "AWS partition"
      destType = "internet"
      destProtocol = "https"
      routeSourceIds = [selectedPath.accessor_id]
    } else {
      // serverless_direct / ec2_no_egress — bytes leave through the AWS
      // public API endpoint. Gate = service plane (weak / unobservable).
      gateKind = "AWSServicePlane"
      gateKindLabel = "AWS Service Plane"
      gateName = `Public ${payload.jewel.type} endpoint`
      gateStrength = "weak_unobservable"
      gateHint = "No VPC · IAM is the only gate"
      destId = `exfil-dest:aws-partition:${selectedPath.path_id}`
      destLabel = "AWS partition"
      destType = "internet"
      destProtocol = "https"
      routeSourceIds = computeServices
        .filter((c) => !c.id.startsWith("__exfil_more__"))
        .map((c) => c.id)
    }

    exfilGate.push({
      id: gateId,
      kind: gateKind,
      kindLabel: gateKindLabel,
      name: gateName,
      shortName: shortName(gateName, 22),
      gateStrength,
      hint: gateHint,
    })

    const routeCount = Math.max(1, routeSourceIds.length)
    const headlineSuffix = destIsTracked
      ? observedRouteCount > 0
        ? `${routeCount} route${routeCount === 1 ? "" : "s"} · ${observedRouteCount} observed`
        : `${routeCount} route${routeCount === 1 ? "" : "s"} capable`
      : "no further controls"
    const richLabel = `${destLabel} — ${headlineSuffix}`

    resources.push({
      id: destId,
      name: richLabel,
      shortName: destIsTracked
        ? shortName(destLabel, 18) +
          (observedRouteCount > 0 ? `  ${observedRouteCount}/${routeCount}` : `  ${routeCount}↗`)
        : shortName(destLabel, 22),
      type: destType,
    } as ServiceNode)

    // Draw destination edges ONLY for tracked destinations (real AWS
    // gateway → Internet). Conceptual placeholders (AWS partition, no
    // graph edge) render the chip but skip the line — a synthesized
    // line would imply observed flow that the graph can't back.
    if (destIsTracked) {
      const destRel: string =
        selectedPath.channel === "network_via_igw" ? "ROUTES_VIA" : "ACCESSES_RESOURCE"
      for (const srcId of routeSourceIds) {
        flows.push({
          sourceId: srcId,
          targetId: destId,
          ports: [],
          protocol: destProtocol,
          bytes: observedBytes,
          connections: observedRouteCount,
          isActive: isObserved,
        })
        pushEdge(
          srcId,
          destId,
          destRel,
          isObserved,
          observedBytes,
          observedRouteCount,
          null,
          destProtocol,
        )
      }
    }
  } else {
    // Fallback: no path selected (initial frame). Render destinations
    // as a flat aggregate so the canvas isn't empty.
    for (const d of payload.destinations) {
      if (seen.has(d.id)) continue
      seen.add(d.id)
      const isObserved = d.observed_route_count > 0
      const capable = d.capable_route_count
      const observed = d.observed_route_count
      const headlineSuffix =
        observed > 0
          ? `${capable} routes · ${observed} observed`
          : `${capable} route${capable === 1 ? "" : "s"} capable`
      resources.push({
        id: d.id,
        name: `${d.label} — ${headlineSuffix}`,
        shortName:
          shortName(d.label, 18) + (observed > 0 ? `  ${observed}/${capable}` : `  ${capable}↗`),
        type: d.kind === "internet" ? "internet" : "storage",
      } as ServiceNode)
      for (const e of networkRows) {
        flows.push({
          sourceId: e.id,
          targetId: d.id,
          ports: [],
          protocol: d.kind === "internet" ? "internet" : "tcp",
          bytes: d.observed_bytes_24h,
          connections: d.observed_route_count,
          isActive: isObserved,
        })
        pushEdge(
          e.id,
          d.id,
          "ROUTES_VIA",
          isObserved,
          d.observed_bytes_24h,
          d.observed_route_count,
          null,
          d.kind === "internet" ? "internet" : "tcp",
        )
      }
    }
  }

  const totalBytes = flows.reduce((s, f) => s + (f.bytes || 0), 0)
  const totalConnections = flows.reduce((s, f) => s + (f.connections || 0), 0)

  // ── VPC GROUPS (2026-05-30) ─────────────────────────────────────
  // Mirror attacker-view-panel.tsx's vpcGroups build so TFM's
  // VPCBoundaries layer can draw the dashed VPC frame around the
  // exfil flow. Without this the defaultShowVPCBoundaries={true}
  // flag was on but vpcGroups was empty — nothing drew.
  //
  // VPC discovery: walk networkRows for via_vpc + backfill from
  // workload_network when the network rows don't carry it (some
  // serverless paths).
  const vpcsById = new Map<string, { vpcId: string; vpcName: string }>()
  for (const e of networkRows) {
    const v = e.via_vpc
    if (v?.id && !vpcsById.has(v.id)) {
      vpcsById.set(v.id, { vpcId: v.id, vpcName: v.name || v.id })
    }
  }
  if (
    selectedPath?.workload_network?.is_vpc_attached &&
    selectedPath.workload_network.vpc_id &&
    !vpcsById.has(selectedPath.workload_network.vpc_id)
  ) {
    vpcsById.set(selectedPath.workload_network.vpc_id, {
      vpcId: selectedPath.workload_network.vpc_id,
      vpcName: selectedPath.workload_network.vpc_name || selectedPath.workload_network.vpc_id,
    })
  }
  // Per-subnet compute attachment (used to anchor the VPC bounding box).
  const subnetToComputes = new Map<string, string[]>()
  for (const e of networkRows) {
    if (!e.via_subnet?.id || !e.via_workload?.id) continue
    const arr = subnetToComputes.get(e.via_subnet.id) ?? []
    arr.push(e.via_workload.id)
    subnetToComputes.set(e.via_subnet.id, arr)
  }
  // Network-anchor ids: SGs + NACLs in the architecture. Including
  // them in every subnet's nodeIds keeps the VPC bounding box wide
  // enough that the dashed frame visually wraps them rather than
  // cutting through (same fix Attacker View applied — see
  // attacker-view-panel.tsx networkAnchorIds).
  // NACLs intentionally omitted — the Exfil builder doesn't populate
  // a `nacls` array today (return uses inline `nacls: []`). Fold them
  // in here too once that lane gets populated.
  const networkAnchorIds = securityGroups.map((s) => s.id)
  const vpcGroups = Array.from(vpcsById.values()).map((v) => ({
    vpcId: v.vpcId,
    vpcName: v.vpcName,
    subnets: subnets
      .filter((s) => s.vpcId === v.vpcId || !s.vpcId)
      .map((s) => ({
        subnetId: s.id,
        subnetName: s.shortName ?? s.name,
        isPublic: s.isPublic === true,
        nodeIds: [
          ...(subnetToComputes.get(s.id) ?? []),
          s.id,
          ...networkAnchorIds,
        ],
      })),
  }))

  return {
    computeServices,
    entryPoints,
    exfilGate,
    entryLaneLabel: "Source",
    // CloudTrail metrics basis — drops the misleading "0 B Traffic"
    // sub-card (CloudTrail doesn't carry payload size) and relabels
    // "Connections" → "API calls" (hit_count, not TCP).
    metricsBasis: "cloudtrail",
    // ─── STACK-COMPONENTS LANES (2026-05-27) ─────────────────────────
    // Populated from selectedPath.stack_components when present so the
    // sidebar lanes carry real graph data instead of reading "0".
    // Falls back to empty arrays when the field is absent (back-compat
    // with older responses that didn't carry stack_components).
    principals: (selectedPath?.stack_components?.principals ?? []).map(
      (p) =>
        ({
          id: p.id,
          name: p.session_name,
          shortName: shortName(p.session_name, 26),
          type: "principal",
          instanceId:
            p.session_name.length > 14
              ? p.session_name.slice(-12)
              : p.session_name,
        }) as ServiceNode,
    ),
    resources,
    subnets,
    securityGroups,
    nacls: [],
    iamRoles,
    // SecurityCheckpoint.type doesn't have dedicated 'instance_profile'
    // / 'iam_policy' variants — the distinction is encoded by WHICH
    // array the node lands in, not by the discriminator. Same
    // convention used by attacker-view-panel.tsx's IP + policy
    // population (see comments there). totalCount on IPs carries the
    // attached_count so the chip surfaces "how many EC2s use this IP."
    instanceProfiles: (
      selectedPath?.stack_components?.instance_profiles ?? []
    ).map((ip) => ({
      id: ip.id,
      type: "iam_role" as const,
      name: ip.name,
      shortName: shortName(ip.name, 26),
      usedCount: 0,
      totalCount: ip.attached_count,
      gapCount: 0,
      connectedSources: [],
      connectedTargets: [],
    })),
    iamPolicies: (selectedPath?.stack_components?.iam_policies ?? []).map(
      (pol) => ({
        id: pol.id,
        type: "iam_role" as const,
        name: pol.name,
        shortName: shortName(pol.name, 28),
        usedCount: 0,
        totalCount: 0,
        gapCount: 0,
        connectedSources: [],
        connectedTargets: [],
      }),
    ),
    // API CALLS — surface the observed iam_action breakdown for the
    // selected path's role. Each entry is one distinct action with
    // its hit count appended to the display name so the sidebar row
    // reads e.g. "s3:GetObject — 1.2K calls". Sorted desc on backend.
    apiCalls: (selectedPath?.stack_components?.api_calls ?? []).map((a) => ({
      id: `api-call:${a.action}`,
      name: `${a.action} — ${compactNumber(a.calls)} call${a.calls === 1 ? "" : "s"}`,
      shortName:
        a.action.length > 24 ? `${a.action.slice(0, 22)}…` : a.action,
      type: "api_call" as const,
    })),
    vpcEndpoints: [],
    egressGateways,
    flows,
    edges: builtEdges,
    totalBytes,
    totalConnections,
    totalGaps: 0,
    vpcGroups,
    // Evidence-backed DEFENSE overlay — drives TFM's "Non-VPC Workload"
    // banner with real Cypher evidence instead of inferring from empty
    // arrays. null when no path selected (no banner).
    workloadNetwork: selectedPath?.workload_network
      ? {
          is_vpc_attached: selectedPath.workload_network.is_vpc_attached,
          vpc_id: selectedPath.workload_network.vpc_id,
          vpc_name: selectedPath.workload_network.vpc_name,
          evidence: selectedPath.workload_network.evidence,
          workload_count_queried: selectedPath.workload_network.workload_count_queried,
          workload_count_in_sample: selectedPath.workload_network.workload_count_in_sample,
        }
      : null,
  }
}

// ─── String helpers ──────────────────────────────────────────────

function shortName(name: string, maxLen = 22): string {
  if (!name) return ""
  if (name.length <= maxLen) return name
  const half = Math.floor((maxLen - 1) / 2)
  return name.slice(0, half) + "…" + name.slice(-(maxLen - half - 1))
}

// 2026-05-30 defense-in-depth: detect SHA-256-shaped accessor names
// and substitute a friendly label. The collector occasionally writes
// the raw hash into the Principal node's .name field when CloudTrail
// can't resolve the caller's IAM identity (anonymous principal data
// quality artifact). Backend exfil_paths.py already substitutes via
// CASE WHEN in the SELECT; this is the same drop applied at the
// render boundary in case a payload slips through (stale cache,
// alternative endpoint, etc.).
const _SHA256_RE = /^[a-f0-9]{64}$/i
function friendlyAccessorName(name: string | null | undefined): string {
  if (!name) return ""
  if (_SHA256_RE.test(name)) return "Anonymous principal"
  return name
}

// Map AWS jewel type → TFM NodeType so the SOURCE chip badge says
// what the resource actually IS (S3, DynamoDB, RDS, Lambda, EC2)
// instead of "PRINCIPAL". KMS has no dedicated NodeType — storage is
// the least-wrong fallback; the chip subtitle still shows real type.
function jewelToNodeType(
  awsType: string | undefined | null,
): "storage" | "dynamodb" | "database" | "lambda" | "compute" {
  switch (awsType) {
    case "S3Bucket":
      return "storage"
    case "DynamoDBTable":
      return "dynamodb"
    case "RDSInstance":
    case "RDSCluster":
    case "RDSDatabase":
      return "database"
    case "LambdaFunction":
      return "lambda"
    case "EC2Instance":
      return "compute"
    case "KMSKey":
      return "storage"
    default:
      return "storage"
  }
}
