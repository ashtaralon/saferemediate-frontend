/**
 * Ops perimeter model — the facts behind the NORTH / EAST doors, the NAT
 * resilience marker, the egress classes and the one-line readout.
 *
 * Synthetic ids on purpose (`subnet-a`, `nat-1` …): these pin the model's
 * contract, not a customer's estate. Every assertion is about what the model
 * may and may not CLAIM from a payload.
 */

import { describe, expect, it } from "vitest"

import type { ExternalDestinationMap, ExternalDestinationNode } from "@/components/topology-v0-2/estate-egress-summary"
import {
  buildOpsReadout,
  egressDestinationClass,
  groupExternalDestinations,
  logicalGroupHullLabel,
  logicalGroupKind,
  missingGatewayEndpoints,
  natAzCoverage,
} from "@/components/topology-v0-2/ops-perimeter-model"
import type { SubnetMeta, TopologyNode, TrafficEdge } from "@/components/topology-v0-2/types"

const subnet = (id: string, az: string, tier: SubnetMeta["tier"]): SubnetMeta => ({
  id,
  name: id,
  az,
  cidr: null,
  tier,
  tier_source: "property",
})

const workload = (id: string, subnetIds: string[]): TopologyNode =>
  ({ id, name: id, type: "EC2Instance", subnet_id: subnetIds[0] ?? null, subnet_ids: subnetIds }) as unknown as TopologyNode

const edge = (e: Partial<TrafficEdge> & Pick<TrafficEdge, "source_id" | "target_id">): TrafficEdge => e as TrafficEdge

const dest = (key: string, identity: ExternalDestinationNode["identity"], kind: string | null, sources: string[]): ExternalDestinationNode => ({
  key,
  label: key,
  identity,
  kind,
  sources,
  observationCount: null,
})

const SUBNETS = [
  subnet("pub-a", "zone-a", "web"),
  subnet("pub-b", "zone-b", "web"),
  subnet("app-a", "zone-a", "app"),
  subnet("app-b", "zone-b", "app"),
]

describe("egress destination classes", () => {
  it("names a service only when the evidence attributed one", () => {
    expect(egressDestinationClass({ identity: "aws_service", kind: "s3" })).toBe("aws_attributed")
    // kind is the projection's classification, never an attribution
    expect(egressDestinationClass({ identity: "address", kind: "s3" })).toBe("aws_classified")
    expect(egressDestinationClass({ identity: "address", kind: "other_aws" })).toBe("aws_classified")
    expect(egressDestinationClass({ identity: "address", kind: "external" })).toBe("external")
    expect(egressDestinationClass({ identity: "address", kind: "unclassified" })).toBe("unknown")
    expect(egressDestinationClass({ identity: "address", kind: null })).toBe("unknown")
  })

  it("keeps the unnamed remainder as an unknown group even with no unknown node", () => {
    const map = {
      nodes: [dest("a", "address", "s3", ["w1", "w2"]), dest("b", "address", "external", ["w1"])],
      hiddenNodes: [],
      hiddenCount: 0,
      totalNamed: 2,
      attributedCount: 0,
      remainder: { legs: 1, distinctUpperBound: null, unknownCountLegs: 1 },
      distinctUpperBound: null,
      legsWithUnknownDistinct: 1,
      everySampleComplete: false,
    } as unknown as ExternalDestinationMap
    const groups = groupExternalDestinations(map)
    expect(groups.map(g => g.cls)).toEqual(["aws_classified", "external", "unknown"])
    expect(groups[0].sourceCount).toBe(2)
    expect(groups[2].nodes).toHaveLength(0)
  })
})

describe("NAT placement per AZ", () => {
  it("flags the AZ with no NAT and the configured cross-AZ route into it", () => {
    const cov = natAzCoverage({
      natGws: [{ id: "nat-1", name: "nat-1", subnet_id: "pub-a" }],
      subnets: SUBNETS,
      azs: ["zone-a", "zone-b"],
      nodes: [workload("app-in-b", ["app-b"]), workload("app-in-a", ["app-a"])],
      edges: [
        edge({ source_id: "app-in-b", target_id: "__igw__", via_nat_id: "nat-1", structural_route: "NAT" }),
        edge({ source_id: "app-in-a", target_id: "__igw__", via_nat_id: "nat-1", structural_route: "NAT" }),
      ],
    })
    expect(cov.azsWithoutNat).toEqual(["zone-b"])
    expect(cov.noNat).toBe(false)
    expect(cov.crossAzRoutes).toEqual([{ sourceId: "app-in-b", sourceAz: "zone-b", natId: "nat-1", natAz: "zone-a" }])
  })

  it("does not call a multi-AZ workload cross-AZ when one of its subnets is local to the NAT", () => {
    const cov = natAzCoverage({
      natGws: [{ id: "nat-1", name: "nat-1", subnet_id: "pub-a" }],
      subnets: SUBNETS,
      azs: ["zone-a", "zone-b"],
      nodes: [workload("multi", ["app-a", "app-b"])],
      edges: [edge({ source_id: "multi", target_id: "__igw__", via_nat_id: "nat-1" })],
    })
    expect(cov.crossAzRoutes).toEqual([])
  })

  it("reports a VPC with no NAT as noNat, not as every AZ missing one", () => {
    const cov = natAzCoverage({ natGws: [], subnets: SUBNETS, azs: ["zone-a", "zone-b"], nodes: [], edges: [] })
    expect(cov.noNat).toBe(true)
    expect(cov.azsWithoutNat).toEqual([])
  })

  it("never places a NAT whose subnet the payload does not carry, and then claims no AZ gap", () => {
    const cov = natAzCoverage({
      natGws: [{ id: "nat-x", name: "nat-x", subnet_id: "subnet-not-here" }],
      subnets: SUBNETS,
      azs: ["zone-a", "zone-b"],
      nodes: [],
      edges: [],
    })
    expect(cov.unplacedNatIds).toEqual(["nat-x"])
    expect(cov.azsWithoutNat).toEqual([])
  })
})

describe("missing gateway endpoints", () => {
  const s3ViaNat = edge({ source_id: "w1", target_id: "__aws_s3__", structural_route: "NAT" })

  it("draws a missing S3 door when S3 traffic routes via NAT and no S3 gateway endpoint exists", () => {
    const found = missingGatewayEndpoints({ edges: [s3ViaNat], vpces: [], regionalNodes: [] })
    expect(found).toEqual([{ service: "s3", sourceIds: ["w1"], via: ["NAT"] }])
  })

  it("draws nothing when the S3 gateway endpoint exists", () => {
    const found = missingGatewayEndpoints({
      edges: [s3ViaNat],
      vpces: [{ id: "vpce-1", service_name: "com.amazonaws.region-x.s3", endpoint_type: "Gateway" }],
      regionalNodes: [],
    })
    expect(found).toEqual([])
  })

  it("draws nothing when the route is already the endpoint or is ambiguous", () => {
    const found = missingGatewayEndpoints({
      edges: [
        edge({ source_id: "w1", target_id: "__aws_s3__", structural_route: "VPCE" }),
        edge({ source_id: "w2", target_id: "__aws_s3__", structural_route: "AMBIGUOUS" }),
      ],
      vpces: [],
      regionalNodes: [],
    })
    expect(found).toEqual([])
  })

  it("counts a named bucket on the rail, and a DynamoDB destination attributed by evidence", () => {
    const found = missingGatewayEndpoints({
      edges: [
        edge({ source_id: "w1", target_id: "bucket-1", structural_route: "IGW" }),
        edge({
          source_id: "w2",
          target_id: "__igw__",
          structural_route: "NAT",
          destinations: [{ address: "203.0.113.9", kind: "other_aws", observation_count: 1, aws_service: "DYNAMODB" }],
        }),
      ],
      vpces: [],
      regionalNodes: [{ id: "bucket-1", type: "S3Bucket" }],
    })
    expect(found).toEqual([
      { service: "s3", sourceIds: ["w1"], via: ["IGW"] },
      { service: "dynamodb", sourceIds: ["w2"], via: ["NAT"] },
    ])
  })
})

describe("logical group hulls", () => {
  it("names the group kind and flags a single-AZ group", () => {
    expect(logicalGroupKind("AutoScalingGroup")).toBe("asg")
    expect(logicalGroupKind("TargetGroup")).toBe("target_group")
    expect(logicalGroupKind("RDSCluster")).toBe("cluster")
    expect(logicalGroupHullLabel({ kind: "asg", label: "web", azs: ["zone-a"], singleAz: true })).toBe("ASG · web · 1 AZ only")
    expect(logicalGroupHullLabel({ kind: "cluster", label: "db", azs: ["zone-a", "zone-b"], singleAz: false })).toBe(
      "Cluster · db · 2 AZs",
    )
    expect(logicalGroupHullLabel({ kind: "target_group", label: "tg", azs: [], singleAz: false })).toBe("TG · tg · AZ unknown")
  })
})

describe("ops readout", () => {
  const nat = natAzCoverage({
    natGws: [{ id: "nat-1", name: "nat-1", subnet_id: "pub-a" }],
    subnets: SUBNETS,
    azs: ["zone-a", "zone-b"],
    nodes: [],
    edges: [],
  })

  it("warns on the Out segment when an AZ has no NAT", () => {
    const segs = buildOpsReadout({
      loadBalancerCount: 2,
      igwCount: 1,
      nat,
      egress: null,
      awsServiceCounts: [{ label: "Lambda", count: 6 }],
      missingEndpoints: [],
      trafficAuthorityState: "legacy_unverified",
    })
    const byKey = Object.fromEntries(segs.map(s => [s.key, s]))
    expect(byKey.ingress.value).toBe("IGW → 2 LBs")
    expect(byKey.egress.tone).toBe("warn")
    expect(byKey.egress.value).toContain("1 NAT (zone-a)")
    // No egress summary is a gap, never "0 workloads"
    expect(byKey.egress.value).toContain("egress not observed")
    expect(byKey.aws.value).toBe("Lambda 6")
    expect(byKey.evidence.value).toBe("historical, not live")
    expect(byKey.evidence.tone).toBe("unknown")
  })

  it("says the traffic state is not reported rather than guessing one", () => {
    const segs = buildOpsReadout({
      loadBalancerCount: 0,
      igwCount: 0,
      nat,
      egress: null,
      awsServiceCounts: [],
      missingEndpoints: [],
      trafficAuthorityState: undefined,
    })
    expect(segs.find(s => s.key === "evidence")?.value).toBe("state not reported")
    expect(segs.find(s => s.key === "ingress")?.value).toBe("no IGW attached")
    expect(segs.find(s => s.key === "aws")?.value).toBe("none in payload")
  })
})
