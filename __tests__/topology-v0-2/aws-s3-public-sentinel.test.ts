import {
  AWS_S3_PUBLIC_SENTINEL_ID,
  ensureAwsS3PublicSentinel,
  formatEgressBreakdownBadge,
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
})
