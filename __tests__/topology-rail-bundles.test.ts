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
  RAIL_FEEDER_BADGE_INSET,
  RAIL_LANE_CORRIDOR_W_PX,
  RAIL_LANE_W_PX,
  badgeHalfWidth,
  boundaryIgwCaption,
  boundaryVpceCaption,
  busCenteredBadgeX,
  busFanOffset,
  busSideBadgeX,
  collapseRailBundleBadges,
  edgeBadgeLabel,
  railBundleLabel,
  railBundleLeadEdge,
  railBundleRoute,
  railFeederLabel,
  railFeederRoute,
  railInboundCaption,
  railTrunkRoute,
  stackBundleBadges,
  trunkBusX,
} from "@/components/topology-v0-2/aws-frame"
import type { RailBundleBadgeInput } from "@/components/topology-v0-2/aws-frame"
import { ALL_ACCESS_EDGE_TYPES } from "@/components/topology-v0-2/estate-flow-edges"
import type { TrafficEdge } from "@/components/topology-v0-2/types"

const rect = (l: number, t: number, r: number, b: number) => ({ l, t, r, b, cx: (l + r) / 2, cy: (t + b) / 2 })

describe("railBundleRoute", () => {
  // The lanes sit SIDE BY SIDE at the right end of the region, as measured in
  // Chromium at 1800×1000: gutter 48 | Lambda lane 200 | corridor 112 |
  // Regional lane 200, the rail column's right edge at 1772. Two corridors are
  // therefore available to a bundle, and which one it takes is the whole
  // question below. Built from the exported widths, so changing one of them
  // fails the exact geometry below rather than quietly moving the map.
  const RAIL_R = 1772
  const regionalLane = rect(RAIL_R - RAIL_LANE_W_PX, 254, RAIL_R, 911)
  const interlane = rect(regionalLane.l - RAIL_LANE_CORRIDOR_W_PX, 254, regionalLane.l, 911)
  const serverlessLane = rect(interlane.l - RAIL_LANE_W_PX, 254, interlane.l, 911)
  const leftGutter = rect(serverlessLane.l - 60, 254, serverlessLane.l - 12, 911)
  const corridors = [leftGutter, interlane]
  // One chip per row, so a chip's left edge is the lane's left edge plus the
  // lane padding: an inbound edge reaches it without crossing a neighbour.
  const bucketChip = rect(regionalLane.l + 8, 700, regionalLane.r - 8, 740)
  const lambdaChip = rect(serverlessLane.l + 8, 300, serverlessLane.r - 8, 340)

  it("leaves the source lane, runs the corridor between them, and enters the TARGET CHIP", () => {
    const { pts, bus, label, corridor } = railBundleRoute(serverlessLane, bucketChip, corridors, 0)
    expect(pts).toEqual([
      { x: 1460, y: 582.5 },
      { x: 1468, y: 582.5 },
      { x: 1468, y: 720 },
      { x: 1580, y: 720 },
    ])
    // The arrow ends on the chip, so the map names which service receives it.
    expect(pts[pts.length - 1]).toEqual({ x: bucketChip.l, y: bucketChip.cy })
    expect(bus).toEqual({ x: 1468, y: 651.25 })
    // The corridor the bus actually runs in comes back with it, so the caller
    // can ask whether the label fits there before falling back to the gutter.
    expect(corridor).toBe(interlane)
    expect(busSideBadgeX(bus.x, corridor, badgeHalfWidth("S3 access"))).toBeCloseTo(1506.2)
    // The gutter anchor stays available for labels too wide for the gap.
    expect(label).toEqual({ x: leftGutter.l + 8, y: 651.25 })
  })

  it("crosses the corridor BETWEEN the lanes instead of back over the lane it left", () => {
    // Measured 2026-09-10 on the captured alon-prod payload: with the lanes
    // side by side, sending every bundle out to the LEFTMOST corridor — right
    // while they were stacked in one column — drew the S3-access bundle back
    // across the lane it had just left, over the ConfidenceScorer chip.
    const route = railBundleRoute(serverlessLane, bucketChip, corridors, 0, 0, 1)
    for (const p of route.pts) {
      expect(p.x).toBeGreaterThanOrEqual(serverlessLane.r)
      expect(p.x).toBeLessThanOrEqual(bucketChip.l)
    }
    expect(route.pts[1].x).toBeGreaterThan(interlane.l)
    expect(route.pts[1].x).toBeLessThan(interlane.r)
  })

  it("routes a same-lane bundle through the nearest corridor on its left", () => {
    const ruleChip = rect(1580, 300, 1764, 340)
    const route = railBundleRoute(regionalLane, ruleChip, corridors, 0, 0, 1)
    // No corridor lies BETWEEN two ends in the same lane; the nearest one on
    // the left is the inter-lane corridor, which keeps the hop clear of the
    // serverless lane entirely instead of crossing it to reach the gutter.
    for (const p of route.pts) expect(p.x).toBeGreaterThanOrEqual(interlane.l)
    expect(route.pts[1].x).toBeLessThan(interlane.r)
  })

  it("gives each bundle its own bus, 7px apart, and runs leftward for the reverse direction", () => {
    expect(railBundleRoute(serverlessLane, bucketChip, corridors, 1, 0, 2).bus.x).toBe(1475)
    const back = railBundleRoute(regionalLane, lambdaChip, corridors, 2, 0, 3)
    // Out of the regional lane's LEFT edge and into the Lambda chip's RIGHT
    // edge — the sides facing the corridor the bundle actually uses.
    expect(back.pts[0]).toEqual({ x: 1572, y: 582.5 })
    expect(back.pts[3]).toEqual({ x: 1452, y: 320 })
    expect(back.bus.x).toBe(1482)
  })

  it("keeps every bus inside the corridor however many bundles share it", () => {
    // The fixed 7px march walked bundle 7 and beyond clean out of the 40px
    // corridor this one replaced, and onto the rail column, where their badges
    // landed on the lane headers (C1, 2026-09-02). The corridor is now wide
    // enough that the full pitch fits the eleven bundles C1 has — the cap only
    // engages past fourteen, and still has to hold.
    expect(interlane.l + 8 + 10 * 7).toBeLessThanOrEqual(interlane.r)
    for (const total of [11, 15, 40]) {
      for (let i = 0; i < total; i++) {
        const { bus, pts } = railBundleRoute(serverlessLane, bucketChip, corridors, i, 0, total)
        expect(bus.x).toBeGreaterThanOrEqual(interlane.l)
        expect(bus.x).toBeLessThanOrEqual(interlane.r)
        expect(pts[3]).toEqual({ x: bucketChip.l, y: bucketChip.cy })
      }
    }
    expect(railBundleRoute(serverlessLane, bucketChip, corridors, 10, 0, 11).bus.x).toBe(1468 + 70)
  })

  it("fans departures across the source lane and never leaves it", () => {
    const low = railBundleRoute(serverlessLane, bucketChip, corridors, 0, -40)
    const high = railBundleRoute(serverlessLane, bucketChip, corridors, 0, 40)
    expect(low.pts[0].y).toBeLessThan(high.pts[0].y)
    for (const route of [low, high, railBundleRoute(serverlessLane, bucketChip, corridors, 0, -9999)]) {
      expect(route.pts[0].y).toBeGreaterThanOrEqual(serverlessLane.t)
      expect(route.pts[0].y).toBeLessThanOrEqual(serverlessLane.b)
    }
  })

  it("sits just left of the lane when the frame has no corridor element", () => {
    const noCorridor = railBundleRoute(regionalLane, lambdaChip, [], 0)
    expect(noCorridor.pts[1].x).toBe(Math.min(regionalLane.l, lambdaChip.l) - 24)
    expect(noCorridor.pts[3]).toEqual({ x: lambdaChip.l, y: lambdaChip.cy })
    expect(noCorridor.label.x).toBe(noCorridor.pts[1].x)
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

describe("busSideBadgeX", () => {
  // The gap between the two lanes, at the width the frame renders it.
  const corridor = { l: 1460, r: 1460 + RAIL_LANE_CORRIDOR_W_PX }
  const bus = corridor.l + 8

  it("puts the label beside its own bus, not centred on it", () => {
    // Centred, a 68px box on a bus 8px into the corridor hangs out of the
    // corridor's left edge and over the chips of the lane it left.
    const hw = badgeHalfWidth("S3 access")
    const x = busSideBadgeX(bus, corridor, hw)
    expect(x).not.toBeNull()
    expect(x! - hw).toBeGreaterThan(bus)
    expect(x! + hw).toBeLessThan(corridor.r)
  })

  it("refuses a label too wide for the gap so the caller falls back to the gutter", () => {
    expect(busSideBadgeX(bus, corridor, badgeHalfWidth("ACTUAL_S3_ACCESS ×12"))).toBeNull()
    // A bus far down the fan leaves less room than the first one does.
    expect(busSideBadgeX(corridor.r - 20, corridor, badgeHalfWidth("S3 access"))).toBeNull()
  })

  it("has nowhere to put it when the frame renders no corridor", () => {
    expect(busSideBadgeX(bus, null, 20)).toBeNull()
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
    expect(railBundleLabel("S3 access", 1)).toBe("S3 access")
  })
})

describe("collapseRailBundleBadges", () => {
  const bundle = (p: Partial<RailBundleBadgeInput>): RailBundleBadgeInput => ({
    srcKey: "lane:serverless",
    dstLaneKey: "lane:regional",
    label: "TRIGGERS",
    members: ["fn-a→rule-1"],
    count: 1,
    ...p,
  })

  // The C1 shape that forced this, verbatim: six EventBridge rules firing six
  // Lambdas 1:1 across one lane pair, and every pair carries BOTH edge types —
  // so the per-chip bundler produced twelve bundles and painted twelve badges,
  // TARGETS / TRIGGERS alternating down the gutter column (2026-09-11).
  const c1RuleFanout: RailBundleBadgeInput[] = [
    "daily",
    "every_6h",
    "frequent",
    "monthly",
    "nightly_burst",
    "weekly",
  ].flatMap(rule =>
    ["TARGETS", "TRIGGERS"].map(label =>
      bundle({
        srcKey: "lane:triggers",
        dstLaneKey: "lane:serverless",
        label,
        members: [`rule-${rule}→fn-${rule}`],
      }),
    ),
  )

  it("the C1 rule fan-out: twelve identical-word bundles become two badges", () => {
    const collapse = collapseRailBundleBadges(c1RuleFanout)
    // Every bundle is accounted for — nothing is left to print its own word by
    // being absent from the map.
    expect(collapse.size).toBe(12)
    const owners = [...collapse.entries()].filter(([, v]) => v !== null)
    expect(owners).toHaveLength(2)
    for (const [, carried] of owners) {
      expect(carried!.count).toBe(6)
      // The title has to list every pair the count claims, or the chip says ×6
      // over a tooltip naming one edge.
      expect(carried!.members).toHaveLength(6)
      expect(new Set(carried!.members).size).toBe(6)
    }
    // What the two chips actually read, which is the point of the whole change.
    expect(owners.map(([i, v]) => railBundleLabel(c1RuleFanout[i].label, v!.count)).sort()).toEqual([
      "TARGETS ×6",
      "TRIGGERS ×6",
    ])
    // TARGETS and TRIGGERS are different words, so they collapse separately:
    // merging them would be the renderer asserting two graph edge types mean
    // the same thing. Interleaved input, so the two owners are the middles of
    // their own fans — 6 and 7 — not 0 and 1.
    expect([...collapse.keys()].filter(k => collapse.get(k) !== null).sort((a, b) => a - b)).toEqual([
      6, 7,
    ])
  })

  it("leaves a fan-IN alone: one bundle on its lane pair keeps its own count", () => {
    // Four Lambdas writing one bucket already bundled per chip into a single
    // `S3 access ×4` — the case the per-chip grouping gets right, and the case
    // the captured browser fixture holds (measured 2026-09-11: one rail bundle,
    // one label). Absent from the map, so the caller's own count stands.
    const collapse = collapseRailBundleBadges([
      bundle({ label: "S3 access", count: 4, members: ["a→b", "c→b", "d→b", "e→b"] }),
    ])
    expect(collapse.size).toBe(0)
    expect(collapse.has(0)).toBe(false)
  })

  it("keys on the LANE pair, not the receiving chip, and not across source lanes", () => {
    // Same word, same two lanes, different receiving chips → one badge. This is
    // the whole change: per-chip keying is what produced twelve.
    const sameLanes = collapseRailBundleBadges([
      bundle({ members: ["fn-a→rule-1"] }),
      bundle({ members: ["fn-b→rule-2"] }),
    ])
    expect([...sameLanes.values()].filter(v => v !== null)).toHaveLength(1)
    // Same word, different source lane → two badges. A Lambda→Regional flow and
    // a triggers→Lambda flow cross different corridors; one word cannot speak
    // for both.
    const differentSource = collapseRailBundleBadges([
      bundle({ srcKey: "lane:serverless" }),
      bundle({ srcKey: "lane:triggers" }),
    ])
    expect(differentSource.size).toBe(0)
  })

  it("sums the aggregated counts, not the number of bundles", () => {
    // A bundle may already stand for several edges, so the collapsed count is a
    // sum of counts. Counting bundles would print ×2 over five real edges.
    const collapse = collapseRailBundleBadges([
      bundle({ count: 2, members: ["a→x", "b→x"] }),
      bundle({ count: 3, members: ["c→y", "d→y", "e→y"] }),
    ])
    const carried = [...collapse.values()].find(v => v !== null)
    expect(carried).toEqual({ count: 5, members: ["a→x", "b→x", "c→y", "d→y", "e→y"] })
  })

  it("picks the middle bundle by bus order as the one that speaks", () => {
    // Bus order is input order, and the badge should sit inside its own fan
    // rather than at the top or bottom edge of it.
    const three = collapseRailBundleBadges([bundle({}), bundle({}), bundle({})])
    expect([...three.entries()].map(([i, v]) => [i, v === null ? null : v.count])).toEqual([
      [0, null],
      [1, 3],
      [2, null],
    ])
    const four = collapseRailBundleBadges([bundle({}), bundle({}), bundle({}), bundle({})])
    expect([...four.keys()].filter(i => four.get(i) !== null)).toEqual([2])
  })

  it("no bundles at all is an empty map, not a throw", () => {
    expect(collapseRailBundleBadges([]).size).toBe(0)
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
  it("names relationship edges in words, and leaves the ones already English alone", () => {
    // No underscore, reads as English: not worth translating.
    expect(edgeBadgeLabel(edge({ protocol: "TRIGGERS" }), "internal", false, false)).toBe("TRIGGERS")
    expect(edgeBadgeLabel(edge({ protocol: "TARGETS" }), "internal", false, false)).toBe("TARGETS")
    expect(edgeBadgeLabel(edge({ protocol: "HAS_TARGET_GROUP" }), "internal", false, false)).toBe("TG")
    expect(edgeBadgeLabel(edge({ protocol: "ENCRYPTED_BY" }), "internal", false, false)).toBe("KMS")
    // A declared policy grant to any resource — "secret" named a target type
    // the edge does not carry.
    expect(edgeBadgeLabel(edge({ protocol: "ACCESSES_RESOURCE" }), "internal", false, false)).toBe("accesses")
    expect(edgeBadgeLabel(edge({ protocol: "QUERIES_DB" }), "internal", false, false)).toBe("DB query")
  })

  it("says what an unrouted edge-service access IS, not which graph edge carried it", () => {
    // The badge read ACTUAL_S3_ACCESS on the map (2026-09-10). A graph
    // identifier is not product copy.
    expect(edgeBadgeLabel(edge({ protocol: "ACTUAL_S3_ACCESS" }), "edge_service", false, false)).toBe("S3 access")
    expect(edgeBadgeLabel(edge({ protocol: "ACTUAL_S3_ACCESS", via_vpce_service_name: "com.amazonaws.eu-west-1.s3" }), "edge_service", true, false)).toBe(
      "S3 access · via VPCE",
    )
  })

  it("labels database and plain TCP edges by port", () => {
    expect(edgeBadgeLabel(edge({ port: 3306 }), "database", false, false)).toBe("RDS · 3306")
    expect(edgeBadgeLabel(edge({ port: 443, protocol: "TCP" }), "internal", false, false)).toBe("443/TCP")
  })

  it("never prints an underscored graph identifier for an edge type that can reach the map", () => {
    // The list the estate map itself filters on, so a new observed edge type
    // cannot arrive without words. Both classes: edge_service takes the
    // fall-through inside its own branch, internal takes the tail.
    for (const type of ALL_ACCESS_EDGE_TYPES) {
      for (const cls of ["edge_service", "internal"] as const) {
        expect(edgeBadgeLabel(edge({ protocol: type }), cls, false, false), `${type} as ${cls}`).not.toContain("_")
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Trunks and feeders (Alon, 2026-09-11). The same lane geometry as above.
// ---------------------------------------------------------------------------
const RAIL_R2 = 1772
const regionalLane2 = rect(RAIL_R2 - RAIL_LANE_W_PX, 254, RAIL_R2, 911)
const interlane2 = rect(regionalLane2.l - RAIL_LANE_CORRIDOR_W_PX, 254, regionalLane2.l, 911)
const serverlessLane2 = rect(interlane2.l - RAIL_LANE_W_PX, 254, interlane2.l, 911)
const leftGutter2 = rect(serverlessLane2.l - 60, 254, serverlessLane2.l - 12, 911)
const corridors2 = [leftGutter2, interlane2]
const bucketChip2 = rect(regionalLane2.l + 8, 700, regionalLane2.r - 8, 740)
const lambdaChip2 = rect(serverlessLane2.l + 8, 300, serverlessLane2.r - 8, 340)

describe("railBundleRoute with a feeder inset", () => {
  it("moves the bus into the corridor by the inset and keeps the whole fan inside it", () => {
    const first = railBundleRoute(serverlessLane2, bucketChip2, corridors2, 0, 0, 1, RAIL_FEEDER_BADGE_INSET)
    expect(first.bus.x).toBe(interlane2.l + 8 + RAIL_FEEDER_BADGE_INSET)
    for (const total of [2, 11, 40]) {
      for (let i = 0; i < total; i++) {
        const { bus } = railBundleRoute(serverlessLane2, bucketChip2, corridors2, i, 0, total, RAIL_FEEDER_BADGE_INSET)
        expect(bus.x).toBeGreaterThanOrEqual(interlane2.l + 8 + RAIL_FEEDER_BADGE_INSET)
        expect(bus.x).toBeLessThanOrEqual(interlane2.r - 8)
      }
    }
  })

  it("is the classic bus when no inset is asked for", () => {
    expect(railBundleRoute(serverlessLane2, bucketChip2, corridors2, 0).bus.x).toBe(interlane2.l + 8)
  })
})

describe("busCenteredBadgeX", () => {
  const corridor = { l: interlane2.l, r: interlane2.r }
  const feederBus = corridor.l + 8 + RAIL_FEEDER_BADGE_INSET

  it("lays a label the corridor can hold ON its bus, kept inside the corridor", () => {
    const hw = badgeHalfWidth("S3 access ×4")
    // Beside the bus there is no room once the bus sits 42px in — which is why
    // the centred placement exists.
    expect(busSideBadgeX(feederBus, corridor, hw)).toBeNull()
    const x = busCenteredBadgeX(feederBus, corridor, hw)
    expect(x).not.toBeNull()
    expect(x! - hw).toBeGreaterThanOrEqual(corridor.l + 2)
    expect(x! + hw).toBeLessThanOrEqual(corridor.r - 2)
    // Only slid as far off the bus as the corridor's edge forces.
    expect(Math.abs(x! - feederBus)).toBeLessThan(hw)
  })

  it("refuses a label wider than the corridor, so the caller falls back to the gutter column", () => {
    expect(busCenteredBadgeX(feederBus, corridor, badgeHalfWidth("ACTUAL_S3_ACCESS ×12 · via VPCE"))).toBeNull()
  })

  it("has nowhere to put it without a corridor", () => {
    expect(busCenteredBadgeX(feederBus, null, 20)).toBeNull()
  })

  it("decides where a trunk's word goes: on its bus in the inter-lane gap, the gutter column beside a 48px gutter", () => {
    // The Lambda lane's trunk runs the 48px gutter, which cannot hold
    // "TRIGGERS ×6" — the word stays in the column left of the bus.
    const gutterBus = trunkBusX(serverlessLane2, corridors2)
    expect(busCenteredBadgeX(gutterBus, { l: leftGutter2.l, r: leftGutter2.r }, badgeHalfWidth("TRIGGERS ×6"))).toBeNull()
    // The Regional lane's trunk runs the 112px gap, which holds "KMS ×3" — the
    // word sits on the line it names. It used to join the gutter column with
    // the Lambda lane's words, ~250px from its trunk (C1, 2026-09-11).
    const gapBus = trunkBusX(regionalLane2, corridors2)
    const hw = badgeHalfWidth("KMS ×3")
    const x = busCenteredBadgeX(gapBus, { l: interlane2.l, r: interlane2.r }, hw)
    expect(x).not.toBeNull()
    expect(Math.abs(x! - gapBus)).toBeLessThanOrEqual(hw + 2)
    expect(x! + hw).toBeLessThanOrEqual(interlane2.r - 2)
  })
})

describe("trunkBusX", () => {
  it("runs in the nearest corridor LEFT of the lane, 12px in from its right edge", () => {
    expect(trunkBusX(serverlessLane2, corridors2)).toBe(leftGutter2.r - 12)
    // The inter-lane corridor lies left of the Regional lane, so that lane's
    // trunk runs there — never the gutter across the Lambda lane.
    expect(trunkBusX(regionalLane2, corridors2)).toBe(interlane2.r - 12)
  })

  it("sits just left of the lane when the frame renders no corridor", () => {
    expect(trunkBusX(serverlessLane2, [])).toBe(serverlessLane2.l - 14)
  })

  it("stays inside a corridor too narrow for the 12px inset", () => {
    expect(trunkBusX({ l: 100 }, [rect(96, 0, 99, 10)])).toBe(100)
  })
})

describe("railTrunkRoute", () => {
  // The C1 shape: the triggers band at the top of the Lambda lane and six
  // functions under it, one per RAIL_LANE_ROW_PX row.
  const band = rect(serverlessLane2.l + 8, 300, serverlessLane2.r - 8, 420)
  const fns = Array.from({ length: 6 }, (_, i) => ({
    id: `fn-${i}`,
    rect: rect(serverlessLane2.l + 8, 440 + i * 40, serverlessLane2.r - 8, 470 + i * 40),
  }))
  const busX = trunkBusX(serverlessLane2, corridors2)

  it("leaves the band ONCE, runs the gutter to the farthest function, and stubs into each", () => {
    const route = railTrunkRoute(band, fns, busX)
    expect(route.exit).toEqual({ x: band.l, y: band.cy })
    expect(route.trunk).toEqual([[route.exit, { x: busX, y: band.cy }, { x: busX, y: fns[5].rect.cy }]])
    expect(route.stubs).toHaveLength(6)
    route.stubs.forEach((stub, i) => {
      expect(stub.targetId).toBe(fns[i].id)
      // Bus → the chip's left edge: the arrowhead names the function.
      expect(stub.pts).toEqual([{ x: busX, y: fns[i].rect.cy }, { x: fns[i].rect.l, y: fns[i].rect.cy }])
    })
    // Nothing but the stubs' last points enters the lane: the trunk runs the
    // gutter, so no line crosses a chip on its way to another. Six rules used to
    // be twelve curves across this gutter.
    for (const pt of route.trunk.flat()) expect(pt.x).toBeLessThanOrEqual(band.l)
  })

  it("adds a second run upward when chips lie on both sides of the exit", () => {
    const above = { id: "fn-up", rect: rect(serverlessLane2.l + 8, 260, serverlessLane2.r - 8, 290) }
    const route = railTrunkRoute(band, [above, fns[0]], busX)
    expect(route.trunk).toHaveLength(2)
    expect(route.trunk[0][2].y).toBe(fns[0].rect.cy)
    expect(route.trunk[1][2].y).toBe(above.rect.cy)
  })

  it("a source with nothing to feed is an exit and no run — not a throw", () => {
    const route = railTrunkRoute(band, [], busX)
    expect(route.trunk).toEqual([[route.exit, { x: busX, y: band.cy }]])
    expect(route.stubs).toEqual([])
  })

  it("leaves on the side facing the bus", () => {
    const rightBus = railTrunkRoute(band, fns, band.r + 30)
    expect(rightBus.exit.x).toBe(band.r)
    expect(rightBus.stubs[0].pts[1].x).toBe(fns[0].rect.r)
  })
})

describe("railFeederRoute", () => {
  const busX = interlane2.l + 8 + RAIL_FEEDER_BADGE_INSET
  const lambdas = [300, 340, 380, 420].map((t, i) => ({
    sourceId: `fn-${i}`,
    rect: rect(serverlessLane2.l + 8, t, serverlessLane2.r - 8, t + 30),
  }))

  it("every member leaves its OWN chip on a leg to the bus; the trunk carries the one arrow into the target", () => {
    const route = railFeederRoute(lambdas, bucketChip2, busX)
    expect(route.feeders.map(f => f.pts)).toEqual(
      lambdas.map(m => [{ x: m.rect.r, y: m.rect.cy }, { x: busX, y: m.rect.cy }]),
    )
    expect(route.feeders.map(f => f.sourceId)).toEqual(["fn-0", "fn-1", "fn-2", "fn-3"])
    expect(route.enter).toEqual({ x: bucketChip2.l, y: bucketChip2.cy })
    // From the member farthest from the bucket, down the bus, into the bucket.
    expect(route.trunk).toEqual([[{ x: busX, y: lambdas[0].rect.cy }, { x: busX, y: bucketChip2.cy }, route.enter]])
    // Each leg is long enough to carry its "API" badge clear of both the chip and the bus.
    for (const leg of route.feeders) {
      expect(leg.pts[1].x - leg.pts[0].x).toBeGreaterThanOrEqual(badgeHalfWidth("API") * 2 + 10)
    }
  })

  it("runs leftward into a target on the left", () => {
    const back = railFeederRoute([{ sourceId: "rule", rect: bucketChip2 }], lambdaChip2, busX)
    expect(back.feeders[0].pts[0]).toEqual({ x: bucketChip2.l, y: bucketChip2.cy })
    expect(back.enter).toEqual({ x: lambdaChip2.r, y: lambdaChip2.cy })
  })

  it("adds a second run when members sit on both sides of the target", () => {
    const route = railFeederRoute(
      [
        { sourceId: "up", rect: rect(serverlessLane2.l + 8, 285, serverlessLane2.r - 8, 315) },
        { sourceId: "down", rect: rect(serverlessLane2.l + 8, 885, serverlessLane2.r - 8, 915) },
      ],
      bucketChip2,
      busX,
    )
    expect(route.trunk).toEqual([
      [{ x: busX, y: 300 }, { x: busX, y: bucketChip2.cy }, route.enter],
      [{ x: busX, y: bucketChip2.cy }, { x: busX, y: 900 }],
    ])
  })
})

describe("railFeederLabel", () => {
  it("names the access PLANE a leg leaves on, and nothing for a plain network edge", () => {
    expect(railFeederLabel("edge_service")).toBe("API")
    expect(railFeederLabel("vpce")).toBe("API")
    expect(railFeederLabel("database")).toBe("DB")
    expect(railFeederLabel("internal")).toBeNull()
    expect(railFeederLabel("egress")).toBeNull()
  })
})

describe("railInboundCaption", () => {
  const s3 = (source_id: string, extra: Partial<TrafficEdge> = {}): TrafficEdge =>
    edge({ source_id, target_id: "bucket", protocol: "ACTUAL_S3_ACCESS", edge_class: "edge_service", ...extra })
  const isFn = (id: string) => id.startsWith("fn-")

  it("counts distinct FUNCTIONS, not edges, and names the plane", () => {
    const edges = [s3("fn-a"), s3("fn-b"), s3("fn-c"), s3("fn-d"), s3("fn-a", { protocol: "WRITES_TO" })]
    expect(railInboundCaption("bucket", edges, isFn)).toBe("4 fn · service-plane access")
  })

  it("keeps sources that are not functions apart", () => {
    const edges = [s3("fn-a"), s3("fn-b"), s3("i-0ee29afa0048943e0")]
    expect(railInboundCaption("bucket", edges, isFn)).toBe("2 fn · 1 other · service-plane access")
  })

  it("is null when nothing reaches the chip — never '0 fn'", () => {
    expect(railInboundCaption("bucket", [s3("fn-a", { target_id: "elsewhere" })], isFn)).toBeNull()
    expect(railInboundCaption("bucket", [], isFn)).toBeNull()
  })

  it("does not call a mixed plane service-plane", () => {
    const edges = [s3("fn-a"), edge({ source_id: "i-1", target_id: "bucket", protocol: "TCP", port: 443, edge_class: "internal" })]
    expect(railInboundCaption("bucket", edges, isFn)).toBe("1 fn · 1 other · access")
    expect(
      railInboundCaption(
        "db",
        [edge({ source_id: "i-1", target_id: "db", port: 5432, edge_class: "database" })],
        isFn,
      ),
    ).toBe("1 other · database access")
  })
})

describe("boundary captions", () => {
  it("count the workloads whose egress the map routes through the IGW, and say when there are none", () => {
    const edges = [
      edge({ source_id: "i-1", target_id: "__igw__", edge_class: "egress" }),
      edge({ source_id: "i-2", target_id: "__igw__", edge_class: "egress" }),
      edge({ source_id: "i-1", target_id: "arn:aws:s3:::b", edge_class: "edge_service", via_igw: true }),
      edge({ source_id: "i-3", target_id: "arn:aws:s3:::b", edge_class: "edge_service", egress_path: "public" }),
    ]
    const primary = { id: "igw-main", primary: true }
    expect(boundaryIgwCaption(edges, primary)).toBe("egress: 3 workloads")
    expect(boundaryIgwCaption([edges[0]], primary)).toBe("egress: 1 workload")
    expect(
      boundaryIgwCaption([edge({ source_id: "i-1", target_id: "arn:aws:s3:::b", edge_class: "edge_service" })], primary),
    ).toBe("egress: not observed")
    // A second gateway on the frame is not the `__igw__` the egress edges name:
    // it counts only edges that name its own id, or it says so.
    const extra = { id: "igw-extra", primary: false }
    expect(boundaryIgwCaption(edges, extra)).toBe("egress: not observed")
    expect(boundaryIgwCaption([edge({ source_id: "i-7", target_id: "igw-extra", edge_class: "egress" })], extra)).toBe(
      "egress: 1 workload",
    )
  })

  it("count the workloads that reach an endpoint directly or route through it", () => {
    const edges = [
      edge({ source_id: "i-1", target_id: "vpce-ssm", edge_class: "vpce" }),
      edge({ source_id: "i-2", target_id: "vpce-ssm", edge_class: "vpce" }),
      edge({ source_id: "i-1", target_id: "vpce-ssm", edge_class: "vpce", port: 443 }),
      edge({ source_id: "i-9", target_id: "arn:aws:s3:::b", edge_class: "edge_service", via_vpce_id: "vpce-s3" }),
    ]
    expect(boundaryVpceCaption(edges, "vpce-ssm")).toBe("use: 2 workloads")
    expect(boundaryVpceCaption(edges, "vpce-s3")).toBe("use: 1 workload")
    expect(boundaryVpceCaption(edges, "vpce-ec2messages")).toBe("use: not observed")
  })
})
