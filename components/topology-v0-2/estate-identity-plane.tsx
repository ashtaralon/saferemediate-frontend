"use client"

/**
 * Estate · Identity & access — the identity plane ON the shared canvas.
 *
 * CF01 · D1. The Identity & access view is the same AwsFrame the Network view
 * draws: same VPC frames, subnet grid, rails, chips, FlowOverlay, selection,
 * fullscreen zoom/pan and DetailPanel. What the lens adds is this band — the
 * identity-only nodes the producer named (roles, users, policies, groups,
 * trust principals, credentials, decision records, resource-policy grants and
 * off-canvas protected resources) rendered as the SAME chip component the
 * canvas already uses (`WorkloadChip`), each carrying a `data-flow-id` anchor
 * so the shared overlay can route identity relationships between a workload
 * in its subnet and the role it runs as, exactly as it routes traffic.
 *
 * Honesty rules this band enforces on screen:
 *   - A chip whose endpoint the producer marked unresolved (a policy ARN not
 *     in the generation, a group name, a credential) is drawn in a name-only,
 *     missing-evidence state, never as a resource that exists here.
 *   - Chips beyond the cap are collapsed with a count, and the relationships
 *     that could not be drawn because their chip is collapsed are counted
 *     beside it. A short list is never a complete one.
 *   - When nothing may be drawn, the band says why in the producer's words
 *     and says explicitly that this is not "no identities".
 */

import { useMemo } from "react"

import { WorkloadChip } from "./aws-frame"
import {
  IDENTITY_KIND_LABEL,
  gapNamesItsCause,
  type IdentityFamilyVerdict,
  type IdentityLens,
  type IdentityLensNode,
  type IdentityLensNodeKind,
} from "./estate-identity-access-model"
import { IDENTITY_LEGEND_ITEMS, IDENTITY_PLANE_COLOR } from "./flow-visuals"
import type { TopologyNode } from "./types"

/** What the frame needs from the host to draw the lens. */
export interface IdentityLensFrameProps {
  lens: IdentityLens
  /** Relationships drawn after the neighbourhood bound. */
  drawn: number
  /** Relationships the bound left out (select a node / raise hops to reach). */
  omitted: number
  /** With a focus: neighbourhood edges the cap left out. Distinct from
   *  `omitted`, which also counts edges outside the neighbourhood. */
  omittedInNeighbourhood?: number
  /** With a focus: neighbourhood size before the cap. */
  reachable?: number
  focusedNodeId: string | null
  hops: number
  onHopsChange?: (hops: number) => void
  /** Chips shown per kind before "+N more". */
  chipCap: number
  onChipCapChange?: (cap: number) => void
}

export const IDENTITY_DEFAULT_CHIP_CAP = 12
export const IDENTITY_MAX_HOPS = 3

/**
 * The topology `type` an identity node is drawn with. IAMRole / IAMPolicy /
 * IAMUser resolve to official icons through the presentation catalog; the
 * rest are text glyphs registered in aws-frame.tsx `nodeIcon`.
 */
export const IDENTITY_TOPOLOGY_TYPE: Record<IdentityLensNodeKind, string> = {
  workload: "Workload",
  iam_role: "IAMRole",
  iam_user: "IAMUser",
  iam_policy: "IAMPolicy",
  iam_group: "IAMGroup",
  service_principal: "ServicePrincipal",
  federated_principal: "FederatedPrincipal",
  aws_account_principal: "AWSAccountPrincipal",
  credential: "IAMCredential",
  protected_resource: "ProtectedResource",
  resource_policy: "ResourcePolicy",
  decision: "ActionDecision",
  // CF01 lane F — distinct from AWSAccountPrincipal. One icon for both would
  // make a trusted external account look like this estate's own account.
  aws_account: "AWSAccount",
  organization: "Organization",
  organizational_unit: "OrganizationalUnit",
  control_policy: "ControlPolicy",
}

const KIND_ORDER: IdentityLensNodeKind[] = [
  "workload",
  "iam_role",
  "iam_user",
  "aws_account",
  "organization",
  "organizational_unit",
  "control_policy",
  "decision",
  "credential",
  "iam_policy",
  "iam_group",
  "service_principal",
  "federated_principal",
  "aws_account_principal",
  "resource_policy",
  "protected_resource",
]

/**
 * An identity-plane node as the TopologyNode the shared chip and the shared
 * DetailPanel consume. `subnet_id`/`score`/`stale` are null because the
 * producer states none of them for an identity node — this is the minimum
 * the chip needs, not a claim about placement or posture.
 */
export function identityNodeAsTopologyNode(node: IdentityLensNode): TopologyNode {
  return {
    id: node.id,
    name: node.label,
    type: IDENTITY_TOPOLOGY_TYPE[node.kind],
    subnet_id: null,
    score: null,
    stale: null,
    is_jewel: false,
    // `resource_id` stays absent: the id is a canvas anchor
    // (`__identity:<kind>:<key>__`), so `inspectableResourceId` returns null
    // and the panel requests nothing from Inventory for it.
  }
}

/**
 * The line under an identity chip's name: what this thing IS, and which
 * account it belongs to.
 *
 * Built only from producer fields (kind, arn, resource_uid). The chip's own id
 * is a canvas anchor and stays internal — rendering `__identity:iam_role:…`
 * told a reader nothing and, truncated, actively hid the account that
 * distinguishes two roles with the same name. Cross-account principals are the
 * case that matters: a trusted external account must never read as the
 * tenant's own.
 */
export function identityChipSubtitle(node: IdentityLensNode): string {
  // arn:aws:iam::416651950952:role/web -> 416651950952
  const fromArn = typeof node.arn === "string" ? node.arn.split(":")[4] : undefined
  // aws:iam:role:416651950952:web -> 416651950952
  const fromUid =
    !fromArn && typeof node.resourceUid === "string" ? node.resourceUid.split(":")[3] : undefined
  const account = fromArn || fromUid
  // The account is the DISCRIMINATOR and must survive the chip width intact —
  // a truncated "416651950…" cannot be told from another account with the same
  // prefix, which is the whole reason it is shown. The kind is already stated
  // by the group header above the chip and by its icon, so spending the line
  // on "IAM role · " pushed the one distinguishing value off the end.
  if (account && /^\d{12}$/.test(account)) return `acct ${account}`
  return IDENTITY_KIND_LABEL[node.kind]
}

function Chip({
  node,
  selected,
  onSelect,
}: {
  node: IdentityLensNode
  selected: boolean
  onSelect: (id: string) => void
}) {
  const topologyNode = useMemo(() => identityNodeAsTopologyNode(node), [node])
  const unresolved = !node.resolved
  return (
    <div
      data-testid="identity-plane-chip"
      data-identity-node-id={node.id}
      data-identity-kind={node.kind}
      data-identity-sublabel={node.sublabel ?? undefined}
      data-identity-resolved={node.resolved ? "true" : "false"}
      className="flex flex-col items-stretch gap-0.5 min-w-0"
      style={
        unresolved
          ? {
              border: `1.5px dashed ${IDENTITY_PLANE_COLOR.unresolved_endpoint}`,
              borderRadius: 8,
              padding: 2,
              background: "#FFFBEB",
            }
          : undefined
      }
      title={
        unresolved
          ? `${IDENTITY_KIND_LABEL[node.kind]} · name only — ${node.unresolvedReason ?? "not a projected resource"}`
          : `${IDENTITY_KIND_LABEL[node.kind]}${node.arn ? ` · ${node.arn}` : ""}`
      }
    >
      <WorkloadChip
        node={topologyNode}
        selected={selected}
        onClick={() => onSelect(node.id)}
        identitySubtitle={identityChipSubtitle(node)}
      />
      {node.sublabel ? (
        <div className="truncate text-[9px] font-mono px-1" style={{ color: "#5A6B7A" }} title={node.sublabel}>
          {node.sublabel}
        </div>
      ) : null}
      {node.facts.slice(0, 2).map(item => (
        <div key={item} className="truncate text-[9px] px-1" style={{ color: "#1A2330" }} title={item}>
          {item}
        </div>
      ))}
      {unresolved ? (
        <div
          className="text-[9px] font-semibold uppercase tracking-wide px-1"
          style={{ color: IDENTITY_PLANE_COLOR.unresolved_endpoint }}
          data-testid="identity-plane-chip-unresolved"
        >
          name only · no evidence node
        </div>
      ) : null}
      {node.gaps.length > 0 ? (
        <div className="text-[9px] px-1" style={{ color: "#92400E" }} data-testid="identity-plane-chip-gaps">
          {node.gaps.length} gap{node.gaps.length === 1 ? "" : "s"}: {node.gaps.map(g => g.code).join(", ")}
        </div>
      ) : null}
    </div>
  )
}

/** The band. Renders inside the AwsFrame flow container so its chips are overlay anchors. */
export function IdentityPlane({
  frame,
  selectedNodeId,
  onSelect,
  compact = false,
}: {
  frame: IdentityLensFrameProps
  selectedNodeId: string | null
  onSelect: (id: string) => void
  compact?: boolean
}) {
  const { lens, chipCap } = frame
  const planeNodes = useMemo(() => lens.nodes.filter(node => !node.onCanvas), [lens.nodes])
  const groups = useMemo(() => {
    const byKind = new Map<IdentityLensNodeKind, IdentityLensNode[]>()
    for (const node of planeNodes) {
      const list = byKind.get(node.kind) ?? []
      list.push(node)
      byKind.set(node.kind, list)
    }
    return KIND_ORDER.filter(kind => byKind.has(kind)).map(kind => {
      const all = [...(byKind.get(kind) ?? [])].sort((a, b) => a.label.localeCompare(b.label))
      // The selected chip is always shown, so a selection never disappears
      // behind the cap.
      const shown = all.slice(0, chipCap)
      if (selectedNodeId && !shown.some(n => n.id === selectedNodeId)) {
        const picked = all.find(n => n.id === selectedNodeId)
        if (picked) shown.push(picked)
      }
      return { kind, all, shown, hidden: all.length - shown.length }
    })
  }, [planeNodes, chipCap, selectedNodeId])

  const hiddenIds = useMemo(() => {
    const ids = new Set<string>()
    for (const group of groups) {
      const shownIds = new Set(group.shown.map(n => n.id))
      for (const node of group.all) if (!shownIds.has(node.id)) ids.add(node.id)
    }
    return ids
  }, [groups])
  const undrawnBecauseCollapsed = useMemo(
    () => lens.edges.filter(edge => hiddenIds.has(edge.sourceId) || hiddenIds.has(edge.targetId)).length,
    [lens.edges, hiddenIds],
  )
  const collapsedTotal = groups.reduce((n, g) => n + g.hidden, 0)

  const stateChip =
    lens.graphState === "ready"
      ? { label: "graph read", color: "#0E8B7A", bg: "#E6FBF7" }
      : lens.graphState === "partial"
        ? { label: "graph read with gaps", color: "#92400E", bg: "#FFFBEB" }
        : lens.graphState === "absent"
          ? { label: "graph not carried", color: "#92400E", bg: "#FFFBEB" }
          : { label: `graph ${lens.graphState}`, color: "#92400E", bg: "#FFFBEB" }

  return (
    <section
      data-testid="identity-lens-plane"
      data-identity-state={lens.state}
      data-identity-graph-state={lens.graphState}
      data-flow-obstacle="identity-plane-header"
      aria-label="Identity plane"
      className={compact ? "rounded-md p-1.5 relative" : "rounded-md p-3 relative"}
      style={{ background: "#FFFFFF", border: "1.5px solid #DD344C", borderLeftWidth: compact ? 4 : 8 }}
    >
      <div className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1 ${compact ? "mb-1" : "mb-2"}`}>
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span
            className="text-[10px] uppercase tracking-[0.14em] font-bold shrink-0"
            style={{ color: "#DD344C" }}
          >
            IAM · Identity plane
          </span>
          <span
            className="rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
            style={{ color: stateChip.color, background: stateChip.bg, borderColor: stateChip.color }}
            data-testid="identity-plane-state"
          >
            {stateChip.label}
          </span>
          {!compact ? (
            <span className="text-[10px]" style={{ color: "#5A6B7A" }} data-testid="identity-plane-counts">
              {planeNodes.length} identity node{planeNodes.length === 1 ? "" : "s"} ·{" "}
              {lens.nodes.length - planeNodes.length} on the topology ·{" "}
              {lens.edges.length} relationship{lens.edges.length === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
        <NeighbourhoodControls frame={frame} compact={compact} />
      </div>

      <TruncationLine frame={frame} collapsedTotal={collapsedTotal} undrawnBecauseCollapsed={undrawnBecauseCollapsed} />

      {!lens.nothingToDraw && lens.edges.length === 0 ? (
        <p className="mb-2 text-[11px]" style={{ color: "#92400E" }} data-testid="identity-plane-no-joins">
          These identities were returned, but no relationships were served for them. Select an identity
          to inspect its evidence. Missing relationships do not prove that it has no access.
        </p>
      ) : null}
      {lens.nothingToDraw ? (
        <IdentityLensNotice lens={lens} />
      ) : (
        <div className={`flex flex-wrap ${compact ? "gap-2" : "gap-3"}`} data-testid="identity-plane-groups">
          {groups.map(group => (
            <div
              key={group.kind}
              className="flex flex-col gap-1 min-w-0"
              data-testid="identity-plane-group"
              data-identity-kind={group.kind}
            >
              <div className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: "#5A6B7A" }}>
                {IDENTITY_KIND_LABEL[group.kind]}
                {group.all.length > 1 ? ` (${group.all.length})` : ""}
              </div>
              <div className={`flex flex-wrap ${compact ? "gap-1" : "gap-2"}`}>
                {group.shown.map(node => (
                  <Chip
                    key={node.id}
                    node={node}
                    selected={node.id === selectedNodeId}
                    onSelect={onSelect}
                  />
                ))}
                {group.hidden > 0 ? (
                  <button
                    type="button"
                    onClick={() => frame.onChipCapChange?.(chipCap + IDENTITY_DEFAULT_CHIP_CAP)}
                    className="self-start rounded-md border px-2 py-1 text-[10px] font-semibold"
                    style={{ borderColor: "#CBD5E1", background: "#F8FAFC", color: "#1A2330" }}
                    data-testid="identity-plane-show-more"
                    title="Show more chips of this kind"
                  >
                    +{group.hidden} more
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function NeighbourhoodControls({ frame, compact }: { frame: IdentityLensFrameProps; compact: boolean }) {
  const { lens, focusedNodeId, hops, drawn, omitted } = frame
  const omittedInNeighbourhood = frame.omittedInNeighbourhood ?? 0
  const outside = focusedNodeId ? Math.max(0, omitted - omittedInNeighbourhood) : 0
  const focused = focusedNodeId ? lens.nodes.find(n => n.id === focusedNodeId) : null
  const breakdown =
    focused && omitted > 0
      ? omittedInNeighbourhood > 0 && outside > 0
        ? ` (${omittedInNeighbourhood} in this neighbourhood, ${outside} outside)`
        : omittedInNeighbourhood > 0
          ? " (inside this neighbourhood)"
          : " (outside this neighbourhood)"
      : ""
  return (
    <div className="flex flex-wrap items-center gap-2 shrink-0" data-testid="identity-neighbourhood">
      <span className={compact ? "text-[9px]" : "text-[10px]"} style={{ color: "#5A6B7A" }} data-testid="identity-neighbourhood-counts">
        {focused ? `Around ${focused.label}: ` : "Whole lens: "}
        {drawn} drawn{omitted > 0 ? ` · ${omitted} not drawn${breakdown}` : ""}
        {!focused && omitted > 0 ? " — select a chip to expand its neighbourhood" : ""}
      </span>
      {focused ? (
        <div
          className="inline-flex rounded-md border overflow-hidden"
          style={{ borderColor: "#CBD5E1", background: "#FFFFFF" }}
          role="group"
          aria-label="Neighbourhood hops"
        >
          {Array.from({ length: IDENTITY_MAX_HOPS }, (_, i) => i + 1).map(n => (
            <button
              key={n}
              type="button"
              onClick={() => frame.onHopsChange?.(n)}
              aria-pressed={hops === n}
              className="px-2 py-0.5 text-[10px] font-semibold"
              style={{ background: hops === n ? "#0D1B2A" : "transparent", color: hops === n ? "#FFFFFF" : "#5A6B7A" }}
              data-testid={`identity-hops-${n}`}
              title={`${n} hop${n === 1 ? "" : "s"} from the selected chip`}
            >
              {n} hop{n === 1 ? "" : "s"}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function TruncationLine({
  frame,
  collapsedTotal,
  undrawnBecauseCollapsed,
}: {
  frame: IdentityLensFrameProps
  collapsedTotal: number
  undrawnBecauseCollapsed: number
}) {
  const { truncation } = frame.lens
  const parts: string[] = []
  if (truncation.producerTruncated) {
    parts.push(
      `the producer truncated this read (${truncation.nodesTotal ?? "?"} nodes / ${truncation.edgesTotal ?? "?"} relationships counted at the source)`,
    )
  }
  if (truncation.rolesTruncated) parts.push("the role list was truncated by the projection")
  if (truncation.rolesOmittedUnresolved !== null && truncation.rolesOmittedUnresolved > 0) {
    parts.push(
      `${truncation.rolesOmittedUnresolved} role${truncation.rolesOmittedUnresolved === 1 ? " was" : "s were"} omitted for an unresolved AWS RoleId`,
    )
  }
  if (collapsedTotal > 0) {
    parts.push(
      `${collapsedTotal} chip${collapsedTotal === 1 ? "" : "s"} collapsed below (${undrawnBecauseCollapsed} relationship${undrawnBecauseCollapsed === 1 ? "" : "s"} to them not drawn)`,
    )
  }
  if (parts.length === 0) return null
  return (
    <div
      className="mb-2 rounded border px-2 py-1 text-[10px]"
      style={{ borderColor: "#F2C94C", background: "#FFFBEB", color: "#92400E" }}
      data-testid="identity-plane-truncation"
    >
      Not everything is on this canvas: {parts.join("; ")}.
    </div>
  )
}

/** The explicit not-an-answer state. Never a blank band. */
export function IdentityLensNotice({ lens }: { lens: IdentityLens }) {
  // The model decides this, not the view. `lens.state` alone is the v1 ROLES
  // projection's word: a payload can read its roles perfectly and still have
  // failed to read its identity graph, and keying the calm "this is an answer"
  // styling off `state === "ready"` rendered that failure as a confident empty.
  const emptyAnswer = lens.emptyAnswer
  return (
    <div
      className="rounded-lg border px-3 py-2.5 text-[11px]"
      style={
        emptyAnswer
          ? { borderColor: "#CBD5E1", background: "#FFFFFF", color: "#1A2330" }
          : { borderColor: "#F2C94C", background: "#FFFBEB", color: "#1A2330" }
      }
      data-testid="identity-lens-notice"
      data-identity-empty-answer={emptyAnswer ? "true" : "false"}
      role="status"
    >
      <div className="font-semibold" style={{ color: emptyAnswer ? "#1A2330" : "#92400E" }}>
        {lens.headline}
      </div>
      <div className="mt-0.5" style={{ color: "#5A6B7A" }}>
        {lens.detail}
      </div>
      {!emptyAnswer ? (
        <div className="mt-1 font-semibold" style={{ color: "#92400E" }}>
          No identity relationship is drawn on this canvas. That is not a statement that there
          are no identities, roles or grants in this scope — the evidence is not available here.
        </div>
      ) : (
        // Even the backed empty is QUALIFIED. The producer derives readiness
        // from the absence of gaps, so a family that returned no rows and one
        // that was never read are indistinguishable to it; only the
        // workload-to-role binding carries a completeness receipt.
        <div
          className="mt-1"
          style={{ color: "#92400E" }}
          data-testid="identity-lens-notice-coverage"
        >
          {lens.coverageMissingLink} Unknown rather than zero here:{" "}
          <span className="font-mono">{lens.familiesWithoutCoverageReceipt.join(", ")}</span>.
        </div>
      )}
      {lens.gaps.length > 0 ? (
        <ul className="mt-1.5 space-y-0.5 font-mono text-[10px]" style={{ color: "#92400E" }}>
          {lens.gaps.slice(0, 8).map((gap, index) => {
            // A gap code printed beside its detail READS AS A NAMED FINDING.
            // Some of these codes name no cause at all: the producer emits them
            // when a failure occurred that its contract cannot classify, and
            // their detail carries only the exception TYPE. Printing such a
            // token the same way as a real diagnosis invites a reader to treat
            // "ValueError" as the finding. The code stays — support needs it,
            // and the producer's own words are never rewritten here — but it is
            // marked as a refusal whose cause was not established.
            const named = gapNamesItsCause(gap.code)
            return (
              <li
                key={`${gap.code}-${index}`}
                data-testid="identity-lens-notice-gap"
                data-gap-code={gap.code}
                data-gap-names-cause={named ? "true" : "false"}
              >
                {gap.code} — <span style={{ color: "#1A2330" }}>{gap.detail}</span>
                {named ? null : (
                  <span
                    data-testid="identity-lens-notice-gap-unnamed"
                    style={{ color: "#92400E" }}
                  >
                    {" "}
                    (the producer could not name a cause — this is a refusal, not a diagnosis)
                  </span>
                )}
              </li>
            )
          })}
          {lens.gaps.length > 8 ? <li>+{lens.gaps.length - 8} more gaps</li> : null}
        </ul>
      ) : null}
    </div>
  )
}

function verdictTone(row: IdentityFamilyVerdict): { color: string; bg: string } {
  if (row.status === "available") return { color: "#0E8B7A", bg: "#E6FBF7" }
  if (row.status === "no_verdict") return { color: "#5A6B7A", bg: "#F8FAFC" }
  return { color: "#92400E", bg: "#FFFBEB" }
}

/** Replaces the traffic FlowLegend on the identity lens. */
export function IdentityLensLegend({ lens, compact = false }: { lens: IdentityLens; compact?: boolean }) {
  const available = lens.families.filter(f => f.status === "available")
  const unavailable = lens.families.filter(f => f.status === "unavailable")
  const noVerdict = lens.families.filter(f => f.status === "no_verdict")
  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-y ${compact ? "px-1 py-1" : "px-2 py-1.5"}`}
      style={{ borderColor: "#E2E8F0", background: "rgba(255,255,255,0.86)" }}
      data-testid="identity-lens-legend"
      data-flow-obstacle="identity-legend"
      aria-label="Identity relationship legend"
    >
      <span className="text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: "#475569" }}>
        Identity lines
      </span>
      {IDENTITY_LEGEND_ITEMS.map(item => (
        <span
          key={item.key}
          className="inline-flex items-center gap-1.5 whitespace-nowrap"
          data-testid={`identity-legend-${item.key}`}
          title={item.detail}
        >
          <svg width="28" height="8" viewBox="0 0 28 8" aria-hidden>
            <path d="M1 4 H23" stroke={item.color} strokeWidth="2" strokeLinecap="round" strokeDasharray={item.dash} />
            <path d="M21 1 L27 4 L21 7 Z" fill={item.color} />
          </svg>
          <span className="text-[9px] font-medium" style={{ color: "#475569" }}>
            {item.label}
          </span>
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5 text-[9px] font-medium" style={{ color: "#0E8B7A" }} data-testid="identity-legend-motion">
        Moving = observed with a named generation · a configured or trust line never moves
      </span>
      <details className="ml-auto text-[9px]" data-testid="identity-legend-families">
        <summary className="cursor-pointer font-semibold" style={{ color: "#475569" }}>
          {available.length} famil{available.length === 1 ? "y" : "ies"} servable ·{" "}
          {unavailable.length} not on the canonical path
          {noVerdict.length > 0 ? ` · ${noVerdict.length} without a verdict` : ""}
        </summary>
        <ul className="mt-1 grid gap-0.5 sm:grid-cols-2">
          {lens.families.map(row => {
            const tone = verdictTone(row)
            return (
              <li
                key={row.family}
                className="rounded border px-1.5 py-0.5"
                style={{ borderColor: tone.color, background: tone.bg }}
                data-testid="identity-legend-family"
                data-family={row.family}
                data-status={row.status}
                data-drawn={String(row.drawn)}
                title={row.detail}
              >
                <span className="font-mono font-semibold" style={{ color: "#1A2330" }}>
                  {row.family}
                </span>{" "}
                <span style={{ color: tone.color }}>
                  {row.status === "available"
                    ? `${row.plane ?? "plane not asserted"} · ${row.drawn} drawn`
                    : row.status === "no_verdict"
                      ? `no verdict carried · ${row.drawn} drawn`
                      : `not drawn — ${row.reason_codes.join(", ")}`}
                </span>
              </li>
            )
          })}
        </ul>
      </details>
    </div>
  )
}
