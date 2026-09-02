/// <reference types="vitest/globals" />
/**
 * Intra-rail bundling — the pure pieces (C1 production QA, 2026-09-02: 22
 * TRIGGERS / TARGETS / ACTUAL_S3_ACCESS labels painted over rail chips because
 * Lambda → EventBridge / S3 edges ran straight through the off-VPC column).
 * The overlay bundles such edges per (source lane, target lane, label) and
 * routes the bundle through the flow corridor; the Chromium fixture spec
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
  const serverless = rect(1348, 263, 1572, 480)
  const regional = rect(1348, 500, 1572, 810)
  const corridor = rect(1300, 254, 1348, 870)

  it("leaves the source lane's left edge, runs the corridor, and enters the target lane's left edge", () => {
    const { pts, bus } = railBundleRoute(serverless, regional, corridor, 0, false)
    expect(pts).toEqual([
      { x: 1348, y: 371.5 },
      { x: 1310, y: 371.5 },
      { x: 1310, y: 655 },
      { x: 1348, y: 655 },
    ])
    expect(bus).toEqual({ x: 1310, y: 513.25 })
  })

  it("gives each bundle its own bus, 7px apart, and runs upward for the reverse direction", () => {
    expect(railBundleRoute(serverless, regional, corridor, 1, false).bus.x).toBe(1317)
    const up = railBundleRoute(regional, serverless, corridor, 2, false)
    expect(up.pts[0]).toEqual({ x: 1348, y: 655 })
    expect(up.pts[3]).toEqual({ x: 1348, y: 371.5 })
    expect(up.bus.x).toBe(1324)
  })

  it("sits just left of the lanes without a corridor, and loops out and back in for a same-lane bundle", () => {
    const loop = railBundleRoute(regional, regional, null, 0, true)
    expect(loop.pts[0]).toEqual({ x: 1348, y: regional.cy - 10 })
    expect(loop.pts[1].x).toBe(1348 - 24)
    expect(loop.pts[3]).toEqual({ x: 1348, y: regional.cy + 10 })
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
