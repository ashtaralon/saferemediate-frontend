import {
  AWS_S3_PUBLIC_SENTINEL_ID,
  AWS_API_PUBLIC_SENTINEL_ID,
  ensureAwsS3PublicSentinel,
  ensureAwsPublicServiceSentinels,
  formatEgressBreakdownBadge,
  formatEgressDestinationsTitle,
  formatEgressRouteLine,
} from "@/components/topology-v0-2/aws-frame"
import type { TopologyNode, TrafficEdge } from "@/components/topology-v0-2/types"

describe("ensureAwsS3PublicSentinel", () => {
  const base: TopologyNode[] = [
    {
      id: "arn:aws:s3:::demo",
      name: "demo",
      type: "S3Bucket",
      subnet_id: null,
      score: null,
      stale: null,
      is_jewel: false,
    },
  ]

  it("injects sentinel when an edge targets __aws_s3__", () => {
    const edges: TrafficEdge[] = [
      {
        source_id: "i-abc",
        target_id: AWS_S3_PUBLIC_SENTINEL_ID,
        port: null,
        protocol: "ACTUAL_TRAFFIC",
        last_seen: null,
        edge_class: "edge_service",
        egress_path: "public",
        via_igw: true,
      },
    ]
    const out = ensureAwsS3PublicSentinel(base, edges)
    expect(out.some(n => n.id === AWS_S3_PUBLIC_SENTINEL_ID)).toBe(true)
    expect(out.find(n => n.id === AWS_S3_PUBLIC_SENTINEL_ID)?.name).toMatch(/observed/i)
    expect(out.find(n => n.id === AWS_S3_PUBLIC_SENTINEL_ID)?.type).toBe("S3Bucket")
  })

  it("does not inject when no sentinel edge", () => {
    const edges: TrafficEdge[] = [
      {
        source_id: "i-abc",
        target_id: "__igw__",
        port: null,
        protocol: "ACTUAL_TRAFFIC",
        last_seen: null,
        edge_class: "egress",
        external_destinations: 10,
      },
    ]
    expect(ensureAwsS3PublicSentinel(base, edges)).toEqual(base)
  })

  it("is idempotent if sentinel already present", () => {
    const withSentinel = ensureAwsS3PublicSentinel(base, [
      {
        source_id: "i-1",
        target_id: AWS_S3_PUBLIC_SENTINEL_ID,
        port: null,
        protocol: "ACTUAL_TRAFFIC",
        last_seen: null,
      },
    ])
    const again = ensureAwsS3PublicSentinel(withSentinel, [
      {
        source_id: "i-1",
        target_id: AWS_S3_PUBLIC_SENTINEL_ID,
        port: null,
        protocol: "ACTUAL_TRAFFIC",
        last_seen: null,
      },
    ])
    expect(again.filter(n => n.id === AWS_S3_PUBLIC_SENTINEL_ID)).toHaveLength(1)
  })
})

describe("formatEgressBreakdownBadge", () => {
  it("shows kind rollup", () => {
    expect(
      formatEgressBreakdownBadge(400, [
        { kind: "ntp", count: 80 },
        { kind: "external", count: 320 },
      ]),
    ).toBe("egress · 400 (NTP 80 · ext 320)")
  })

  it("falls back to dest count", () => {
    expect(formatEgressBreakdownBadge(532, null)).toBe("egress · 532 dest")
  })

  it("names an unclassified peer as unclassified, never as ext", () => {
    expect(
      formatEgressBreakdownBadge(3, [
        { kind: "external", count: 2 },
        { kind: "unclassified", count: 1 },
      ]),
    ).toBe("egress · 3 (ext 2 · unclassified 1)")
  })
})

describe("formatEgressDestinationsTitle", () => {
  it("lists the sampled destinations under the badge and counts the rest", () => {
    const title = formatEgressDestinationsTitle(
      {
        external_destinations: 7,
        destinations: [
          { address: "52.95.1.11", kind: "external", port: 443, observation_count: 42 },
          { address: "129.6.15.28", kind: "ntp", port: 123, observation_count: 3 },
        ],
      },
      "egress · 7 (NTP 1 · ext 6)",
    )
    expect(title.split("\n")).toEqual([
      "egress · 7 (NTP 1 · ext 6)",
      "52.95.1.11 · external · :443 · 42 obs",
      "129.6.15.28 · ntp · :123 · 3 obs",
      "+5 more",
    ])
  })

  it("is just the badge when the backend sent no destinations", () => {
    expect(formatEgressDestinationsTitle({ destinations: null }, "egress")).toBe("egress")
    expect(formatEgressDestinationsTitle({ external_destinations: 4 }, "egress · 4 dest")).toBe("egress · 4 dest")
  })

  it("puts the route line between the badge and the destinations", () => {
    const title = formatEgressDestinationsTitle(
      {
        external_destinations: 1,
        destinations: [{ address: "52.95.1.11", kind: "external", port: 443, observation_count: 42 }],
        via_nat_id: "nat-0fd7",
        via_igw_id: "igw-01b6",
      },
      "egress · 1 · via NAT",
    )
    expect(title.split("\n")).toEqual([
      "egress · 1 · via NAT",
      "route · NAT nat-0fd7 → IGW igw-01b6",
      "52.95.1.11 · external · :443 · 42 obs",
    ])
  })
})

describe("formatEgressRouteLine", () => {
  it("names the hops the backend established, in order", () => {
    expect(formatEgressRouteLine({
      egress_hops: [{ kind: "nat", id: "nat-1" }, { kind: "igw", id: "igw-1" }],
    })).toBe("route · NAT nat-1 → IGW igw-1")
    expect(formatEgressRouteLine({ via_vpce_id: "vpce-9" })).toBe("route · VPCE vpce-9")
    expect(formatEgressRouteLine({ via_nat_id: "nat-1" })).toBe("route · NAT nat-1 → IGW (primary)")
  })

  it("says unresolved when the backend looked and could not pin a route, and nothing when it made no claim", () => {
    expect(formatEgressRouteLine({ structural_route: "AMBIGUOUS" })).toBe("route · unresolved (AMBIGUOUS)")
    expect(formatEgressRouteLine({ structural_route: "NO_VPC_CONTEXT" })).toBe("route · unresolved (NO_VPC_CONTEXT)")
    expect(formatEgressRouteLine({})).toBeNull()
    expect(formatEgressRouteLine({ structural_route: null })).toBeNull()
  })
})

describe("ensureAwsPublicServiceSentinels", () => {
  const base: TopologyNode[] = []

  it("injects API sentinel for __aws_api__ edges", () => {
    const edges: TrafficEdge[] = [
      {
        source_id: "i-abc",
        target_id: AWS_API_PUBLIC_SENTINEL_ID,
        port: null,
        protocol: "ACTUAL_TRAFFIC",
        last_seen: null,
        edge_class: "edge_service",
        egress_path: "public",
        via_igw: true,
      },
    ]
    const out = ensureAwsPublicServiceSentinels(base, edges)
    expect(out.some(n => n.id === AWS_API_PUBLIC_SENTINEL_ID)).toBe(true)
  })
})
