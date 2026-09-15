import { describe, expect, it } from "vitest"
import {
  EXTERNAL_DESTINATION_FLOW_PREFIX,
  externalDestinationMap,
  externalDestinationProjectionMap,
  summarizeExternalEgress,
} from "@/components/topology-v0-2/estate-egress-summary"
import type {
  ExternalDestinationProjection,
  TrafficEdge,
} from "@/components/topology-v0-2/types"
import v11Fixture from "./fixtures/topology-risk/estate-map-v11-contract.json"

/** What the map may DRAW beyond the gateway.
 *
 *  The summary layer answers "did anything leave, and how much"; this one
 *  answers "what may be drawn as a node, and what may it be called". The
 *  second question is where a map stops being evidence and starts being
 *  decoration, so the identity rule is the thing under test: an address is an
 *  address unless the payload attributed a service to it.
 *
 *  Shapes are the C1 production capture (generation 1789380108) — three
 *  observed legs, counts 32 / 3 / 10, five sampled addresses each, no
 *  `destinations[]`, no service attribution anywhere. */
const NAT = "nat-0fd7cf8524e62aea9"
const IGW = "igw-01b6c643a5c856abe"

function egress(
  sourceId: string,
  distinct: number | null,
  samples: string[],
  extra: Partial<TrafficEdge> = {},
): TrafficEdge {
  return {
    source_id: sourceId,
    target_id: "__igw__",
    edge_class: "egress",
    protocol: null,
    external_destinations: distinct,
    egress_breakdown: [{ kind: "external", count: distinct ?? samples.length, sample_hosts: samples }],
    destinations: [],
    egress_hops: [
      { kind: "nat", id: NAT, subnet_id: "subnet-05472c7cd0d3a7b90" },
      { kind: "igw", id: IGW },
    ],
    structural_route: "NAT",
    via_nat_id: NAT,
    via_igw_id: IGW,
    route_basis: "structural_default_egress",
    ...extra,
  } as unknown as TrafficEdge
}

const REAL_EGRESS = [
  egress("i-0129135b4e4723d6d", 32, ["3.5.73.1", "3.5.72.73", "3.5.72.119", "3.5.69.34", "3.5.67.254"]),
  egress("i-0b1a764c731dfc095", 3, ["54.217.69.183", "54.217.245.46", "3.253.225.145"]),
  egress("i-039d362b9862180c9", 10, ["3.5.73.29", "52.92.34.66", "3.5.64.128", "52.218.0.200", "3.5.64.0"]),
]

function mapOf(edges: TrafficEdge[], limit?: number) {
  return externalDestinationMap(summarizeExternalEgress(edges), edges, limit)
}

describe("externalDestinationMap — positive: the real C1 egress", () => {
  it("draws de-duplicated address nodes with the gateway the edges leave through", () => {
    const m = mapOf(REAL_EGRESS, 6)!
    expect(m).not.toBeNull()
    expect(m.gatewayId).toBe(IGW)
    // 13 sampled addresses across the three legs, none repeated.
    expect(m.totalNamed).toBe(13)
    expect(m.nodes).toHaveLength(6)
    expect(m.hiddenCount).toBe(7)
    // Every drawn node is an ADDRESS: this payload attributes no service.
    expect(m.nodes.every(n => n.identity === "address")).toBe(true)
    expect(m.attributedCount).toBe(0)
    // The bound across the legs is preserved, not recomputed from the sample.
    expect(m.distinctUpperBound).toBe(45)
    expect(m.legsWithUnknownDistinct).toBe(0)
    expect(m.everySampleComplete).toBe(false)
  })

  it("every leg named at least one address, so there is no unknown remainder", () => {
    expect(mapOf(REAL_EGRESS)!.remainder).toBeNull()
  })

  it("gives each node a stable flow id the overlay can anchor a gateway edge to", () => {
    const m = mapOf(REAL_EGRESS)!
    const ids = m.nodes.map(n => `${EXTERNAL_DESTINATION_FLOW_PREFIX}${n.key}`)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids[0].startsWith("extdst:")).toBe(true)
  })

  it("is deterministic — the same payload twice draws the same map", () => {
    expect(mapOf(REAL_EGRESS)!.nodes).toEqual(mapOf(REAL_EGRESS)!.nodes)
  })
})

describe("externalDestinationMap — negative: nothing may be drawn", () => {
  it("returns null when nothing observably leaves the VPC", () => {
    expect(mapOf([])).toBeNull()
  })

  it("returns null for a CONFIGURED route to the gateway", () => {
    // A route table entry points at the IGW too. Drawing destination nodes off
    // it would assert observed traffic on the evidence that a route exists.
    const configured = egress("i-route", 9, ["3.5.73.1"], {
      evidence_type: "configured",
      path_basis: "configured_route",
      authority_state: "configured",
    } as Partial<TrafficEdge>)
    expect(mapOf([configured])).toBeNull()
  })

  it("draws no node for an edge that leaves the VPC with no evidence behind it", () => {
    const bare = {
      source_id: "i-bare",
      target_id: "__igw__",
      edge_class: "egress",
    } as unknown as TrafficEdge
    expect(mapOf([bare])).toBeNull()
  })

  it("keeps legacy destination detail unlinked when no exact IGW id is present", () => {
    const noExactGateway = egress("i-a", 1, ["1.1.1.1"], {
      egress_hops: [],
      via_igw_id: null,
    })
    const m = mapOf([noExactGateway])!
    expect(m.gatewayId).toBeNull()
    expect(m.nodes).toEqual([])
    expect(m.unlinkedNodes.map(node => node.address)).toEqual(["1.1.1.1"])
    expect(m.continuations).toEqual([])
  })

  it("accepts legacy via_igw_id as the exact configured gateway identity", () => {
    const exactGateway = egress("i-a", 1, ["1.1.1.1"], { egress_hops: [] })
    const m = mapOf([exactGateway])!
    expect(m.gatewayId).toBe(IGW)
    expect(m.nodes).toHaveLength(1)
    expect(m.continuations[0].sourceId).toBe(IGW)
  })
})

describe("externalDestinationMap — duplicate addresses", () => {
  it("draws ONE node when two workloads reach the same address, naming both", () => {
    const shared = [
      egress("i-a", 2, ["3.5.73.1", "3.5.72.73"]),
      egress("i-b", 2, ["3.5.73.1", "9.9.9.9"]),
    ]
    const m = mapOf(shared)!
    expect(m.totalNamed).toBe(3)
    const repeated = m.nodes.find(n => n.label === "3.5.73.1")!
    expect(repeated.sources).toEqual(["i-a", "i-b"])
    // One node, so the gateway edge fans out to three destinations, not four.
    expect(m.nodes.filter(n => n.label === "3.5.73.1")).toHaveLength(1)
  })

  it("de-duplicates case-insensitively and across buckets of one edge", () => {
    const twoBuckets = egress("i-a", 1, [], {
      egress_breakdown: [
        { kind: "s3", count: 1, sample_hosts: ["S3.eu-west-1.amazonaws.com"] },
        { kind: "other_aws", count: 1, sample_hosts: ["s3.eu-west-1.amazonaws.com"] },
      ],
    } as Partial<TrafficEdge>)
    const m = mapOf([twoBuckets])!
    expect(m.totalNamed).toBe(1)
    expect(m.nodes[0].sources).toEqual(["i-a"])
  })
})

describe("externalDestinationMap — unknown counts are never zero", () => {
  it("keeps an unknown distinct count as null rather than summing it as 0", () => {
    const m = mapOf([
      egress("i-known", 4, ["1.1.1.1"]),
      egress("i-unknown", null, ["2.2.2.2"]),
    ])!
    // 4 from the known leg; the unknown leg contributes nothing to the bound
    // and is counted as a gap instead.
    expect(m.distinctUpperBound).toBe(4)
    expect(m.legsWithUnknownDistinct).toBe(1)
  })

  it("reports an unknown bound as null when NO leg carries a count", () => {
    const m = mapOf([egress("i-a", null, ["1.1.1.1"]), egress("i-b", null, ["2.2.2.2"])])!
    expect(m.distinctUpperBound).toBeNull()
    expect(m.legsWithUnknownDistinct).toBe(2)
  })

  it("carries no observation count when the payload carried none", () => {
    // A bucket count covers the BUCKET, not the sampled address, so attaching
    // it per host would multiply one bucket's traffic by its sample size.
    expect(mapOf([egress("i-a", 20, ["1.1.1.1", "2.2.2.2"])])!.nodes[0].observationCount).toBeNull()
  })
})

describe("externalDestinationMap — no service identity", () => {
  it("draws an address as an address even when the bucket kind says other_aws", () => {
    // `kind` is the projection CLASSIFYING an address. It is not an
    // attribution, and rendering it as a service name would put a label on the
    // map that no evidence supports.
    const m = mapOf([egress("i-a", 1, ["52.218.0.200"], {
      egress_breakdown: [{ kind: "other_aws", count: 1, sample_hosts: ["52.218.0.200"] }],
    } as Partial<TrafficEdge>)])!
    expect(m.nodes[0].identity).toBe("address")
    expect(m.nodes[0].label).toBe("52.218.0.200")
    expect(m.nodes[0].kind).toBe("other_aws")
    expect(m.attributedCount).toBe(0)
  })

  it("declares a leg with observed traffic and no addresses as an unknown remainder", () => {
    const m = mapOf([egress("i-named", 2, ["1.1.1.1"]), egress("i-silent", 7, [])])!
    expect(m.totalNamed).toBe(1)
    expect(m.remainder).toEqual({ legs: 1, distinctUpperBound: 7, unknownCountLegs: 0 })
  })

  it("keeps the remainder's own bound unknown when that leg carries no count", () => {
    const m = mapOf([egress("i-named", 2, ["1.1.1.1"]), egress("i-silent", null, [])])!
    expect(m.remainder).toEqual({ legs: 1, distinctUpperBound: null, unknownCountLegs: 1 })
  })

  it("returns a map with zero named nodes when NO leg names an address", () => {
    // The perimeter is still drawn: traffic left, and what it reached is
    // unknown. Returning null here would render a blank lane and read as "no
    // egress", which contradicts the counts.
    const m = mapOf([egress("i-a", 12, []), egress("i-b", 5, [])])!
    expect(m.nodes).toEqual([])
    expect(m.totalNamed).toBe(0)
    expect(m.remainder).toEqual({ legs: 2, distinctUpperBound: 17, unknownCountLegs: 0 })
    expect(m.gatewayId).toBe(IGW)
  })
})

describe("externalDestinationMap — authoritative AWS attribution", () => {
  it("names a service ONLY from aws_service, and marks it attributed", () => {
    const attributed = egress("i-a", 1, [], {
      destinations: [
        { address: "52.218.0.200", kind: "other_aws", observation_count: 41, aws_service: "S3" },
      ],
    } as Partial<TrafficEdge>)
    const m = mapOf([attributed])!
    expect(m.nodes[0].identity).toBe("aws_service")
    expect(m.nodes[0].label).toBe("S3")
    expect(m.nodes[0].observationCount).toBe(41)
    expect(m.attributedCount).toBe(1)
  })

  it("reads aws_service off a breakdown bucket too", () => {
    const m = mapOf([egress("i-a", 1, [], {
      egress_breakdown: [
        { kind: "other_aws", count: 3, sample_hosts: ["52.218.0.200"], aws_service: "DynamoDB" },
      ],
    } as Partial<TrafficEdge>)])!
    expect(m.nodes[0].identity).toBe("aws_service")
    expect(m.nodes[0].label).toBe("DynamoDB")
  })

  it("prefers per-destination evidence over the sample for the same edge", () => {
    // destinations[] carries counts and attribution; sample_hosts does not.
    // Reading both would draw the same destination twice, once per spelling.
    const both = egress("i-a", 2, ["52.218.0.200"], {
      destinations: [
        { address: "52.218.0.200", kind: "other_aws", observation_count: 9, aws_service: "S3" },
      ],
    } as Partial<TrafficEdge>)
    const m = mapOf([both])!
    expect(m.totalNamed).toBe(1)
    expect(m.nodes[0].label).toBe("S3")
  })

  it("sorts attributed services ahead of bare addresses", () => {
    const m = mapOf([
      egress("i-a", 3, ["1.1.1.1", "2.2.2.2"]),
      egress("i-b", 1, [], {
        egress_breakdown: [{ kind: "s3", count: 1, sample_hosts: ["x"], aws_service: "S3" }],
      } as Partial<TrafficEdge>),
    ])!
    expect(m.nodes[0].label).toBe("S3")
    expect(m.nodes[0].identity).toBe("aws_service")
  })

  it("an attribution wins over an address spelling of the same destination", () => {
    const m = mapOf([
      egress("i-a", 1, [], {
        destinations: [{ address: "s3", kind: "s3", observation_count: 2 }],
      } as Partial<TrafficEdge>),
      egress("i-b", 1, [], {
        destinations: [{ address: "ignored", kind: "s3", observation_count: 3, aws_service: "S3" }],
      } as Partial<TrafficEdge>),
    ])!
    const node = m.nodes.find(n => n.key === "s3")!
    expect(node.identity).toBe("aws_service")
    expect(node.observationCount).toBe(5)
    expect(node.sources).toEqual(["i-a", "i-b"])
  })
})

describe("externalDestinationMap — the bound", () => {
  it("never draws more than the limit, and says how many it withheld", () => {
    const m = mapOf(REAL_EGRESS, 3)!
    expect(m.nodes).toHaveLength(3)
    expect(m.hiddenCount).toBe(10)
    expect(m.totalNamed).toBe(13)
  })

  it("reports hiddenCount 0 when the drawn set IS every named destination", () => {
    expect(mapOf(REAL_EGRESS, 50)!.hiddenCount).toBe(0)
  })

  // The withheld destinations used to be counted and thrown away, so the
  // "+N more" disclosure promised "the rest" and listed nothing. A control
  // that offers evidence it no longer holds is worse than no control.
  it("KEEPS the withheld destinations rather than only counting them", () => {
    const m = mapOf(REAL_EGRESS, 3)!
    expect(m.hiddenNodes).toHaveLength(m.hiddenCount)
    expect(m.hiddenNodes.every(n => n.label.length > 0)).toBe(true)
    expect(m.hiddenNodes.every(n => n.sources.length > 0)).toBe(true)
  })

  it("splits drawn and withheld without losing or duplicating one", () => {
    const m = mapOf(REAL_EGRESS, 3)!
    const keys = [...m.nodes, ...m.hiddenNodes].map(n => n.key)
    expect(keys).toHaveLength(m.totalNamed)
    expect(new Set(keys).size).toBe(m.totalNamed)
  })

  it("withholds in drawing order — the withheld set continues the drawn one", () => {
    const all = mapOf(REAL_EGRESS, 50)!.nodes
    const split = mapOf(REAL_EGRESS, 3)!
    expect([...split.nodes, ...split.hiddenNodes]).toEqual(all)
  })

  it("carries an empty withheld set when nothing is withheld", () => {
    expect(mapOf(REAL_EGRESS, 50)!.hiddenNodes).toEqual([])
  })

  it("keeps the attributed service DRAWN and pushes addresses into the withheld set", () => {
    // Ordering is the contract the lane relies on: the strongest claim is the
    // one a reader sees without opening anything.
    const withService = [
      ...REAL_EGRESS,
      egress("i-svc", 1, [], {
        egress_breakdown: [{ kind: "s3", count: 1, sample_hosts: ["x"], aws_service: "S3" }],
      } as Partial<TrafficEdge>),
    ]
    const m = mapOf(withService, 1)!
    expect(m.nodes[0].identity).toBe("aws_service")
    expect(m.hiddenNodes.every(n => n.identity === "address")).toBe(true)
  })
})

describe("externalDestinationProjectionMap — topology-risk/v11", () => {
  const projection = v11Fixture.external_destination_projection as ExternalDestinationProjection

  it("uses the backend's exact gateway join and keeps observed/configured provenance separate", () => {
    const m = externalDestinationProjectionMap(projection)!
    expect(m.detailState).toBe("complete")
    expect(m.nodes).toHaveLength(1)
    expect(m.nodes[0]).toMatchObject({
      projectionId: "external-destination:8f3617f4e83477da",
      label: "18.202.1.10",
      identity: "address",
      ports: [443],
      protocols: ["TCP"],
      observationCount: 31,
      totalBytes: 8192,
      projectionGeneration: 164,
    })
    expect(m.continuations).toEqual([
      expect.objectContaining({
        sourceId: "igw-01b6c643a5c856abe",
        sourceAnchorId: "__igw__",
        targetKey: "external-destination:8f3617f4e83477da",
        destinationEvidence: "observed",
        gatewayEvidence: "configured",
        gatewayTraversalObserved: false,
      }),
    ])
  })

  it("keeps unidentified peers separate from the IGW lane", () => {
    const m = externalDestinationProjectionMap(projection)!
    expect(m.nodes.map(node => node.address)).not.toContain("10.42.99.17")
    expect(m.continuations).toHaveLength(1)
    expect(m.unidentifiedPeerUpperBound).toBe(1)
    expect(m.unidentifiedPeerSamples).toEqual(["10.42.99.17"])
  })

  it("keeps observed and legacy-unverified destination evidence distinct", () => {
    const mixed = structuredClone(projection)
    const observed = mixed.nodes[0]
    mixed.nodes.push({
      ...observed,
      id: "external-destination:legacy",
      address: "18.202.1.11",
      observation_count: null,
      total_bytes: null,
      first_seen: null,
      last_seen: null,
      evidence_type: "legacy_unverified",
      evidence_source: "legacy_behavioral_graph",
      evidence_ids: [],
      projection_generation: null,
    })
    mixed.edges.push({
      ...mixed.edges[0],
      target_id: "external-destination:legacy",
      destination_evidence: "legacy_unverified",
      path_basis: "legacy_destination_with_configured_route",
    })
    mixed.counts.returned_destination_nodes = 2
    mixed.counts.named_destination_nodes_before_bound = 2

    const m = externalDestinationProjectionMap(mixed)!
    expect(m.evidenceState).toBe("mixed")
    expect(m.nodes.map(node => node.evidenceType)).toEqual(["observed", "legacy_unverified"])
    expect(m.continuations.map(edge => edge.destinationEvidence)).toEqual([
      "observed",
      "legacy_unverified",
    ])
    expect(m.continuations.map(edge => edge.pathBasis)).toEqual([
      "observed_destination_with_configured_route",
      "legacy_destination_with_configured_route",
    ])
  })

  it("accepts the backend's exact legacy node and continuation pair", () => {
    const legacy = structuredClone(projection)
    legacy.nodes[0] = {
      ...legacy.nodes[0],
      observation_count: null,
      total_bytes: null,
      first_seen: null,
      last_seen: "2026-09-14T06:00:00Z",
      evidence_type: "legacy_unverified",
      evidence_source: "legacy_behavioral_graph",
      evidence_ids: [],
      projection_generation: null,
    }
    legacy.edges[0] = {
      ...legacy.edges[0],
      destination_evidence: "legacy_unverified",
      path_basis: "legacy_destination_with_configured_route",
    }

    const m = externalDestinationProjectionMap(legacy)!
    expect(m.evidenceState).toBe("legacy_unverified")
    expect(m.nodes[0].observationCount).toBeNull()
    expect(m.continuations[0]).toMatchObject({
      destinationEvidence: "legacy_unverified",
      gatewayEvidence: "configured",
      gatewayTraversalObserved: false,
      pathBasis: "legacy_destination_with_configured_route",
    })
  })

  it("renders the backend's aggregate mixed evidence only with its matched mixed path", () => {
    const mixed = structuredClone(projection)
    mixed.nodes[0] = {
      ...mixed.nodes[0],
      evidence_type: "mixed",
      evidence_source: "mixed",
      projection_generation: null,
    }
    mixed.edges[0] = {
      ...mixed.edges[0],
      destination_evidence: "mixed",
      path_basis: "mixed_destination_with_configured_route",
    }

    const m = externalDestinationProjectionMap(mixed)!
    expect(m.evidenceState).toBe("mixed")
    expect(m.nodes[0].evidenceType).toBe("mixed")
    expect(m.continuations[0]).toMatchObject({
      destinationEvidence: "mixed",
      pathBasis: "mixed_destination_with_configured_route",
    })
  })

  it("rejects malformed evidence rather than turning it into an observed line", () => {
    const malformed = structuredClone(projection)
    malformed.edges[0].destination_evidence = "legacy_unverified"
    const m = externalDestinationProjectionMap(malformed)!
    expect(m.nodes).toEqual([])
    expect(m.unlinkedNodes).toHaveLength(1)
    expect(m.continuations).toEqual([])
    expect(m.rejectedEdgeCount).toBe(1)
    expect(m.detailState).toBe("partial")
    expect(m.availabilityReason).toContain("1 continuation edge")
  })

  it("makes a missing or unsupported v11 projection explicitly unavailable", () => {
    const missing = externalDestinationProjectionMap(null)!
    expect(missing.detailState).toBe("unavailable")
    expect(missing.evidenceState).toBe("unavailable")
    expect(missing.continuations).toEqual([])
    expect(missing.availabilityReason).toContain("unavailable")

    const unsupported = externalDestinationProjectionMap({
      ...projection,
      version: "estate-egress-destinations/v99",
    })!
    expect(unsupported.detailState).toBe("unavailable")
    expect(unsupported.availabilityReason).toContain("unsupported")

    const malformed = externalDestinationProjectionMap({
      ...projection,
      nodes: [null] as unknown as ExternalDestinationProjection["nodes"],
    })!
    expect(malformed.detailState).toBe("partial")
    expect(malformed.rejectedNodeCount).toBe(1)
    expect(malformed.continuations).toEqual([])
  })

  it("does not fabricate a gateway link for a returned but unlinked destination", () => {
    const unlinked: ExternalDestinationProjection = {
      ...projection,
      edges: [],
      counts: { ...projection.counts, unlinked_returned_destination_nodes: 1 },
      detail_complete: false,
    }
    const m = externalDestinationProjectionMap(unlinked)!
    expect(m.nodes).toEqual([])
    expect(m.unlinkedNodes).toHaveLength(1)
    expect(m.continuations).toEqual([])
    expect(m.gatewayId).toBeNull()
    expect(m.detailState).toBe("partial")
  })

  it("refuses a projection edge whose exact gateway does not own its canvas anchor", () => {
    const m = externalDestinationProjectionMap(projection, {
      gatewayByAnchor: new Map([["__igw__", "igw-some-other-vpc"]]),
    })!
    expect(m.nodes).toEqual([])
    expect(m.unlinkedNodes).toHaveLength(1)
    expect(m.continuations).toEqual([])
    expect(m.gatewayId).toBeNull()
  })

  it("distinguishes truncated detail from completely unavailable identities", () => {
    const truncated: ExternalDestinationProjection = {
      ...projection,
      counts: { ...projection.counts, named_destination_nodes_before_bound: 4 },
      detail_complete: false,
      truncated: true,
    }
    const partial = externalDestinationProjectionMap(truncated)!
    expect(partial.detailState).toBe("truncated")
    expect(partial.detailsReturned).toBe(1)
    expect(partial.unreturnedCount).toBe(3)

    const unavailable: ExternalDestinationProjection = {
      ...truncated,
      nodes: [],
      edges: [],
      counts: {
        ...truncated.counts,
        returned_destination_nodes: 0,
        unlinked_returned_destination_nodes: 0,
      },
      unidentified_peer_samples: [],
    }
    const missing = externalDestinationProjectionMap(unavailable)!
    expect(missing.detailState).toBe("unavailable")
    expect(missing.nodes).toEqual([])
    expect(missing.unreturnedCount).toBe(4)
  })
})
