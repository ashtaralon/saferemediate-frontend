"use client"

/**
 * Estate · Identity & access — the map.
 *
 * A directional canvas, not a list: workload → role → decision, left to right,
 * in the direction authority actually flows. A workload RUNS AS a role; that
 * role's actions are DECIDED BY the decision authority. Every edge carries an
 * arrowhead at the target end so the direction is readable without the legend.
 *
 * Two planes, two visual languages, and they must never be confused:
 *
 *   configured  A fact about the canonical inventory or policy generation.
 *               Drawn as a static dashed line. It NEVER moves, because nothing
 *               about it was observed and motion would imply it was.
 *   observed    Evidence that was actually read, from a named decision
 *               generation. Drawn solid, and only this may animate.
 *
 * Motion is therefore a claim, and it is gated twice: the edge must be on the
 * observed plane AND a decision generation must stand behind it (model:
 * GraphEdge.animated), and the viewer must not have asked for reduced motion.
 * When either fails the same graph renders statically with identical geometry
 * and labels — nothing is hidden, only the movement stops.
 *
 * Geometry comes from layoutGraph() in the model, so what is drawn is testable
 * without a DOM. This file positions and paints; it decides nothing.
 *
 * Every node and edge is also rendered as a real table below the canvas. That
 * table is the accessible reading of the map — it is what a screen reader
 * announces, and what remains legible at phone width where a three-lane canvas
 * cannot be.
 */

import { useEffect, useState } from "react"

import { useMapViewport } from "./use-map-viewport"
import { FLOW_ALERT_COLOR, FLOW_COLOR_BY_CLASS } from "./flow-visuals"
import {
  TAXONOMY_LABEL,
  TAXONOMY_REQUIREMENTS,
  readTaxonomy,
  type TaxonomyReading,
} from "./identity-taxonomy-contract"

import {
  layoutGraph,
  type GraphDecisionNode,
  type GraphRoleNode,
  type GraphWorkloadNode,
  type IdentityView,
  type PlacedNode,
} from "./estate-identity-access-model"

const INK = "#1A2330"
const MUTED = "#5A6B7A"
const LINE = "#CBD5E1"
/**
 * The Estate map's own colour language, imported rather than re-typed.
 *
 * `internal` is what that map paints an observed service call with, so an
 * observed authority edge here is the same colour an observed call is there,
 * and a viewer reads one legend across both lenses. The alert colour is the
 * same one the Estate map reserves for exposure, used here only where the
 * producer withheld the decision -- a withheld answer is not a quiet one.
 */
const TEAL = FLOW_COLOR_BY_CLASS.internal
const WITHHELD = FLOW_ALERT_COLOR
const TEAL_BG = "#E6FBF7"
const WARN = "#92400E"
const WARN_BG = "#FFFBEB"
const WARN_LINE = "#F2C94C"
const LANE_BG = "#F8FAFC"

/**
 * Whether this viewer has asked for reduced motion.
 *
 * Read through matchMedia rather than left to CSS, because the animation is
 * built from SVG <animate> elements: honouring the preference means not
 * rendering them at all, not merely overriding a property. Defaults to
 * REDUCED, so a viewer whose preference cannot be read gets the static map
 * rather than movement they did not ask for.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(true)
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return
    let query: MediaQueryList
    try {
      query = window.matchMedia("(prefers-reduced-motion: reduce)")
    } catch {
      return
    }
    const apply = () => setReduced(query.matches)
    apply()
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", apply)
      return () => query.removeEventListener("change", apply)
    }
    return undefined
  }, [])
  return reduced
}

function laneLabel(lane: PlacedNode["lane"]): string {
  return lane === "workload" ? "Workload" : lane === "role" ? "IAM role" : "Decision authority"
}

function NodeBox({
  placed,
  selected,
  onSelect,
}: {
  placed: PlacedNode
  selected: boolean
  onSelect?: (role: GraphRoleNode) => void
}) {
  const { node, x, y, width, height, lane } = placed
  // Only a role opens Review: Review answers about a role. A workload or a
  // decision hop has nothing for it to resolve, so neither is made to look
  // clickable.
  const selectable = node.kind === "role" && typeof onSelect === "function"
  const withheld = node.kind === "decision" && node.state !== "ready"
  const stroke = withheld ? WARN_LINE : lane === "role" ? TEAL : LINE
  const fill = withheld ? WARN_BG : lane === "role" ? TEAL_BG : "#FFFFFF"

  let title = ""
  let subtitle = ""
  if (node.kind === "workload") {
    title = (node as GraphWorkloadNode).visibleId
    subtitle = "runs as"
  } else if (node.kind === "role") {
    const role = node as GraphRoleNode
    title = role.label
    subtitle = role.roleId
  } else {
    const decision = node as GraphDecisionNode
    if (decision.state === "ready") {
      // The union makes these numbers, not nullable ones: a "ready" decision
      // carries its counts or it is not ready.
      title = `${decision.configuredGrantCount} actions granted`
      subtitle = decision.observed
        ? `${decision.observed.successful} used · ${decision.observed.deniedOnly} denied-only`
        : "observed use not read"
    } else {
      title = "Decision unavailable"
      subtitle = "no counts — not zero"
    }
  }

  const activate = () => {
    if (node.kind === "role" && onSelect) onSelect(node as GraphRoleNode)
  }

  return (
    <g
      data-testid="identity-map-node"
      data-node-id={node.id}
      data-node-kind={node.kind}
      data-node-lane={lane}
      data-selected={selected ? "true" : undefined}
      data-decision-state={node.kind === "decision" ? (node as GraphDecisionNode).state : undefined}
      role={selectable ? "button" : undefined}
      tabIndex={selectable ? 0 : undefined}
      aria-pressed={selectable ? selected : undefined}
      style={selectable ? { cursor: "pointer" } : undefined}
      onClick={selectable ? activate : undefined}
      onKeyDown={selectable ? (e => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate() }
      }) : undefined}
    >
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={8}
        fill={fill}
        stroke={selected ? TEAL : stroke}
        strokeWidth={selected ? 3 : 1.5}
      />
      <text x={x + 12} y={y + 23} fontSize={13} fontWeight={600} fill={INK}>
        {title.length > 26 ? `${title.slice(0, 25)}…` : title}
      </text>
      <text x={x + 12} y={y + 41} fontSize={11} fill={withheld ? WARN : MUTED}>
        {subtitle.length > 32 ? `${subtitle.slice(0, 31)}…` : subtitle}
      </text>
      <title>{`${laneLabel(lane)}: ${title} — ${subtitle}`}</title>
    </g>
  )
}

export function EstateIdentityMap({
  view,
  taxonomy,
  selectedRoleId,
  onSelectRole,
}: {
  view: IdentityView
  /** What the producer carries beyond roles. Absent families stay absent. */
  taxonomy?: TaxonomyReading
  selectedRoleId?: string | null
  onSelectRole?: (role: GraphRoleNode) => void
}) {
  const reducedMotion = usePrefersReducedMotion()
  const layout = layoutGraph(view.graph)
  const animate = !reducedMotion
  // The SAME viewport shell the Estate map runs on: cursor-anchored zoom,
  // drag-pan, and a readout relative to fit. One implementation, two maps.
  const vp = useMapViewport()
  // The identity lens's filter, the counterpart of the Estate map's flow-mode
  // toggle. It hides edges; it never changes what they mean, and it can never
  // make an absent plane look present -- filtering to "observed" on a graph
  // with no observed evidence shows an empty canvas and says so.
  const [planeFilter, setPlaneFilter] = useState<"all" | "configured" | "observed">("all")
  const visibleEdges = layout.edges.filter(
    ({ edge }) => planeFilter === "all" || edge.plane === planeFilter,
  )

  return (
    <div data-testid="identity-map" data-motion={reducedMotion ? "reduced" : "animated"}>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2" data-testid="identity-map-controls">
        <div
          className="inline-flex overflow-hidden rounded-md border"
          style={{ borderColor: LINE }}
          role="group"
          aria-label="Relationship plane"
          data-testid="identity-map-plane-filter"
        >
          {([
            ["all", "All"],
            ["configured", "Configured"],
            ["observed", "Observed"],
          ] as const).map(([id, label]) => {
            const active = planeFilter === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => setPlaneFilter(id)}
                aria-pressed={active}
                data-testid={`identity-map-plane-${id}`}
                className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors"
                style={{ background: active ? INK : "transparent", color: active ? "#FFFFFF" : MUTED }}
              >
                {label}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-1">
        <button
          type="button"
          data-testid="identity-map-zoom-out"
          onClick={vp.zoomOutStep}
          aria-label="Zoom out"
          className="rounded border px-2 py-0.5 text-[11px]"
          style={{ borderColor: LINE, color: MUTED }}
        >
          −
        </button>
        <span data-testid="identity-map-zoom-readout" className="min-w-[3.25rem] text-center text-[11px]" style={{ color: MUTED }}>
          {vp.relZoomPct}%
        </span>
        <button
          type="button"
          data-testid="identity-map-zoom-in"
          onClick={vp.zoomInStep}
          aria-label="Zoom in"
          className="rounded border px-2 py-0.5 text-[11px]"
          style={{ borderColor: LINE, color: MUTED }}
        >
          +
        </button>
        <button
          type="button"
          data-testid="identity-map-fit"
          onClick={vp.fitView}
          className="rounded border px-2 py-0.5 text-[11px]"
          style={{ borderColor: LINE, color: MUTED }}
        >
          Fit
        </button>
        </div>
      </div>
      <figure className="m-0">
        <div
          ref={vp.viewportRef}
          data-testid="identity-map-canvas-frame"
          className="w-full overflow-x-auto rounded-lg border"
          style={{
            borderColor: LINE,
            background: LANE_BG,
            cursor: vp.panning ? "grabbing" : "grab",
            touchAction: "pan-y",
          }}
          onWheel={vp.onViewportWheel}
          onPointerDown={vp.onPanDown}
          onPointerMove={vp.onPanMove}
          onPointerUp={vp.onPanUp}
          onPointerLeave={vp.onPanUp}
        >
          <div
            ref={vp.contentRef}
            data-testid="identity-map-canvas-transform"
            style={{
              transform: `translate(${vp.pan.x}px, ${vp.pan.y}px) scale(${vp.zoom})`,
              transformOrigin: "0 0",
            }}
          >
          <svg
            data-testid="identity-map-canvas"
            role="img"
            aria-label={`Identity map: ${view.graph.nodes.length} nodes and ${view.graph.edges.length} directional edges, workload to role to decision authority.`}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            preserveAspectRatio="xMidYMid meet"
            className="block h-auto w-full min-w-[720px]"
          >
            <defs>
              <marker
                id="identity-arrow-configured"
                data-testid="identity-map-marker-configured"
                markerWidth={9}
                markerHeight={9}
                refX={8}
                refY={3}
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0,0 L0,6 L8,3 z" fill={MUTED} />
              </marker>
              <marker
                id="identity-arrow-observed"
                data-testid="identity-map-marker-observed"
                markerWidth={9}
                markerHeight={9}
                refX={8}
                refY={3}
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0,0 L0,6 L8,3 z" fill={TEAL} />
              </marker>
            </defs>

            {(["workload", "role", "decision"] as const).map(lane => {
              const first = layout.nodes.find(item => item.lane === lane)
              if (!first) return null
              return (
                <text
                  key={lane}
                  data-testid="identity-map-lane-label"
                  data-lane={lane}
                  x={first.x}
                  y={24}
                  fontSize={10}
                  fontWeight={700}
                  letterSpacing={0.6}
                  fill={MUTED}
                >
                  {laneLabel(lane).toUpperCase()}
                </text>
              )
            })}

            {visibleEdges.map(({ edge, path, labelX, labelY }) => {
              const observed = edge.plane === "observed"
              const moving = animate && edge.animated
              return (
                <g
                  key={`${edge.from}->${edge.to}`}
                  data-testid="identity-map-edge"
                  data-edge-from={edge.from}
                  data-edge-to={edge.to}
                  data-edge-family={edge.family}
                  data-edge-plane={edge.plane}
                  data-edge-animated={moving ? "true" : "false"}
                >
                  <path
                    d={path}
                    fill="none"
                    stroke={observed ? TEAL : MUTED}
                    strokeWidth={observed ? 2 : 1.25}
                    // Configured is dashed and still. Observed is solid, and is
                    // the only plane whose dash may move.
                    strokeDasharray={observed ? (moving ? "7 6" : undefined) : "4 5"}
                    strokeOpacity={observed ? 0.95 : 0.7}
                    markerEnd={`url(#identity-arrow-${observed ? "observed" : "configured"})`}
                  >
                    {moving ? (
                      <animate
                        data-testid="identity-map-flow-animation"
                        attributeName="stroke-dashoffset"
                        from="26"
                        to="0"
                        dur="1.4s"
                        repeatCount="indefinite"
                      />
                    ) : null}
                  </path>
                  <text
                    data-testid="identity-map-edge-label"
                    x={labelX}
                    y={labelY}
                    fontSize={9.5}
                    textAnchor="middle"
                    fontWeight={600}
                    fill={observed ? TEAL : MUTED}
                  >
                    {edge.plane}
                  </text>
                </g>
              )
            })}

            {layout.nodes.map(placed => (
              <NodeBox
                key={placed.node.id}
                placed={placed}
                selected={placed.node.kind === "role" && (placed.node as GraphRoleNode).roleId === selectedRoleId}
                onSelect={onSelectRole}
              />
            ))}
          </svg>
          </div>
        </div>

        <figcaption className="mt-1.5 flex flex-wrap items-center gap-3 text-[10px]" style={{ color: MUTED }}>
          <span className="inline-flex items-center gap-1" data-testid="identity-map-legend-configured">
            <svg width={26} height={8} aria-hidden>
              <path d="M0,4 L24,4" stroke={MUTED} strokeWidth={1.25} strokeDasharray="4 5" />
            </svg>
            configured — a policy or inventory fact, never observed, never moves
          </span>
          <span className="inline-flex items-center gap-1" data-testid="identity-map-legend-observed">
            <svg width={26} height={8} aria-hidden>
              <path d="M0,4 L24,4" stroke={TEAL} strokeWidth={2} />
            </svg>
            observed — evidence read from a named decision generation
          </span>
          {reducedMotion ? (
            <span data-testid="identity-map-motion-note">
              Motion is off; the map is identical without it.
            </span>
          ) : null}
        </figcaption>
      </figure>

      {/*
        What this map cannot draw yet, said out loud.

        The producer contract carries roles; users, federated identities,
        groups, policies, permission sets and protected resources are not in
        it, and neither are the edges between them. Deriving them here would
        be inventing a graph, so each family is listed as UNAVAILABLE with the
        payload key that would carry it. When the producer starts sending one,
        readTaxonomy reports it present and this rail shrinks by itself.
      */}
      {taxonomy ? (
        <section data-testid="identity-map-taxonomy" className="mt-2">
          <h4 className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
            Relationship families
          </h4>
          <ul className="mt-1 grid gap-1 sm:grid-cols-2">
            {taxonomy.families.map(family => {
              const requirement = TAXONOMY_REQUIREMENTS.find(r => r.family === family.family)
              return (
                <li
                  key={family.family}
                  data-testid="identity-map-taxonomy-family"
                  data-family={family.family}
                  data-state={family.state}
                  className="flex items-baseline justify-between gap-2 rounded border px-2 py-1 text-[10px]"
                  style={{
                    borderColor: family.state === "present" ? TEAL : WARN_LINE,
                    background: family.state === "present" ? TEAL_BG : WARN_BG,
                    color: family.state === "present" ? INK : WARN,
                  }}
                >
                  <span>{TAXONOMY_LABEL[family.family]}</span>
                  <span className="font-mono">
                    {family.state === "present"
                      ? `${family.count} edges`
                      : `unavailable · ${requirement ? requirement.block_key : family.family}`}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {/*
        The same graph as a table. Always in the DOM: it is the accessible
        reading of the canvas, and the one that stays usable at phone width
        where three lanes cannot fit.
      */}
      <details data-testid="identity-map-fallback" className="mt-2" open>
        <summary className="cursor-pointer text-[11px] font-semibold" style={{ color: MUTED }}>
          Every relationship on this map, as text
        </summary>
        <table className="mt-1.5 w-full border-collapse text-[11px]">
          <caption className="sr-only">
            Directional identity relationships: each row is one edge, from source to target.
          </caption>
          <thead>
            <tr style={{ color: MUTED }}>
              <th scope="col" className="border-b py-1 text-left" style={{ borderColor: LINE }}>From</th>
              <th scope="col" className="border-b py-1 text-left" style={{ borderColor: LINE }}>Direction</th>
              <th scope="col" className="border-b py-1 text-left" style={{ borderColor: LINE }}>To</th>
              <th scope="col" className="border-b py-1 text-left" style={{ borderColor: LINE }}>Family</th>
              <th scope="col" className="border-b py-1 text-left" style={{ borderColor: LINE }}>Plane</th>
            </tr>
          </thead>
          <tbody>
            {view.graph.edges.map(edge => (
              <tr
                key={`${edge.from}->${edge.to}`}
                data-testid="identity-map-fallback-row"
                data-edge-plane={edge.plane}
              >
                <td className="border-b py-1 font-mono" style={{ borderColor: LINE, color: INK }}>
                  {edge.from}
                </td>
                <td className="border-b py-1" style={{ borderColor: LINE, color: MUTED }}>
                  {edge.family === "WORKLOAD_USES_ROLE" ? "runs as →" : "decided by →"}
                </td>
                <td className="border-b py-1 font-mono" style={{ borderColor: LINE, color: INK }}>
                  {edge.to}
                </td>
                <td className="border-b py-1 font-mono" style={{ borderColor: LINE, color: MUTED }}>
                  {edge.family}
                </td>
                <td className="border-b py-1" style={{ borderColor: LINE, color: edge.plane === "observed" ? TEAL : MUTED }}>
                  {edge.plane}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
