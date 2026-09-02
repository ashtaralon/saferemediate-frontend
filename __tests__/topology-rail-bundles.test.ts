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
  busFanOffset,
  edgeBadgeLabel,
  railBundleLabel,
  railBundleLeadEdge,
  railBundleRoute,
  stackBundleBadges,
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
      { x: 1308, y: 371.5 },
      { x: 1308, y: 580 },
      { x: 1359, y: 580 },
    ])
    // The arrow ends on the chip, so the map names which service receives it.
    expect(pts[pts.length - 1]).toEqual({ x: bucketChip.l, y: bucketChip.cy })
    expect(bus).toEqual({ x: 1308, y: 475.75 })
  })

  it("gives each bundle its own bus, 7px apart, and runs upward for the reverse direction", () => {
    expect(railBundleRoute(serverlessLane, bucketChip, corridor, 1, 0, 2).bus.x).toBe(1315)
    const up = railBundleRoute(regionalLane, lambdaChip, corridor, 2, 0, 3)
    expect(up.pts[0]).toEqual({ x: 1348, y: 655 })
    expect(up.pts[3]).toEqual({ x: 1359, y: 320 })
    expect(up.bus.x).toBe(1322)
  })

  it("keeps every bus inside the 48px corridor at the eleven bundles C1 has", () => {
    // The fixed 7px march walked bundle 7 and beyond onto the rail column,
    // where their badges landed on the lane headers (C1, 2026-09-02).
    expect(1300 + 10 + 10 * 7).toBeGreaterThan(corridor.r)
    for (let i = 0; i < 11; i++) {
      const { bus, pts } = railBundleRoute(serverlessLane, bucketChip, corridor, i, 0, 11)
      expect(bus.x).toBeGreaterThanOrEqual(corridor.l)
      expect(bus.x).toBeLessThanOrEqual(corridor.r)
      expect(pts[3]).toEqual({ x: bucketChip.l, y: bucketChip.cy })
    }
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

describe("busFanOffset", () => {
  it("never marches a bus past the width it is given, however many bundles", () => {
    for (const total of [2, 5, 11, 40]) {
      for (let i = 0; i < total; i++) {
        expect(busFanOffset(i, total, 32)).toBeGreaterThanOrEqual(0)
        expect(busFanOffset(i, total, 32)).toBeLessThanOrEqual(32)
      }
    }
  })

  it("keeps the 7px pitch while it fits and tightens only when it must", () => {
    expect(busFanOffset(1, 2, 32)).toBe(7)
    expect(busFanOffset(10, 11, 32)).toBeCloseTo(32)
  })

  it("is flat for a single bundle", () => {
    expect(busFanOffset(0, 1, 32)).toBe(0)
  })
})

describe("stackBundleBadges", () => {
  it("aligns one right edge so no badge can reach past the leftmost bus", () => {
    const items = [
      { y: 500, hw: 30 },
      { y: 502, hw: 44 },
      { y: 503, hw: 26 },
    ]
    const laid = stackBundleBadges(items, 1300)
    expect(laid.map((l, i) => l.x + items[i].hw)).toEqual([1300, 1300, 1300])
  })

  it("holds a pitch the de-overlap pass's 13px conflict window cannot collapse", () => {
    const laid = stackBundleBadges(
      Array.from({ length: 11 }, () => ({ y: 500, hw: 30 })),
      1300,
    )
    const ys = laid.map(l => l.y).sort((a, b) => a - b)
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(16)
  })

  it("keeps bus order top to bottom", () => {
    const laid = stackBundleBadges([{ y: 900, hw: 20 }, { y: 100, hw: 20 }, { y: 500, hw: 20 }], 0)
    expect(laid[1].y).toBeLessThan(laid[2].y)
    expect(laid[2].y).toBeLessThan(laid[0].y)
  })

  it("lifts a stack that would run past the bottom bound", () => {
    const laid = stackBundleBadges(
      Array.from({ length: 5 }, () => ({ y: 800, hw: 20 })),
      1000,
      { maxY: 820 },
    )
    expect(Math.max(...laid.map(l => l.y))).toBeLessThanOrEqual(820)
    expect(Math.min(...laid.map(l => l.y))).toBe(820 - 4 * 16)
  })

  it("leaves a single badge on its own anchor", () => {
    expect(stackBundleBadges([{ y: 400, hw: 25 }], 900)).toEqual([{ x: 875, y: 400 }])
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
