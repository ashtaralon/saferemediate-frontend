import type { ExternalDestinationProjection, TrafficEdge } from "./types"
import { IGW_CANVAS_ANCHOR_ID } from "./service-paths"

/** What the map may say about traffic that leaves the VPC, and about the
 *  schedules and data traffic on the rail — derived only from the payload.
 *
 *  These are pure functions on purpose. Every claim below is one the map makes
 *  about EVIDENCE, and the C1 payload does not carry what the old rendering
 *  implied it did (production capture, generation 1789380108):
 *
 *    destinations[]                   EMPTY on every edge — no per-destination identity
 *    egress_breakdown[].sample_hosts  real IPs, but a SAMPLE (5 of 32, 5 of 10)
 *    external_destinations            a PER-EDGE distinct count
 *    egress_hops                      nat -> igw, in path order
 *    route_basis                      "structural_default_egress" — routes, not flows
 *    observed_actions                 EMPTY on all four ACTUAL_S3_ACCESS edges
 *
 *  So the renderer needs answers it can defend, not a shape it can draw. Pure
 *  functions are also the only part of this change this repo can execute
 *  without a browser, which decides where the load-bearing logic lives. */

/** Separator for composite keys. Unit Separator cannot occur in an ARN, which
 *  a bare ":" or "/" can — joining on one of those lets two different pairs
 *  collide into one key and silently undercount, the mirror of the very bug
 *  uniqueDirectedPairs exists to fix. */
const KEY_SEP = String.fromCharCode(31)

/** One workload's path out through the perimeter. */
export interface ExternalEgressLeg {
  sourceId: string
  /** Distinct destinations behind THIS leg, as the backend counted them, or
   *  null when the payload carries no count. Null is UNKNOWN and is never
   *  coerced to zero: "0 distinct" is a measurement, "no count" is a gap. */
  distinctDestinations: number | null
  /** Hops in path order — structural (route tables), never observed per-flow. */
  hops: { kind: string; id: string; subnetId?: string | null }[]
  /** Sampled destination addresses, DE-DUPLICATED. The backend concatenates
   *  one bucket per kind and the same address can appear in more than one, so
   *  a raw length is a count of rows, not of addresses. */
  sampleHosts: string[]
  /** The sample covers the whole count for this leg, so it IS the inventory.
   *  Requires a known count: a sample cannot be complete against an unknown. */
  sampleIsComplete: boolean
}

export interface ExternalEgressSummary {
  legs: ExternalEgressLeg[]
  /** Sum of the legs whose distinct count IS known — an UPPER BOUND, because
   *  per-leg counts are distinct only WITHIN a leg. Null when no leg carries a
   *  count at all, so the caller states the gap instead of printing a zero. */
  maxDistinctUpperBound: number | null
  /** Legs whose distinct count the payload does not carry. Non-zero means the
   *  bound above covers only part of the traffic. */
  legsWithUnknownDistinct: number
  everySampleComplete: boolean
  /** At least one leg has a sampled address after de-duplication. */
  anySample: boolean
  natIds: string[]
  igwIds: string[]
  routeBases: string[]
}

/** The gateway this edge leaves through, or null when it does not leave.
 *  The sentinel is what the projection emits for "left the VPC"; a real igw-
 *  id is accepted too so this does not silently stop working the day the
 *  backend stops minting the sentinel. */
function egressGatewayId(edge: TrafficEdge): string | null {
  if (edge.via_igw_id?.startsWith("igw-")) return edge.via_igw_id
  if (edge.target_id === IGW_CANVAS_ANCHOR_ID) return null
  if (edge.target_id.startsWith("igw-")) return edge.target_id
  return null
}

function targetsGateway(edge: TrafficEdge): boolean {
  return edge.target_id === IGW_CANVAS_ANCHOR_ID || edge.target_id.startsWith("igw-")
}

/** Whether this edge is OBSERVED traffic out through the gateway.
 *
 *  Pointing at the gateway is not enough. A route table entry also points at
 *  the internet gateway and the payload carries it as a configured edge; count
 *  it and the node reports a workload "reaching N external destinations" on
 *  the evidence that a route exists. The node's own caption says the counts
 *  are observed, so the admission has to match that claim:
 *
 *    - configured evidence is refused outright (evidence_type / path_basis /
 *      authority_state all say so in their own vocabulary), and
 *    - what remains must carry at least one OBSERVED artefact: an observed
 *      evidence_type, a distinct-destination count, or an egress breakdown.
 *
 *  An edge that merely targets the gateway with no observation behind it is
 *  not evidence of egress, and this returns false for it. */
export function isObservedExternalEgress(edge: TrafficEdge): boolean {
  if (!targetsGateway(edge)) return false
  const configured =
    edge.evidence_type === "configured" ||
    edge.path_basis === "configured_route" ||
    edge.authority_state === "configured"
  if (configured) return false
  const breakdown = edge.egress_breakdown ?? []
  return (
    edge.evidence_type === "observed" ||
    edge.external_destinations != null ||
    breakdown.length > 0
  )
}

/** The external continuation beyond the gateway, or null when nothing
 *  observably leaves.
 *
 *  Null rather than an empty summary: an "External destinations" node drawn
 *  over zero legs would assert a perimeter crossing the payload never
 *  reported. The caller renders nothing. */
export function summarizeExternalEgress(
  edges: readonly TrafficEdge[],
): ExternalEgressSummary | null {
  const legs: ExternalEgressLeg[] = []
  const natIds: string[] = []
  const igwIds: string[] = []
  const routeBases: string[] = []

  for (const edge of edges) {
    if (!isObservedExternalEgress(edge)) continue
    // De-duplicate before measuring: the same address can appear in two
    // buckets of one breakdown, and three rows for two addresses made a
    // two-destination leg look completely enumerated.
    const sampleHosts: string[] = []
    for (const bucket of edge.egress_breakdown ?? []) {
      for (const host of bucket.sample_hosts ?? []) {
        if (!sampleHosts.includes(host)) sampleHosts.push(host)
      }
    }
    const distinct = edge.external_destinations ?? null
    legs.push({
      sourceId: edge.source_id,
      distinctDestinations: distinct,
      hops: (edge.egress_hops ?? []).map(h => ({
        kind: h.kind,
        id: h.id,
        subnetId: h.subnet_id ?? null,
      })),
      sampleHosts,
      // Strictly equal, never ">=": a sample longer than the count means the
      // two disagree, and the honest read of a disagreement is "not complete".
      sampleIsComplete: distinct != null && sampleHosts.length === distinct,
    })
    for (const hop of edge.egress_hops ?? []) {
      const into = hop.kind === "nat" ? natIds : hop.kind === "igw" ? igwIds : null
      if (into && hop.id && !into.includes(hop.id)) into.push(hop.id)
    }
    // The edge's own target names the gateway when the projection stopped
    // minting the sentinel, so the chain can name it without an egress_hops.
    const gateway = egressGatewayId(edge)
    if (gateway && !igwIds.includes(gateway)) igwIds.push(gateway)
    if (edge.route_basis && !routeBases.includes(edge.route_basis)) routeBases.push(edge.route_basis)
  }

  if (legs.length === 0) return null
  const known = legs.filter(leg => leg.distinctDestinations != null)
  return {
    legs,
    maxDistinctUpperBound:
      known.length === 0
        ? null
        : known.reduce((sum, leg) => sum + (leg.distinctDestinations as number), 0),
    legsWithUnknownDistinct: legs.length - known.length,
    everySampleComplete: legs.every(leg => leg.sampleIsComplete),
    anySample: legs.some(leg => leg.sampleHosts.length > 0),
    natIds,
    igwIds,
    routeBases,
  }
}

/** The flow-id prefix for a destination drawn outside the VPC boundary. The
 *  overlay resolves edge endpoints by `data-flow-id`, so a synthesized
 *  gateway -> destination edge lands on the node that carries this id. */
export const EXTERNAL_DESTINATION_FLOW_PREFIX = "extdst:"

export type ExternalDestinationIdentity = "aws_service" | "address"

/** One destination the map may draw beyond the gateway. */
export interface ExternalDestinationNode {
  /** Stable, de-duplicated identity. `EXTERNAL_DESTINATION_FLOW_PREFIX + key`
   *  is the flow id the overlay anchors the gateway edge to. */
  key: string
  label: string
  /** What the label IS. "aws_service" only when the payload carried an
   *  authoritative attribution; otherwise the label is an address and the map
   *  must not imply it names a service. */
  identity: ExternalDestinationIdentity
  /** The projection's own classification of the address (s3 / ntp /
   *  other_aws / external / ...). A category, never an attribution — a node
   *  with kind "other_aws" and no `aws_service` is still an address. */
  kind: string | null
  /** Workloads observed reaching it, de-duplicated. */
  sources: string[]
  /** Summed observation counts where the payload carried them; null when no
   *  contributor carried one. Never coerced to zero. */
  observationCount: number | null
  /** Stable backend projection id when topology-risk/v11 supplied this node. */
  projectionId: string | null
  address: string
  ports: number[]
  protocols: string[]
  totalBytes: number | null
  firstSeen: string | null
  lastSeen: string | null
  evidenceIds: string[]
  projectionGeneration: number | null
  evidenceType: string | null
  evidenceSource: string | null
}

/** The part of the observed egress the payload does NOT name an address for.
 *  Drawn as one honest group rather than omitted: leaving it out would make a
 *  sampled map read as a complete inventory. */
export interface ExternalDestinationRemainder {
  /** Legs contributing traffic with no recorded address. */
  legs: number
  /** Upper bound on distinct destinations behind those legs, or null when the
   *  payload carries no count for any of them. */
  distinctUpperBound: number | null
  /** Legs among them whose distinct count is unknown. */
  unknownCountLegs: number
}

export interface ExternalDestinationMap {
  /** Bounded, in drawing order. Never longer than the caller's limit. */
  nodes: ExternalDestinationNode[]
  /** The named destinations beyond the bound, KEPT rather than discarded, in
   *  the same order they would have been drawn in.
   *
   *  They used to be counted and thrown away, so the "+N more" disclosure
   *  promised "the rest" and then listed nothing — a control that offered
   *  evidence it no longer had. Whatever the caller says is behind that
   *  control has to be in here. */
  hiddenNodes: ExternalDestinationNode[]
  /** Named destinations beyond the bound — the "+N" the caller offers on
   *  demand. Always equal to `hiddenNodes.length`. */
  hiddenCount: number
  /** Named destinations in total, drawn or not. */
  totalNamed: number
  /** Named destinations carrying an authoritative service attribution. */
  attributedCount: number
  remainder: ExternalDestinationRemainder | null
  /** Distinct-destination upper bound across every observed leg. */
  distinctUpperBound: number | null
  legsWithUnknownDistinct: number
  everySampleComplete: boolean
  /** The gateway the drawn edges leave through, or null when the payload
   *  names none. The caller anchors the edge to this chip. */
  gatewayId: string | null
  /** Exact projection joins. Legacy payloads use a conservative synthetic
   *  continuation and therefore mark these as inferred in the renderer. */
  continuations: {
    sourceId: string
    sourceAnchorId: string
    targetKey: string
    destinationEvidence: string
    gatewayEvidence: string
    gatewayTraversalObserved: boolean
    pathBasis: string
    routeBasis: string | null
  }[]
  /** Returned destination details that lacked an exact configured IGW join.
   *  They remain inspectable but are never connected to a guessed gateway. */
  unlinkedNodes: ExternalDestinationNode[]
  detailState: "complete" | "partial" | "truncated" | "unavailable" | "legacy"
  detailsReturned: number
  detailsBeforeBound: number | null
  unreturnedCount: number
  unidentifiedPeerUpperBound: number | null
  unidentifiedPeerSamples: string[]
}

/** Normalized de-duplication key. The same address reaches the map through
 *  more than one leg and more than one bucket, and a raw list would draw one
 *  destination as several nodes with the gateway edge fanning out to each —
 *  a picture of traffic that was never observed. */
function destinationKey(label: string): string {
  return label.trim().toLowerCase()
}

/** What the map may draw beyond the gateway, bounded and de-duplicated.
 *
 *  Identity is the whole point. Two sources can name a destination:
 *
 *    destinations[].address      per-destination evidence, with a count
 *    egress_breakdown[].sample_hosts   a SAMPLE of addresses, no per-address count
 *
 *  Neither names a service. `aws_service` does, and only when the evidence
 *  carried it — that field exists for VPC Flow Logs v5 `pkt-dst-aws-service`.
 *  A bucket's `kind` is the projection classifying an address, so "other_aws"
 *  becomes a category on an address node, never a service label. An address
 *  with no attribution stays an address, which is the honest answer and the
 *  one the operator can act on.
 *
 *  Returns null only when nothing observably leaves: with observed egress and
 *  no addresses at all, the caller still gets a map whose `remainder` carries
 *  the unnamed traffic, so the perimeter is drawn and its contents are
 *  declared unknown rather than silently empty. */
export function externalDestinationMap(
  summary: ExternalEgressSummary | null,
  edges: readonly TrafficEdge[],
  limit = 6,
): ExternalDestinationMap | null {
  if (!summary || summary.legs.length === 0) return null

  const byKey = new Map<string, ExternalDestinationNode>()
  const namedSourceIds = new Set<string>()

  const add = (
    label: string,
    identity: ExternalDestinationIdentity,
    kind: string | null,
    sourceId: string,
    count: number | null,
  ) => {
    const trimmed = label.trim()
    if (!trimmed) return
    const key = destinationKey(trimmed)
    const existing = byKey.get(key)
    namedSourceIds.add(sourceId)
    if (!existing) {
      byKey.set(key, {
        key,
        label: trimmed,
        identity,
        kind,
        sources: [sourceId],
        observationCount: count,
        projectionId: null,
        address: trimmed,
        ports: [],
        protocols: [],
        totalBytes: null,
        firstSeen: null,
        lastSeen: null,
        evidenceIds: [],
        projectionGeneration: null,
        evidenceType: null,
        evidenceSource: null,
      })
      return
    }
    // An authoritative attribution wins over an address spelling of the same
    // destination: the service name is strictly more informative and is the
    // only one of the two backed by an attribution.
    if (identity === "aws_service" && existing.identity !== "aws_service") {
      existing.identity = "aws_service"
      existing.label = trimmed
    }
    if (!existing.kind && kind) existing.kind = kind
    if (!existing.sources.includes(sourceId)) existing.sources.push(sourceId)
    if (count != null) existing.observationCount = (existing.observationCount ?? 0) + count
  }

  for (const edge of edges) {
    if (!isObservedExternalEgress(edge)) continue
    // Per-destination evidence first: it carries a count and may carry an
    // attribution. The sample is the fallback, not a second source of truth.
    for (const dst of edge.destinations ?? []) {
      const service = (dst.aws_service ?? "").trim()
      add(
        service || dst.address,
        service ? "aws_service" : "address",
        dst.kind ?? null,
        edge.source_id,
        typeof dst.observation_count === "number" ? dst.observation_count : null,
      )
    }
    if ((edge.destinations ?? []).length > 0) continue
    for (const bucket of edge.egress_breakdown ?? []) {
      const service = (bucket.aws_service ?? "").trim()
      for (const host of bucket.sample_hosts ?? []) {
        // The bucket's count covers the whole bucket, not this address, so it
        // is NOT attached to the node: summing it per sampled host would
        // multiply one bucket's traffic by however many addresses it sampled.
        add(service || host, service ? "aws_service" : "address", bucket.kind ?? null, edge.source_id, null)
      }
    }
  }

  // Deterministic order, and no clock or randomness anywhere in it: attributed
  // services first (they are the strongest claim the map can make), then the
  // busiest, then alphabetical so two runs of the same payload draw the same
  // map and a screenshot diff means a data change.
  const all = Array.from(byKey.values()).sort((a, b) => {
    if (a.identity !== b.identity) return a.identity === "aws_service" ? -1 : 1
    const ca = a.observationCount ?? -1
    const cb = b.observationCount ?? -1
    if (ca !== cb) return cb - ca
    return a.label.localeCompare(b.label)
  })

  const bound = Math.max(0, limit)
  const nodes = all.slice(0, bound)
  const hiddenNodes = all.slice(bound)

  // Legs that named nothing: their traffic is real and its destinations are
  // unknown. Drawn as one group so the map never implies the named nodes are
  // the whole story.
  const unnamedLegs = summary.legs.filter(leg => !namedSourceIds.has(leg.sourceId))
  const unnamedKnown = unnamedLegs.filter(leg => leg.distinctDestinations != null)
  const remainder: ExternalDestinationRemainder | null =
    unnamedLegs.length === 0
      ? null
      : {
          legs: unnamedLegs.length,
          distinctUpperBound:
            unnamedKnown.length === 0
              ? null
              : unnamedKnown.reduce((sum, leg) => sum + (leg.distinctDestinations as number), 0),
          unknownCountLegs: unnamedLegs.length - unnamedKnown.length,
        }

  const gatewayId = summary.igwIds[0] ?? null
  // Legacy destination detail may still be useful, but a `__igw__` sentinel
  // is a canvas anchor rather than an exact infrastructure identity. Keep
  // those details inspectable and draw no continuation until via_igw_id, an
  // IGW hop, or an exact igw-* target names the gateway.
  const linkedNodes = gatewayId ? nodes : []
  const linkedHiddenNodes = gatewayId ? hiddenNodes : []
  const unlinkedNodes = gatewayId ? [] : all
  return {
    nodes: linkedNodes,
    hiddenNodes: linkedHiddenNodes,
    hiddenCount: linkedHiddenNodes.length,
    totalNamed: all.length,
    attributedCount: all.filter(n => n.identity === "aws_service").length,
    remainder,
    distinctUpperBound: summary.maxDistinctUpperBound,
    legsWithUnknownDistinct: summary.legsWithUnknownDistinct,
    everySampleComplete: summary.everySampleComplete,
    gatewayId,
    continuations: gatewayId ? [
      ...linkedNodes.map(node => ({
        sourceId: gatewayId,
        sourceAnchorId: IGW_CANVAS_ANCHOR_ID,
        targetKey: node.key,
        destinationEvidence: "observed",
        gatewayEvidence: "inferred_from_legacy_route",
        gatewayTraversalObserved: false,
        pathBasis: "synthetic_expansion",
        routeBasis: summary.routeBases[0] ?? null,
      })),
      ...(remainder
        ? [{
            sourceId: gatewayId,
            sourceAnchorId: IGW_CANVAS_ANCHOR_ID,
            targetKey: "__unknown__",
            destinationEvidence: "observed",
            gatewayEvidence: "inferred_from_legacy_route",
            gatewayTraversalObserved: false,
            pathBasis: "synthetic_expansion",
            routeBasis: summary.routeBases[0] ?? null,
          }]
        : []),
    ] : [],
    unlinkedNodes,
    detailState: "legacy",
    detailsReturned: all.length,
    detailsBeforeBound: null,
    unreturnedCount: 0,
    unidentifiedPeerUpperBound: null,
    unidentifiedPeerSamples: [],
  }
}

/** Adapt topology-risk/v11's explicit destination projection for the canvas.
 *
 * The backend owns both sides of the join. A destination becomes a map node
 * only when a projection edge names its stable id and an exact configured IGW.
 * Returned nodes without such an edge remain available as unlinked evidence;
 * we never join them to the first IGW in the response. Likewise, unidentified
 * peers are reported beside the lane and never converted into Internet nodes.
 */
export function externalDestinationProjectionMap(
  projection: ExternalDestinationProjection,
  options: {
    allowedSourceIds?: ReadonlySet<string>
    /** Canvas anchor → exact gateway id. Supplying this makes a mismatched
     *  backend join unlinked instead of silently drawing it from another IGW. */
    gatewayByAnchor?: ReadonlyMap<string, string>
    limit?: number
  } = {},
): ExternalDestinationMap | null {
  const { allowedSourceIds, gatewayByAnchor, limit = 6 } = options
  const inScope = (sourceIds: readonly string[]) =>
    !allowedSourceIds || sourceIds.some(sourceId => allowedSourceIds.has(sourceId))
  const projectedNodes = projection.nodes.filter(node => inScope(node.source_workload_ids ?? []))
  const projectedNodeIds = new Set(projectedNodes.map(node => node.id))
  const projectedEdges = projection.edges.filter(
    edge =>
      projectedNodeIds.has(edge.target_id) &&
      inScope(edge.source_workload_ids ?? []) &&
      (!gatewayByAnchor || gatewayByAnchor.get(edge.source_anchor_id) === edge.source_id),
  )
  const linkedIds = new Set(projectedEdges.map(edge => edge.target_id))

  const adaptNode = (node: ExternalDestinationProjection["nodes"][number]): ExternalDestinationNode => {
    const service = (node.aws_service ?? "").trim()
    return {
      key: node.id,
      label: service || node.address,
      identity: service ? "aws_service" : "address",
      kind: node.endpoint_class ?? null,
      sources: [...new Set(node.source_workload_ids ?? [])],
      observationCount:
        typeof node.observation_count === "number" ? node.observation_count : null,
      projectionId: node.id,
      address: node.address,
      ports: [...new Set(node.ports ?? [])],
      protocols: [...new Set(node.protocols ?? [])],
      totalBytes: typeof node.total_bytes === "number" ? node.total_bytes : null,
      firstSeen: node.first_seen ?? null,
      lastSeen: node.last_seen ?? null,
      evidenceIds: [...new Set(node.evidence_ids ?? [])],
      projectionGeneration: node.projection_generation ?? null,
      evidenceType: node.evidence_type ?? null,
      evidenceSource: node.evidence_source ?? null,
    }
  }

  const linkedAll = projectedNodes.filter(node => linkedIds.has(node.id)).map(adaptNode)
  const unlinkedNodes = projectedNodes.filter(node => !linkedIds.has(node.id)).map(adaptNode)
  const bound = Math.max(0, limit)
  const nodes = linkedAll.slice(0, bound)
  const hiddenNodes = linkedAll.slice(bound)
  const continuations = projectedEdges
    .filter(edge => nodes.some(node => node.projectionId === edge.target_id))
    .map(edge => ({
      sourceId: edge.source_id,
      sourceAnchorId: edge.source_anchor_id,
      targetKey: edge.target_id,
      destinationEvidence: edge.destination_evidence,
      gatewayEvidence: edge.gateway_evidence,
      gatewayTraversalObserved: edge.gateway_traversal_observed,
      pathBasis: edge.path_basis,
      routeBasis: edge.route_basis ?? null,
    }))

  const declaredReturned = Math.max(0, projection.counts.returned_destination_nodes ?? projectedNodes.length)
  const declaredBeforeBound = Math.max(
    declaredReturned,
    projection.counts.named_destination_nodes_before_bound ?? declaredReturned,
  )
  const scopeFiltered = projectedNodes.length !== projection.nodes.length
  const detailsReturned = scopeFiltered ? projectedNodes.length : declaredReturned
  const detailsBeforeBound = scopeFiltered ? null : declaredBeforeBound
  const unreturnedCount = detailsBeforeBound == null ? 0 : Math.max(0, detailsBeforeBound - detailsReturned)
  const declaredUnlinked = Math.max(0, projection.counts.unlinked_returned_destination_nodes ?? 0)
  const detailState: ExternalDestinationMap["detailState"] =
    detailsReturned === 0 && (detailsBeforeBound ?? 0) > 0
      ? "unavailable"
      : projection.truncated || unreturnedCount > 0
        ? "truncated"
        : scopeFiltered || !projection.detail_complete || declaredUnlinked > 0 || unlinkedNodes.length > 0
          ? "partial"
          : "complete"

  const unidentifiedPeerUpperBound = scopeFiltered
    ? null
    : projection.counts.unidentified_peer_upper_bound ?? null
  const unidentifiedPeerSamples = scopeFiltered ? [] : [...new Set(projection.unidentified_peer_samples ?? [])]

  if (
    nodes.length === 0 &&
    hiddenNodes.length === 0 &&
    unlinkedNodes.length === 0 &&
    (unidentifiedPeerUpperBound ?? 0) === 0
  ) {
    return null
  }

  return {
    nodes,
    hiddenNodes,
    hiddenCount: hiddenNodes.length,
    totalNamed: linkedAll.length,
    attributedCount: linkedAll.filter(node => node.identity === "aws_service").length,
    remainder: null,
    distinctUpperBound: scopeFiltered
      ? null
      : projection.counts.per_workload_distinct_upper_bound ?? null,
    legsWithUnknownDistinct: 0,
    everySampleComplete: detailState === "complete",
    gatewayId: continuations[0]?.sourceId ?? null,
    continuations,
    unlinkedNodes,
    detailState,
    detailsReturned,
    detailsBeforeBound,
    unreturnedCount,
    unidentifiedPeerUpperBound,
    unidentifiedPeerSamples,
  }
}

/** One directional source -> target relationship, however many edges carry it. */
export interface DirectedPair {
  sourceId: string
  targetId: string
  protocol: string
}

/** Unique directional pairs for a protocol family.
 *
 *  The defect this replaces: six EventBridge rules targeting six Lambdas were
 *  drawn as "TARGETS x6" AND "TRIGGERS x6" over the same endpoints, so one
 *  relationship read as twelve. The count must come from unique pairs, and
 *  protocol is part of the identity so two families can never merge. */
export function uniqueDirectedPairs(
  edges: readonly TrafficEdge[],
  protocols: readonly string[],
): DirectedPair[] {
  const wanted = new Set(protocols)
  const seen = new Map<string, DirectedPair>()
  for (const edge of edges) {
    const protocol = edge.protocol ?? ""
    if (!wanted.has(protocol)) continue
    const key = [edge.source_id, edge.target_id, protocol].join(KEY_SEP)
    if (!seen.has(key)) seen.set(key, { sourceId: edge.source_id, targetId: edge.target_id, protocol })
  }
  return [...seen.values()]
}

export interface S3TrafficCoverage {
  /** Functions with an observed S3 edge, by id, in payload order. */
  withTraffic: string[]
  /** Every function the map knows about. */
  total: number
  /** True when at least one edge exists but no edge names a single action. */
  noActionsRecorded: boolean
}

/** "S3 traffic from N of M functions", and whether any action name is known.
 *
 *  On C1 all four ACTUAL_S3_ACCESS edges carry observed_actions: []. The edge
 *  itself IS observed evidence — the protocol says so — but no operation is
 *  named. Those are different claims and the UI must not merge them: "no
 *  traffic" would contradict the protocol, and naming operations would invent
 *  them. */
export function summarizeS3Traffic(
  edges: readonly TrafficEdge[],
  functionIds: readonly string[],
  protocol = "ACTUAL_S3_ACCESS",
): S3TrafficCoverage {
  const known = new Set(functionIds)
  const withTraffic: string[] = []
  let sawAction = false
  for (const edge of edges) {
    if ((edge.protocol ?? "") !== protocol) continue
    if (!known.has(edge.source_id)) continue
    if (!withTraffic.includes(edge.source_id)) withTraffic.push(edge.source_id)
    const actions = (edge as { observed_actions?: unknown }).observed_actions
    if (Array.isArray(actions) && actions.length > 0) sawAction = true
  }
  return {
    withTraffic,
    total: functionIds.length,
    noActionsRecorded: withTraffic.length > 0 && !sawAction,
  }
}

export interface TriggerRelationship {
  sourceId: string
  targetId: string
  /** Every graph spelling recorded for this one directed connection. */
  spellings: string[]
  edgeRows: number
}

export interface TriggerRelationshipSummary {
  /** Unique directed trigger-to-function pairs. */
  connectionCount: number
  /** Raw rows behind the pairs; may be larger when a pair has twin spellings. */
  edgeRowCount: number
  relationships: TriggerRelationship[]
}

/** Collapse TARGETS/TRIGGERS twins into the connection an operator means.
 * Other edge types and edges outside the supplied trigger/function sets are
 * excluded so an S3 access edge can never inflate the trigger count. */
export function summarizeTriggerRelationships(
  edges: readonly TrafficEdge[],
  triggerIds: readonly string[],
  functionIds: readonly string[],
): TriggerRelationshipSummary | null {
  const triggers = new Set(triggerIds)
  const functions = new Set(functionIds)
  const pairs = new Map<string, TriggerRelationship>()
  let edgeRowCount = 0
  for (const edge of edges) {
    const spelling = (edge.protocol ?? "").toUpperCase()
    if (spelling !== "TRIGGERS" && spelling !== "TARGETS") continue
    if (!triggers.has(edge.source_id) || !functions.has(edge.target_id)) continue
    edgeRowCount += 1
    const key = `${edge.source_id}${KEY_SEP}${edge.target_id}`
    const existing = pairs.get(key)
    if (existing) {
      existing.edgeRows += 1
      if (!existing.spellings.includes(spelling)) existing.spellings.push(spelling)
      continue
    }
    pairs.set(key, {
      sourceId: edge.source_id,
      targetId: edge.target_id,
      spellings: [spelling],
      edgeRows: 1,
    })
  }
  if (pairs.size === 0) return null
  return {
    connectionCount: pairs.size,
    edgeRowCount,
    relationships: [...pairs.values()],
  }
}

/** One relationship spelling a rail trunk carries, reduced to what deciding
 *  its badge needs. `members` are the overlay's own `source→target` keys. */
export interface TrunkWordBundle {
  word: string
  members: readonly string[]
  /** Edges the spelling stands for, before pair de-duplication. */
  count: number
}

/** One badge: the spellings it speaks for, and what it may print. */
export interface TrunkWordBadge {
  /** Every spelling this badge now covers, in payload order. The first is the
   *  word the badge prints; the rest belong in its title. */
  spellings: string[]
  /** Unique directed connections — the number the badge prints. */
  pairCount: number
  /** Those connections, de-duplicated, in payload order. */
  members: string[]
  /** Edge rows behind them. Higher than `pairCount` exactly when the graph
   *  recorded one connection more than once (a twin spelling, or a repeat). */
  edgeCount: number
}

/** Collapse the spellings a trunk carries to one badge per RELATIONSHIP.
 *
 *  C1 records the six EventBridge rules firing six Lambdas twice — once as
 *  TARGETS, once as TRIGGERS — and the trunk printed one badge per spelling,
 *  so one relationship read as `TARGETS ×6` stacked over `TRIGGERS ×6`
 *  (production inventory, run 34832847455: both words on one trunk). Twelve
 *  edge rows, six connections, and nothing on screen said which.
 *
 *  Two spellings merge ONLY when their de-duplicated member sets are
 *  identical, which is the evidence that they name the same connections. That
 *  is a claim about the RECORDING, not about meaning: the badge still prints
 *  one spelling and the caller's title names the others. Sets that differ by
 *  even one member keep their own badges, so a genuine second relationship
 *  over the same lane pair is never absorbed into the first.
 *
 *  The printed count is unique pairs, never edge rows — a badge may not say
 *  six connections exist when the graph holds six rows for three. A bundle
 *  with no members merges with nothing: an empty set is not evidence. */
export function collapseTrunkWords(bundles: readonly TrunkWordBundle[]): TrunkWordBadge[] {
  const order: string[] = []
  const groups = new Map<string, TrunkWordBadge>()
  bundles.forEach((bundle, i) => {
    const members: string[] = []
    for (const member of bundle.members) if (!members.includes(member)) members.push(member)
    // Index in the signature when there is nothing to compare, so a
    // member-less bundle can only ever group with itself.
    const signature =
      members.length === 0
        ? `${KEY_SEP}empty${KEY_SEP}${i}`
        : [...members].sort().join(KEY_SEP)
    const existing = groups.get(signature)
    if (existing) {
      existing.spellings.push(bundle.word)
      existing.edgeCount += bundle.count
      return
    }
    order.push(signature)
    groups.set(signature, {
      spellings: [bundle.word],
      pairCount: members.length,
      members,
      edgeCount: bundle.count,
    })
  })
  return order.map(signature => groups.get(signature)!)
}

/** The title lines for a collapsed badge: what it prints, then what the badge
 *  itself cannot show — the other spellings, and the row count when the graph
 *  holds more rows than connections. Members follow, one per line. */
export function trunkWordBadgeTitle(label: string, badge: TrunkWordBadge): string {
  const lines = [label]
  const [, ...alsoRecorded] = badge.spellings
  if (alsoRecorded.length > 0) {
    lines.push(
      `Same ${badge.pairCount} connection${badge.pairCount === 1 ? "" : "s"}, also recorded as ${alsoRecorded.join(", ")}`,
    )
  }
  if (badge.edgeCount > badge.pairCount) {
    const connections = `${badge.pairCount} connection${badge.pairCount === 1 ? "" : "s"}`
    lines.push(`${badge.edgeCount} edge rows in the graph for ${connections}`)
  }
  lines.push(...badge.members)
  return lines.join("\n")
}
