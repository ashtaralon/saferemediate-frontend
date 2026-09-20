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
const TEAL = "#0E8B7A"
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

function NodeBox({ placed }: { placed: PlacedNode }) {
  const { node, x, y, width, height, lane } = placed
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
      title = `${decision.configuredGrantCount ?? "—"} actions granted`
      subtitle = decision.observed
        ? `${decision.observed.successful ?? "—"} used · ${decision.observed.deniedOnly ?? "—"} denied-only`
        : "observed use not read"
    } else {
      title = "Decision unavailable"
      subtitle = "no counts — not zero"
    }
  }

  return (
    <g
      data-testid="identity-map-node"
      data-node-id={node.id}
      data-node-kind={node.kind}
      data-node-lane={lane}
      data-decision-state={node.kind === "decision" ? (node as GraphDecisionNode).state : undefined}
    >
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={8}
        fill={fill}
        stroke={stroke}
        strokeWidth={1.5}
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

export function EstateIdentityMap({ view }: { view: IdentityView }) {
  const reducedMotion = usePrefersReducedMotion()
  const layout = layoutGraph(view.graph)
  const animate = !reducedMotion

  return (
    <div data-testid="identity-map" data-motion={reducedMotion ? "reduced" : "animated"}>
      <figure className="m-0">
        <div
          data-testid="identity-map-canvas-frame"
          className="w-full overflow-x-auto rounded-lg border"
          style={{ borderColor: LINE, background: LANE_BG }}
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

            {layout.edges.map(({ edge, path, labelX, labelY }) => {
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
              <NodeBox key={placed.node.id} placed={placed} />
            ))}
          </svg>
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
