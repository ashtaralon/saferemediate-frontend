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
  /** Distinct destinations behind THIS leg, as the backend counted them. */
  distinctDestinations: number | null
  /** Hops in path order — structural (route tables), never observed per-flow. */
  hops: { kind: string; id: string; subnetId?: string | null }[]
  /** Sampled destination addresses. May be shorter than the distinct count. */
  sampleHosts: string[]
  /** The sample covers the whole count for this leg, so it IS the inventory. */
  sampleIsComplete: boolean
}

export interface ExternalEgressSummary {
  legs: ExternalEgressLeg[]
  /** UPPER BOUND, not a distinct total: per-leg counts are distinct WITHIN a
   *  leg, and nothing in the payload says whether two workloads reached the
   *  same host. Summing them and calling it "45 destinations" would invent a
   *  fact. Named so a caller cannot use it as a total by accident. */
  maxDistinctUpperBound: number
  /** Every leg's sample covers its own count — only then is the sampled list a
   *  complete inventory rather than an example. */
  everySampleComplete: boolean
  /** Distinct hop ids by kind, across all legs. */
  natIds: string[]
  igwIds: string[]
  routeBases: string[]
}

function isExternalEgress(edge: TrafficEdge): boolean {
  // The sentinel is what the projection actually emits for "left the VPC"; a
  // real igw- id is accepted too so this does not silently stop working the
  // day the backend stops minting the sentinel.
  return edge.target_id === IGW_CANVAS_ANCHOR_ID || edge.target_id.startsWith("igw-")
}

/** The external continuation beyond the IGW, or null when nothing leaves.
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
    if (!isExternalEgress(edge)) continue
    const sampleHosts = (edge.egress_breakdown ?? []).flatMap(b => b.sample_hosts ?? [])
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
    if (edge.route_basis && !routeBases.includes(edge.route_basis)) routeBases.push(edge.route_basis)
  }

  if (legs.length === 0) return null
  return {
    legs,
    maxDistinctUpperBound: legs.reduce((sum, leg) => sum + (leg.distinctDestinations ?? 0), 0),
    everySampleComplete: legs.every(leg => leg.sampleIsComplete),
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
