/// <reference types="vitest/globals" />
/**
 * Intra-rail bundling — the pure pieces (C1 production QA, 2026-09-02: 22
 * TRIGGERS / TARGETS / ACTUAL_S3_ACCESS labels painted over rail chips because
 * Lambda → EventBridge / S3 edges ran straight through the off-VPC column).
 * The overlay bundles such edges per (source lane, TARGET CHIP, label) and
 * routes the bundle through the flow corridor into the chip, so the arrow
 * names the service that receives the traffic; the Chromium fixture spec
 * proves the geometry, this pins the helpers.
 */
import { describe, expect, it } from "vitest"

import {
  edgeBadgeLabel,
  railBundleLabel,
  railBundleLeadEdge,
  railBundleRoute,
} from "@/components/topology-v0-2/aws-frame"
import type { TrafficEdge } from "@/components/topology-v0-2/types"

const rect = (l: number, t: number, r: number, b: number) => ({ l, t, r, b, cx: (l + r) / 2, cy: (t + b) / 2 })

describe("railBundleRoute", () => {
  const serverlessLane = rect(1348, 263, 1572, 480)
  const regionalLane = rect(1348, 500, 1572, 810)
  // One chip per row, so a chip's left edge is the lane's left edge plus the
  // lane padding: an inbound edge reaches it without crossing a neighbour.
  const bucketChip = rect(1359, 560, 1563, 600)
  const lambdaChip = rect(1359, 300, 1563, 340)
  const corridor = rect(1300, 254, 1348, 870)

  it("leaves the source lane, runs the corridor, and enters the TARGET CHIP's left edge", () => {
    const { pts, bus } = railBundleRoute(serverlessLane, bucketChip, corridor, 0)
    expect(pts).toEqual([
      { x: 1348, y: 371.5 },
      { x: 1310, y: 371.5 },
      { x: 1310, y: 580 },
      { x: 1359, y: 580 },
    ])
    // The arrow ends on the chip, so the map names which service receives it.
    expect(pts[pts.length - 1]).toEqual({ x: bucketChip.l, y: bucketChip.cy })
    expect(bus).toEqual({ x: 1310, y: 475.75 })
  })

  it("gives each bundle its own bus, 7px apart, and runs upward for the reverse direction", () => {
    expect(railBundleRoute(serverlessLane, bucketChip, corridor, 1).bus.x).toBe(1317)
    const up = railBundleRoute(regionalLane, lambdaChip, corridor, 2)
    expect(up.pts[0]).toEqual({ x: 1348, y: 655 })
    expect(up.pts[3]).toEqual({ x: 1359, y: 320 })
    expect(up.bus.x).toBe(1324)
  })

  it("fans departures across the source lane and never leaves it", () => {
    const low = railBundleRoute(serverlessLane, bucketChip, corridor, 0, -40)
    const high = railBundleRoute(serverlessLane, bucketChip, corridor, 0, 40)
    expect(low.pts[0].y).toBeLessThan(high.pts[0].y)
    for (const route of [low, high, railBundleRoute(serverlessLane, bucketChip, corridor, 0, -9999)]) {
      expect(route.pts[0].y).toBeGreaterThanOrEqual(serverlessLane.t)
      expect(route.pts[0].y).toBeLessThanOrEqual(serverlessLane.b)
    }
  })

  it("sits just left of the lane when the frame has no corridor element", () => {
    const noCorridor = railBundleRoute(regionalLane, lambdaChip, null, 0)
    expect(noCorridor.pts[1].x).toBe(Math.min(regionalLane.l, lambdaChip.l) - 24)
    expect(noCorridor.pts[3]).toEqual({ x: lambdaChip.l, y: lambdaChip.cy })
  })
})

describe("railBundleLabel", () => {
  it("carries the real count and stays bare for a single edge", () => {
    expect(railBundleLabel("TRIGGERS", 6)).toBe("TRIGGERS ×6")
    expect(railBundleLabel("ACTUAL_S3_ACCESS", 1)).toBe("ACTUAL_S3_ACCESS")
  })
})

function edge(p: Partial<TrafficEdge>): TrafficEdge {
  return { source_id: "fn-a", target_id: "rule-1", ...p }
}

describe("railBundleLeadEdge", () => {
  it("prefers an authoritative observation, then a historical one, then the first member", () => {
    const legacy = edge({ authority_state: "legacy_unverified", last_seen: "2026-06-25T08:58:13Z" })
    const authoritative = edge({
      source_id: "fn-b",
      evidence_type: "observed",
      authority_state: "authoritative",
      path_basis: "observed_segment",
    })
    const configured = edge({ source_id: "fn-c", evidence_type: "configured" })
    expect(railBundleLeadEdge([legacy, authoritative, configured])).toBe(authoritative)
    expect(railBundleLeadEdge([configured, legacy])).toBe(legacy)
    expect(railBundleLeadEdge([configured])).toBe(configured)
  })
})

describe("edgeBadgeLabel", () => {
  it("names relationship edges by their protocol and abbreviates the known ones", () => {
    expect(edgeBadgeLabel(edge({ protocol: "TRIGGERS" }), "internal", false, false)).toBe("TRIGGERS")
    expect(edgeBadgeLabel(edge({ protocol: "TARGETS" }), "internal", false, false)).toBe("TARGETS")
    expect(edgeBadgeLabel(edge({ protocol: "HAS_TARGET_GROUP" }), "internal", false, false)).toBe("TG")
    expect(edgeBadgeLabel(edge({ protocol: "ENCRYPTED_BY" }), "internal", false, false)).toBe("KMS")
  })

  it("keeps the edge-service protocol when nothing routes via a VPCE or the IGW", () => {
    expect(edgeBadgeLabel(edge({ protocol: "ACTUAL_S3_ACCESS" }), "edge_service", false, false)).toBe("ACTUAL_S3_ACCESS")
    expect(edgeBadgeLabel(edge({ protocol: "ACTUAL_S3_ACCESS", via_vpce_service_name: "com.amazonaws.eu-west-1.s3" }), "edge_service", true, false)).toBe(
      "S3 access · via VPCE",
    )
  })

  it("labels database and plain TCP edges by port", () => {
    expect(edgeBadgeLabel(edge({ port: 3306 }), "database", false, false)).toBe("RDS · 3306")
    expect(edgeBadgeLabel(edge({ port: 443, protocol: "TCP" }), "internal", false, false)).toBe("443/TCP")
  })
})
