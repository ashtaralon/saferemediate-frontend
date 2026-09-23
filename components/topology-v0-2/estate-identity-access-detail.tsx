"use client"

/**
 * Estate · Identity & access — focused path inside the shared DetailPanel.
 *
 * One connected diagram with a single shared role vertex: workloads and
 * trust callers on the left, protected resources on the right. Existing
 * cards/edges are reused. The full 1-hop neighbourhood stays listed below
 * with evidence explanations. Bounding keeps the selected component and
 * discloses omitted branches instead of dropping them.
 */

import { useEffect, useMemo, useState } from "react"
import { ArrowDownLeft, ArrowUpRight, ShieldCheck } from "lucide-react"

import {
  ACCESS_PATH_BRANCH_CAP,
  IDENTITY_KIND_LABEL,
  boundAccessPathBranches,
  identityAccessPathHopLabel,
  identityRelationshipExplanation,
  type IdentityAccessPathEndpoint,
  type IdentityAccessPathHop,
  type IdentitySelectionDetail,
  type IdentitySelectionRelationship,
} from "./estate-identity-access-model"
import { IDENTITY_PLANE_COLOR } from "./flow-visuals"

export function EstateIdentityAccessDetail({
  detail,
  onSelectNode,
}: {
  detail: IdentitySelectionDetail
  /** Pivot the shared map selection. Must not reset pan, zoom or filters. */
  onSelectNode?: (id: string) => void
}) {
  const { node, relationships, accessPath } = detail
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [caps, setCaps] = useState({
    workload: ACCESS_PATH_BRANCH_CAP,
    trust: ACCESS_PATH_BRANCH_CAP,
    target: ACCESS_PATH_BRANCH_CAP,
    neighbourhood: ACCESS_PATH_BRANCH_CAP,
  })

  useEffect(() => {
    setSelectedEdgeId(null)
    setCaps({
      workload: ACCESS_PATH_BRANCH_CAP,
      trust: ACCESS_PATH_BRANCH_CAP,
      target: ACCESS_PATH_BRANCH_CAP,
      neighbourhood: ACCESS_PATH_BRANCH_CAP,
    })
  }, [node.id])

  const selectedRel = relationships.find(item => item.edge.id === selectedEdgeId) ?? null
  const selectedHop = accessPath.hops.find(item => item.edge?.id === selectedEdgeId) ?? null
  const explanation = selectedRel
    ? identityRelationshipExplanation(
        selectedRel.edge,
        selectedRel.peer.label,
        IDENTITY_KIND_LABEL[selectedRel.peer.kind],
      )
    : selectedHop?.edge
      ? identityRelationshipExplanation(
          selectedHop.edge,
          selectedHop.from.id === node.id ? selectedHop.to.label : selectedHop.from.label,
          selectedHop.from.id === node.id ? selectedHop.to.kindLabel : selectedHop.from.kindLabel,
        )
      : null

  const selectedId = node.id
  const centerId = accessPath.role?.id ?? accessPath.focus.id
  const isPinnedBranch = (hop: IdentityAccessPathHop) => {
    if (selectedId === centerId) return false
    return hop.from.id === selectedId || hop.to.id === selectedId
  }
  const workloads = useMemo(
    () => boundAccessPathBranches(accessPath.workloads, caps.workload, isPinnedBranch),
    [accessPath.workloads, caps.workload, selectedId, centerId],
  )
  const trust = useMemo(
    () => boundAccessPathBranches(accessPath.trust, caps.trust, isPinnedBranch),
    [accessPath.trust, caps.trust, selectedId, centerId],
  )
  const targets = useMemo(
    () => boundAccessPathBranches(accessPath.targets, caps.target, isPinnedBranch),
    [accessPath.targets, caps.target, selectedId, centerId],
  )
  const incoming = useMemo(
    () => boundAccessPathBranches(accessPath.neighbourhoodIncoming, caps.neighbourhood, isPinnedBranch),
    [accessPath.neighbourhoodIncoming, caps.neighbourhood, selectedId, centerId],
  )
  const outgoing = useMemo(
    () => boundAccessPathBranches(accessPath.neighbourhoodOutgoing, caps.neighbourhood, isPinnedBranch),
    [accessPath.neighbourhoodOutgoing, caps.neighbourhood, selectedId, centerId],
  )

  const rolePath = Boolean(accessPath.role)
  const leftHops = rolePath
    ? [...trust.shown, ...workloads.shown, ...accessPath.selectionJoins.filter(hop => hop.to.id === centerId)]
    : incoming.shown
  const rightHops = rolePath
    ? [...targets.shown, ...accessPath.selectionJoins.filter(hop => hop.from.id === centerId)]
    : outgoing.shown
  const center = accessPath.role ?? accessPath.focus
  const hasDiagram = Boolean(center)
  const omitted = rolePath
    ? [
        { count: workloads.omitted, noun: "workload binding", key: "workload" as const },
        { count: trust.omitted, noun: "trust caller", key: "trust" as const },
        { count: targets.omitted, noun: "target", key: "target" as const },
      ]
    : [{
        count: incoming.omitted + outgoing.omitted,
        noun: "relationship",
        key: "neighbourhood" as const,
      }]

  return (
    <section
      className="mb-4 rounded-xl border p-4"
      style={{ borderColor: "#F3C6CC", background: "#FFF7F8" }}
      data-testid="estate-identity-detail"
      data-identity-kind={node.kind}
      data-identity-state={detail.lensState}
      data-identity-graph-state={detail.graphState}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-bold" style={{ color: "#1A2330" }}>
          <ShieldCheck className="h-4 w-4" style={{ color: "#DD344C" }} />
          Identity &amp; access evidence
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wide">
          <span className="rounded-full border px-2 py-0.5" style={{ borderColor: "#F3C6CC", color: "#B42318" }}>
            {detail.kindLabel}
          </span>
          <span className="rounded-full border px-2 py-0.5" style={{ borderColor: "#DDE3E8", color: "#5A6B7A" }}>
            projection {detail.lensState} · graph {detail.graphState}
          </span>
        </div>
      </div>
      <p className="mt-1 text-xs" style={{ color: "#5A6B7A" }}>
        {relationships.length === 0
          ? "No identity relationship touches this node in the served identity block."
          : `${relationships.length} relationship${relationships.length === 1 ? "" : "s"} from the served identity block. The compact diagram uses served joins only; policies, boundaries, decisions, credentials, groups and organization controls stay listed below.`}
      </p>
      {!node.resolved ? (
        <div
          className="mt-2 rounded-lg border px-3 py-2 text-xs"
          style={{ borderColor: "#F2C94C", background: "#FFFBEB", color: "#92400E" }}
          data-testid="estate-identity-detail-unresolved"
        >
          Name-only endpoint: the producer reports this {IDENTITY_KIND_LABEL[node.kind].toLowerCase()} by
          name{node.arn ? ` (${node.arn})` : ""} and marks it {node.unresolvedReason ?? "not a projected resource"}.
          Nothing about it beyond the relationships below is known here.
        </div>
      ) : null}
      {node.facts.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1.5 text-[10px]" data-testid="estate-identity-detail-facts">
          {node.facts.map(item => (
            <li key={item} className="rounded bg-white px-1.5 py-0.5 border" style={{ borderColor: "#DDE3E8", color: "#1A2330" }}>
              {item}
            </li>
          ))}
        </ul>
      ) : null}
      {detail.gaps.length > 0 ? (
        <ul className="mt-2 space-y-1 text-[10px]" data-testid="estate-identity-detail-gaps">
          {detail.gaps.map((gap, index) => (
            <li key={`${gap.code}-${index}`} className="rounded border px-2 py-1" style={{ borderColor: "#F2C94C", background: "#FFFBEB", color: "#92400E" }}>
              <span className="font-mono font-semibold">{gap.code}</span> <span style={{ color: "#1A2330" }}>{gap.detail}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3" data-testid="estate-identity-access-path">
        {hasDiagram && center ? (
          <ConnectedAccessDiagram
            center={center}
            leftHops={leftHops}
            rightHops={rightHops}
            selectedEdgeId={selectedEdgeId}
            selectedNodeId={node.id}
            onSelectHop={setSelectedEdgeId}
            onSelectNode={onSelectNode}
          />
        ) : (
          <p className="text-[11px]" style={{ color: "#5A6B7A" }} data-testid="estate-identity-access-path-empty">
            No served identity join touches this component.
          </p>
        )}
        {omitted.some(item => item.count > 0) ? (
          <div className="mt-2 flex flex-wrap gap-2" data-testid="estate-identity-access-path-omitted">
            {omitted.filter(item => item.count > 0).map(item => (
              <button
                key={item.key}
                type="button"
                className="rounded border px-2 py-1 text-[10px] font-semibold"
                style={{ borderColor: "#F2C94C", background: "#FFFBEB", color: "#92400E" }}
                data-testid={`estate-identity-access-path-expand-${item.key}`}
                onClick={() => setCaps(current => ({ ...current, [item.key]: current[item.key] + ACCESS_PATH_BRANCH_CAP }))}
              >
                {item.count} more {item.noun}{item.count === 1 ? "" : "s"} — show
              </button>
            ))}
          </div>
        ) : null}
        {accessPath.gaps.length > 0 ? (
          <ul className="mt-2 space-y-1 text-[10px]" data-testid="estate-identity-access-path-gaps">
            {accessPath.gaps.map(gap => (
              <li key={gap.code} data-gap-code={gap.code} style={{ color: "#92400E" }}>
                <span className="font-mono font-semibold">{gap.code}</span> {gap.detail}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {relationships.length > 0 ? (
        <ul className="mt-3 space-y-2" data-testid="estate-identity-relationships">
          {relationships.map(item => (
            <RelationshipRow
              key={item.edge.id}
              item={item}
              selected={item.edge.id === selectedEdgeId}
              onSelectHop={setSelectedEdgeId}
              onSelectNode={onSelectNode}
            />
          ))}
        </ul>
      ) : null}

      {explanation ? (
        <RelationshipExplanation explanation={explanation} />
      ) : relationships.length > 0 ? (
        <p className="mt-3 text-xs" style={{ color: "#5A6B7A" }} data-testid="estate-identity-access-path-hint">
          Click a name or card to pivot this explanation. Click an edge label or relationship for
          policies, actions, conditions and evidence. The map keeps its position and filters.
        </p>
      ) : null}

      {detail.receipts.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-mono" style={{ color: "#5A6B7A" }} data-testid="estate-identity-detail-receipts">
          {detail.receipts.map(item => (
            <span key={item.label}>
              {item.label}: generation {item.generation} · projected through {item.projectedThrough}
              {item.projectionReceiptHash ? " · receipt" : " · no receipt"}
            </span>
          ))}
        </div>
      ) : null}
      {detail.scope ? (
        <div className="mt-1 text-[10px] font-mono" style={{ color: "#5A6B7A" }}>
          scope {detail.scope.account_id ?? "—"} · {detail.scope.region ?? "—"} · {detail.scope.system_name ?? "—"}
        </div>
      ) : null}
    </section>
  )
}

function ConnectedAccessDiagram({
  center,
  leftHops,
  rightHops,
  selectedEdgeId,
  selectedNodeId,
  onSelectHop,
  onSelectNode,
}: {
  center: IdentityAccessPathEndpoint
  leftHops: IdentityAccessPathHop[]
  rightHops: IdentityAccessPathHop[]
  selectedEdgeId: string | null
  selectedNodeId: string
  onSelectHop: (id: string) => void
  onSelectNode?: (id: string) => void
}) {
  // Fixed card dimensions and one coordinate system make every connector
  // terminate on the rendered card border, including off-centre branches.
  const cardWidth = 176
  const cardHeight = 64
  const laneWidth = 144
  const step = 88
  const height = Math.max(leftHops.length, rightHops.length, 1) * step - (step - cardHeight)
  const centerX = leftHops.length ? cardWidth + laneWidth : 0
  const centerY = (height - cardHeight) / 2
  const width = centerX + cardWidth + (rightHops.length ? laneWidth + cardWidth : 0)

  const branch = (hop: IdentityAccessPathHop, index: number, side: "left" | "right", count: number) => {
    const left = side === "left"
    const x = left ? 0 : centerX + cardWidth + laneWidth
    const y = (height - (count * step - (step - cardHeight))) / 2 + index * step
    const endpoint = left ? hop.from : hop.to
    const portY = centerY + cardHeight * (index + 1) / (count + 1)
    const outerY = y + cardHeight / 2
    const points = left
      ? [[cardWidth, outerY], [centerX - 40, outerY], [centerX - 16, portY], [centerX, portY]]
      : [[centerX + cardWidth, portY], [centerX + cardWidth + 16, portY], [x - 104, outerY], [x, outerY]]
    // The visual role→resource layout must not reverse a producer edge that
    // actually runs resource→role. Arrow direction follows the served ids.
    if (hop.edge && hop.edge.sourceId !== hop.from.id) points.reverse()
    return (
      <div key={hop.id} data-testid="estate-identity-access-path-branch" data-branch={hop.branch}>
        <div style={{ position: "absolute", left: x, top: y, width: cardWidth, height: cardHeight }}>
          <PathNodeCard endpoint={endpoint} selected={endpoint.id === selectedNodeId} onSelectNode={onSelectNode} />
        </div>
        <PathEdge
          hop={hop}
          selected={hop.edge?.id === selectedEdgeId}
          onSelectHop={onSelectHop}
          points={points}
          width={width}
          height={height}
          labelX={left ? cardWidth + 4 : x - 108}
          labelY={y + 4}
        />
      </div>
    )
  }
  return (
    <div className="overflow-x-auto" data-testid="estate-identity-access-path-diagram">
      <div style={{ position: "relative", width, height }}>
        <div style={{ position: "absolute", left: centerX, top: centerY, width: cardWidth, height: cardHeight }}>
          <PathNodeCard endpoint={center} selected={center.id === selectedNodeId} onSelectNode={onSelectNode} />
        </div>
        {leftHops.map((hop, index) => branch(hop, index, "left", leftHops.length))}
        {rightHops.map((hop, index) => branch(hop, index, "right", rightHops.length))}
      </div>
    </div>
  )
}

function PathNodeCard({
  endpoint,
  selected,
  onSelectNode,
}: {
  endpoint: IdentityAccessPathEndpoint
  selected: boolean
  onSelectNode?: (id: string) => void
}) {
  const missing = endpoint.missing
  return (
    <button
      type="button"
      className="h-full w-full border px-3 py-2 text-left"
      style={{
        width: "100%", height: "100%", boxSizing: "border-box",
        borderColor: missing ? "#F2C94C" : selected ? "#00A991" : "#CBD5E1",
        background: missing ? "#FFFBEB" : selected ? "#F0FDFA" : "#FFFFFF",
      }}
      data-testid={missing ? "estate-identity-access-path-missing-target" : "estate-identity-access-path-node"}
      data-node-id={endpoint.id}
      disabled={missing}
      onClick={() => {
        if (!missing) onSelectNode?.(endpoint.id)
      }}
    >
      <div className="truncate text-xs font-semibold" title={endpoint.label} style={{ color: "#1A2330" }}>
        {endpoint.label}
      </div>
      <div className="mt-1 truncate text-[9px] uppercase" style={{ color: "#64748B" }}>
        {endpoint.kindLabel}
      </div>
    </button>
  )
}

function PathEdge({
  hop, selected, onSelectHop, points, width, height, labelX, labelY,
}: {
  hop: IdentityAccessPathHop
  selected: boolean
  onSelectHop: (id: string) => void
  points: number[][]
  width: number
  height: number
  labelX: number
  labelY: number
}) {
  const edge = hop.edge
  const hopLabel = edge ? identityAccessPathHopLabel(edge) : "No served target join"
  const color = selected ? "#DD344C" : edge
    ? IDENTITY_PLANE_COLOR[edge.certainty === "unresolved_endpoint" ? "unresolved_endpoint" : edge.plane]
    : "#92400E"
  const end = points[points.length - 1]
  const previous = points[points.length - 2]
  const direction = Math.sign(end[0] - previous[0])
  return (
    <div data-testid="estate-identity-access-path-edge" data-family={edge?.family ?? "missing"}
      data-plane={edge?.plane ?? "unknown"} data-certainty={edge?.certainty ?? "unresolved_endpoint"}
      data-branch={hop.branch}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }} aria-label={hopLabel}>
        <path
          data-testid="estate-identity-access-path-connector"
          data-source-id={edge?.sourceId ?? hop.from.id}
          data-target-id={edge?.targetId ?? hop.to.id}
          d={points.map(([x, y], index) => `${index ? "L" : "M"}${x} ${y}`).join(" ")}
          fill="none" stroke={color} strokeWidth="2"
          strokeDasharray={!edge || edge.plane === "configured" ? "7 5" : undefined}
        />
        {edge ? <path d={`M${end[0]} ${end[1]} L${end[0] - direction * 8} ${end[1] - 4} L${end[0] - direction * 8} ${end[1] + 4} Z`} fill={color} /> : null}
      </svg>
      {edge ? (
        <button type="button" data-testid="estate-identity-access-path-hop"
          className="truncate rounded bg-white/90 px-1 text-[9px] font-semibold"
          style={{ position: "absolute", left: labelX, top: labelY, width: 104, color }}
          title={hopLabel} onClick={() => onSelectHop(edge.id)}>{hopLabel}</button>
      ) : (
        <div data-testid="estate-identity-access-path-missing-hop"
          className="text-center text-[9px] font-semibold"
          style={{ position: "absolute", left: labelX, top: labelY, width: 104, color }}>{hopLabel}</div>
      )}
    </div>
  )
}

function RelationshipRow({
  item,
  selected,
  onSelectHop,
  onSelectNode,
}: {
  item: IdentitySelectionRelationship
  selected: boolean
  onSelectHop: (id: string) => void
  onSelectNode?: (id: string) => void
}) {
  const { edge, direction, peer } = item
  const key = edge.certainty === "unresolved_endpoint" ? "unresolved_endpoint" : edge.plane
  const color = IDENTITY_PLANE_COLOR[key]
  const hopLabel = identityAccessPathHopLabel(edge)
  return (
    <li
      className="rounded-lg border bg-white p-3"
      style={{ borderColor: selected ? "#DD344C" : "#DDE3E8" }}
      data-testid="estate-identity-relationship"
      data-family={edge.family}
      data-plane={edge.plane}
      data-certainty={edge.certainty}
      data-direction={direction}
      data-animated={edge.animated ? "true" : "false"}
    >
      <div className="flex flex-wrap items-center gap-2">
        {direction === "outgoing"
          ? <ArrowUpRight className="h-4 w-4" style={{ color }} />
          : <ArrowDownLeft className="h-4 w-4" style={{ color }} />}
        <button
          type="button"
          className="text-left text-sm font-semibold"
          style={{ color: "#1A2330" }}
          data-testid="estate-identity-access-path-peer"
          onClick={() => onSelectNode?.(peer.id)}
        >
          {peer.label}
        </button>
        <button
          type="button"
          className="text-[10px] underline-offset-2 hover:underline"
          style={{ color: "#5A6B7A" }}
          data-testid="estate-identity-access-path-hop"
          onClick={() => onSelectHop(edge.id)}
        >
          {direction === "outgoing" ? `${hopLabel} →` : `← ${hopLabel}`}
        </button>
        <span className="text-[10px]" style={{ color: "#5A6B7A" }}>
          {IDENTITY_KIND_LABEL[peer.kind]}
        </span>
        <span
          className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={
            edge.plane === "observed"
              ? { background: "#E6FBF7", color: "#0E8B7A", borderColor: "#9FE8DC" }
              : { background: "#EFF6FF", color: "#1D4ED8", borderColor: "#BFDBFE" }
          }
        >
          {edge.plane}
        </span>
        {edge.certainty === "unresolved_endpoint" ? (
          <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ borderColor: "#FED7AA", background: "#FFF7ED", color: "#C2410C" }}>
            endpoint unresolved
          </span>
        ) : null}
        {edge.animated ? (
          <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ borderColor: "#9FE8DC", background: "#E6FBF7", color: "#0E8B7A" }}>
            generation {edge.generation}
          </span>
        ) : null}
      </div>
    </li>
  )
}

function RelationshipExplanation({
  explanation,
}: {
  explanation: ReturnType<typeof identityRelationshipExplanation>
}) {
  return (
    <div
      className="mt-3 rounded-lg border bg-white p-3"
      data-testid="estate-identity-relationship-explanation"
      data-family={explanation.family}
      data-plane={explanation.plane}
    >
      <div className="text-sm font-semibold" style={{ color: "#1A2330" }}>
        {explanation.hopLabel}
      </div>
      <p className="mt-1 text-xs" style={{ color: "#92400E" }} data-testid="estate-identity-relationship-honesty">
        {explanation.honesty}
      </p>
      <dl className="mt-2 grid gap-1 text-[11px]" style={{ color: "#1A2330" }}>
        <div>
          <dt className="inline font-semibold">Family </dt>
          <dd className="inline font-mono">{explanation.family}</dd>
        </div>
        <div>
          <dt className="inline font-semibold">Plane </dt>
          <dd className="inline">{explanation.plane}</dd>
        </div>
        {explanation.actions ? (
          <div data-testid="estate-identity-relationship-actions">
            <dt className="inline font-semibold">Actions </dt>
            <dd className="inline font-mono">{explanation.actions}</dd>
          </div>
        ) : (
          <div data-testid="estate-identity-relationship-actions-absent">
            No action list was served on this relationship.
          </div>
        )}
        {explanation.conditionsPresent === null ? (
          <div data-testid="estate-identity-relationship-conditions-absent">
            No condition flag was served on this relationship.
          </div>
        ) : (
          <div data-testid="estate-identity-relationship-conditions">
            Conditions {explanation.conditionsPresent ? "are present on the statement" : "are not present on the statement"}.
          </div>
        )}
        {explanation.resourceScope ? (
          <div data-testid="estate-identity-relationship-scope">
            <dt className="inline font-semibold">Resource scope </dt>
            <dd className="inline font-mono">{explanation.resourceScope}</dd>
          </div>
        ) : (
          <div data-testid="estate-identity-relationship-scope-absent">
            No action resource scope was served on this relationship.
          </div>
        )}
        {explanation.evidence.length > 0 ? (
          <div data-testid="estate-identity-relationship-evidence">
            <dt className="inline font-semibold">Evidence </dt>
            <dd className="inline">{explanation.evidence.join(" · ")}</dd>
          </div>
        ) : (
          <div data-testid="estate-identity-relationship-evidence-absent">
            No generation or last-seen timestamp was served on this hop.
          </div>
        )}
      </dl>
      {explanation.facts.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]" style={{ color: "#5A6B7A" }}>
          {explanation.facts.map(item => (
            <li key={item.name} className="font-mono">
              {item.name}={item.value}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
