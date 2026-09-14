import { describe, expect, it } from "vitest"
import {
  collapseTrunkWords,
  summarizeExternalEgress,
  summarizeS3Traffic,
  trunkWordBadgeTitle,
  uniqueDirectedPairs,
} from "@/components/topology-v0-2/estate-egress-summary"
import type { TrafficEdge } from "@/components/topology-v0-2/types"

/** Shapes copied from the C1 production capture (generation 1789380108) rather
 *  than invented, so a payload-contract change breaks these rather than
 *  quietly leaving the map asserting something the backend stopped sending. */
const NAT = "nat-0fd7cf8524e62aea9"
const IGW = "igw-01b6c643a5c856abe"

function egress(sourceId: string, distinct: number, samples: string[]): TrafficEdge {
  return {
    source_id: sourceId,
    target_id: "__igw__",
    edge_class: "egress",
    protocol: null,
    external_destinations: distinct,
    egress_breakdown: [{ kind: "external", count: distinct, sample_hosts: samples }],
    destinations: [],
    egress_hops: [
      { kind: "nat", id: NAT, subnet_id: "subnet-05472c7cd0d3a7b90" },
      { kind: "igw", id: IGW },
    ],
    structural_route: "NAT",
    via_nat_id: NAT,
    via_igw_id: IGW,
    route_basis: "structural_default_egress",
  } as unknown as TrafficEdge
}

// The three real legs, with their real counts and sample sizes.
const REAL_EGRESS = [
  egress("i-0129135b4e4723d6d", 32, ["3.5.73.1", "3.5.72.73", "3.5.72.119", "3.5.69.34", "3.5.67.254"]),
  egress("i-0b1a764c731dfc095", 3, ["54.217.69.183", "54.217.245.46", "3.253.225.145"]),
  egress("i-039d362b9862180c9", 10, ["3.5.73.29", "52.92.34.66", "3.5.64.128", "52.218.0.200", "3.5.64.0"]),
]

describe("summarizeExternalEgress — F3, the continuation past the IGW", () => {
  it("finds one leg per egress edge and keeps the hop chain in path order", () => {
    const summary = summarizeExternalEgress(REAL_EGRESS)!
    expect(summary.legs).toHaveLength(3)
    expect(summary.legs[0].hops.map(h => h.kind)).toEqual(["nat", "igw"])
    expect(summary.legs[0].hops.map(h => h.id)).toEqual([NAT, IGW])
    // The IGW is a HOP, so "via NAT" was never the error — the terminal was.
    expect(summary.natIds).toEqual([NAT])
    expect(summary.igwIds).toEqual([IGW])
  })

  it("marks the route structural, never observed", () => {
    expect(summarizeExternalEgress(REAL_EGRESS)!.routeBases).toEqual(["structural_default_egress"])
  })

  it("reports the summed count as an upper bound, not a distinct total", () => {
    const summary = summarizeExternalEgress(REAL_EGRESS)!
    // 32 + 3 + 10. Distinct WITHIN each leg; nothing says the sets are
    // disjoint, so this can only ever be an upper bound.
    expect(summary.maxDistinctUpperBound).toBe(45)
  })

  it("knows which sample is a complete inventory and which is an example", () => {
    const summary = summarizeExternalEgress(REAL_EGRESS)!
    expect(summary.legs.map(l => l.sampleIsComplete)).toEqual([false, true, false])
    // 3 of 3 is the only complete one, so the whole set is not.
    expect(summary.everySampleComplete).toBe(false)
    expect(summary.legs[0].sampleHosts).toHaveLength(5)
    expect(summary.legs[0].distinctDestinations).toBe(32)
  })

  it("never claims completeness when the count is missing", () => {
    const noCount = { ...egress("i-x", 0, ["1.2.3.4"]), external_destinations: null } as TrafficEdge
    const leg = summarizeExternalEgress([noCount])!.legs[0]
    expect(leg.distinctDestinations).toBeNull()
    // An empty sample against an unknown count is not "complete".
    expect(leg.sampleIsComplete).toBe(false)
  })

  it("treats a sample longer than its count as a disagreement, not completeness", () => {
    const skewed = { ...egress("i-y", 1, ["1.1.1.1", "2.2.2.2"]) } as TrafficEdge
    expect(summarizeExternalEgress([skewed])!.legs[0].sampleIsComplete).toBe(false)
  })

  it("invents no destination identities when the payload carries none", () => {
    const bare = { ...egress("i-z", 7, []), egress_breakdown: null } as unknown as TrafficEdge
    const leg = summarizeExternalEgress([bare])!.legs[0]
    expect(leg.sampleHosts).toEqual([])
    expect(leg.distinctDestinations).toBe(7)
    expect(leg.sampleIsComplete).toBe(false)
  })

  // --- the negative the brief asked for -----------------------------------
  it("returns null when nothing leaves the VPC, so no external node is drawn", () => {
    const internalOnly = [
      { source_id: "a", target_id: "b", edge_class: "internal", protocol: "TARGETS" },
      { source_id: "l", target_id: "arn:aws:s3:::bucket", edge_class: "edge_service", protocol: "ACTUAL_S3_ACCESS" },
    ] as unknown as TrafficEdge[]
    expect(summarizeExternalEgress(internalOnly)).toBeNull()
    expect(summarizeExternalEgress([])).toBeNull()
  })

  it("still resolves when the backend stops minting the __igw__ sentinel", () => {
    const real = { ...egress("i-real", 2, ["9.9.9.9", "8.8.8.8"]), target_id: IGW } as TrafficEdge
    expect(summarizeExternalEgress([real])!.legs[0].sampleIsComplete).toBe(true)
  })
})

describe("uniqueDirectedPairs — F4, one relationship is not twelve", () => {
  const rules = Array.from({ length: 6 }, (_, i) => `arn:aws:events:eu-west-1:416651950952:rule/r${i}`)
  const fns = Array.from({ length: 6 }, (_, i) => `arn:aws:lambda:eu-west-1:416651950952:function:f${i}`)
  // The defect: the same six endpoints carried by BOTH protocols.
  const doubled = rules.flatMap((rule, i) => [
    { source_id: rule, target_id: fns[i], protocol: "TARGETS" },
    { source_id: rule, target_id: fns[i], protocol: "TRIGGERS" },
  ]) as unknown as TrafficEdge[]

  it("counts six pairs per protocol, not twelve across both", () => {
    expect(uniqueDirectedPairs(doubled, ["TARGETS"])).toHaveLength(6)
    expect(uniqueDirectedPairs(doubled, ["TRIGGERS"])).toHaveLength(6)
    // Asked for both families at once it is still six relationships per
    // family — twelve rows only because protocol is part of identity.
    expect(uniqueDirectedPairs(doubled, ["TARGETS", "TRIGGERS"])).toHaveLength(12)
  })

  it("collapses repeated edges for the same pair", () => {
    const repeated = [doubled[0], doubled[0], doubled[0]] as TrafficEdge[]
    expect(uniqueDirectedPairs(repeated, ["TARGETS"])).toHaveLength(1)
  })

  it("keeps pairs distinct when ARNs contain the separator characters", () => {
    // "a:b" -> "c" and "a" -> "b:c" join to the same string under ":" — the
    // collision that would silently undercount.
    const colliding = [
      { source_id: "arn:a:b", target_id: "c", protocol: "TARGETS" },
      { source_id: "arn:a", target_id: "b:c", protocol: "TARGETS" },
      { source_id: "arn/a/b", target_id: "c", protocol: "TARGETS" },
      { source_id: "arn/a", target_id: "b/c", protocol: "TARGETS" },
    ] as unknown as TrafficEdge[]
    expect(uniqueDirectedPairs(colliding, ["TARGETS"])).toHaveLength(4)
  })

  it("ignores protocols it was not asked for", () => {
    expect(uniqueDirectedPairs(doubled, ["ACTUAL_S3_ACCESS"])).toEqual([])
    expect(uniqueDirectedPairs([], ["TARGETS"])).toEqual([])
  })
})

describe("summarizeS3Traffic — F4, four of six and not one action named", () => {
  const fns = ["nightly_burst", "daily", "frequent", "every_6h", "monthly", "weekly"].map(
    n => `arn:aws:lambda:eu-west-1:416651950952:function:cyntro-tb-prod-consumer-${n}`,
  )
  const bucket = "arn:aws:s3:::cyntro-tb-prod-appdata-1c8276f5"
  // Production: the first four have an edge; monthly and weekly have none;
  // every edge carries observed_actions: [].
  const s3Edges = fns.slice(0, 4).map(fn => ({
    source_id: fn,
    target_id: bucket,
    edge_class: "edge_service",
    protocol: "ACTUAL_S3_ACCESS",
    observed_actions: [],
  })) as unknown as TrafficEdge[]

  it("reports four of six", () => {
    const s = summarizeS3Traffic(s3Edges, fns)
    expect(s.withTraffic).toHaveLength(4)
    expect(s.total).toBe(6)
    expect(s.withTraffic.some(id => id.endsWith("monthly"))).toBe(false)
    expect(s.withTraffic.some(id => id.endsWith("weekly"))).toBe(false)
  })

  it("says no actions were recorded rather than implying named operations", () => {
    expect(summarizeS3Traffic(s3Edges, fns).noActionsRecorded).toBe(true)
  })

  it("stops saying that the moment one action is named", () => {
    const withAction = [...s3Edges]
    withAction[0] = { ...withAction[0], observed_actions: ["GetObject"] } as unknown as TrafficEdge
    expect(summarizeS3Traffic(withAction, fns).noActionsRecorded).toBe(false)
  })

  it("is not 'no actions recorded' when there is no traffic at all", () => {
    // Zero edges is zero traffic, a different statement from "traffic whose
    // actions we cannot name". Collapsing them would be the fabrication.
    const s = summarizeS3Traffic([], fns)
    expect(s.withTraffic).toEqual([])
    expect(s.noActionsRecorded).toBe(false)
  })

  it("ignores S3 edges from sources outside the function list", () => {
    const stranger = [
      ...s3Edges,
      { source_id: "i-999", target_id: bucket, protocol: "ACTUAL_S3_ACCESS", observed_actions: [] },
    ] as unknown as TrafficEdge[]
    expect(summarizeS3Traffic(stranger, fns).withTraffic).toHaveLength(4)
  })
})

describe("collapseTrunkWords — one badge per relationship, not per spelling", () => {
  /** The six EventBridge rules firing six Lambdas, recorded under both
   *  spellings. Production inventory (run 34832847455) drew `TARGETS ×6` and
   *  `TRIGGERS ×6` on the same trunk: one relationship, read as twelve. */
  const RULES = ["frequent", "every_6h", "daily", "nightly_burst", "weekly", "monthly"]
  const pairs = RULES.map(
    name =>
      `arn:aws:events:eu-west-1:416651950952:rule/cyntro-tb-prod-${name}` +
      `→arn:aws:lambda:eu-west-1:416651950952:function:cyntro-tb-prod-consumer-${name}`,
  )
  const mirrored = [
    { word: "TARGETS", members: pairs, count: 6 },
    { word: "TRIGGERS", members: pairs, count: 6 },
  ]

  it("draws one badge for six connections, not two badges for twelve edges", () => {
    const badges = collapseTrunkWords(mirrored)
    expect(badges).toHaveLength(1)
    expect(badges[0].pairCount).toBe(6)
    expect(badges[0].edgeCount).toBe(12)
    expect(badges[0].spellings).toEqual(["TARGETS", "TRIGGERS"])
  })

  it("keeps the printed word first and the twin spelling for the title", () => {
    const badge = collapseTrunkWords(mirrored)[0]
    const title = trunkWordBadgeTitle("TARGETS ×6", badge)
    expect(title.split("\n")[0]).toBe("TARGETS ×6")
    expect(title).toContain("also recorded as TRIGGERS")
    expect(title).toContain("12 edge rows in the graph for 6 connections")
    for (const pair of pairs) expect(title).toContain(pair)
  })

  it("refuses to merge when the two spellings cover different connections", () => {
    // One rule fires a seventh function under TRIGGERS only. That is a second
    // relationship, not a twin recording, and absorbing it would delete an edge
    // from the reader's count.
    const badges = collapseTrunkWords([
      { word: "TARGETS", members: pairs, count: 6 },
      { word: "TRIGGERS", members: [...pairs, "rule/extra→fn/extra"], count: 7 },
    ])
    expect(badges).toHaveLength(2)
    expect(badges.map(b => b.pairCount)).toEqual([6, 7])
    expect(badges.map(b => b.spellings)).toEqual([["TARGETS"], ["TRIGGERS"]])
  })

  it("merges regardless of the order the two spellings list their members", () => {
    const badges = collapseTrunkWords([
      { word: "TARGETS", members: pairs, count: 6 },
      { word: "TRIGGERS", members: [...pairs].reverse(), count: 6 },
    ])
    expect(badges).toHaveLength(1)
    // Payload order of the FIRST spelling is what the title lists.
    expect(badges[0].members).toEqual(pairs)
  })

  it("counts connections, never edge rows, when one pair is recorded twice", () => {
    // A single spelling with a duplicate member is one connection, not two.
    const badges = collapseTrunkWords([{ word: "KMS", members: ["a→b", "a→b", "c→d"], count: 3 }])
    expect(badges[0].pairCount).toBe(2)
    expect(badges[0].edgeCount).toBe(3)
    expect(trunkWordBadgeTitle("KMS ×2", badges[0])).toContain(
      "3 edge rows in the graph for 2 connections",
    )
  })

  it("leaves an unmirrored trunk exactly as it found it", () => {
    // C1's `KMS ×3` and `S3 access ×4`: three and four distinct pairs, one
    // spelling each. Nothing about this change may move those numbers.
    const badges = collapseTrunkWords([
      { word: "KMS", members: ["k1→r1", "k1→r2", "k1→r3"], count: 3 },
      { word: "S3 access", members: ["f1→b", "f2→b", "f3→b", "f4→b"], count: 4 },
    ])
    expect(badges.map(b => [b.spellings[0], b.pairCount, b.edgeCount])).toEqual([
      ["KMS", 3, 3],
      ["S3 access", 4, 4],
    ])
    expect(trunkWordBadgeTitle("KMS ×3", badges[0])).not.toContain("also recorded as")
    expect(trunkWordBadgeTitle("KMS ×3", badges[0])).not.toContain("edge rows")
  })

  it("never merges two member-less spellings, which share no evidence", () => {
    const badges = collapseTrunkWords([
      { word: "TARGETS", members: [], count: 0 },
      { word: "TRIGGERS", members: [], count: 0 },
    ])
    expect(badges).toHaveLength(2)
    expect(badges.map(b => b.pairCount)).toEqual([0, 0])
  })

  it("says 'connection' in the singular when a twin covers exactly one", () => {
    const badge = collapseTrunkWords([
      { word: "TARGETS", members: ["r→f"], count: 1 },
      { word: "TRIGGERS", members: ["r→f"], count: 1 },
    ])[0]
    expect(badge.pairCount).toBe(1)
    const title = trunkWordBadgeTitle("TARGETS", badge)
    expect(title).toContain("Same 1 connection, also recorded as")
    expect(title).toContain("2 edge rows in the graph for 1 connection")
    expect(title).not.toContain("1 connections")
  })

  it("returns nothing for a trunk that carries no words", () => {
    expect(collapseTrunkWords([])).toEqual([])
  })
})
