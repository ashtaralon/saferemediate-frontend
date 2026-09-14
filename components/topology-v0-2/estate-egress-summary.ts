import type { TrafficEdge } from "./types"
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
