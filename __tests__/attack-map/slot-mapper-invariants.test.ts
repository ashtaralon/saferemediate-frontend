/**
 * Slot-mapper invariant pins — CYNTRO_ATTACK_MAP_SLOT_MAPPER_SPEC.md v1.3 §7.
 *
 * Pure Vitest. No live backend. No DOM. No Playwright.
 * Synthesizes TopologySnapshot + chain inputs, asserts the 8 spec §7 invariants
 * against the real slot() / sub-resolvers in lib/attack-map/slot-mapper.ts.
 *
 * Reads:
 *   - lib/attack-map/slot-mapper.ts (Task #184)
 *
 * Companion live spec: tests/integration/attack-map-fixture-pins-live.spec.ts
 */
import { describe, expect, it } from "vitest"

import {
  type AttackMapPayload,
  type ConstraintEdge,
  type Context,
  type DensityRules,
  type GroupBox,
  type JewelColumn,
  type MovementHop,
  type Position,
  type SubnetBox,
  type TopologySnapshot,
  compressConstraintsForEdge,
  deriveMovementEdges,
  layoutPayload,
  resolveChainPosition,
  resolveConstraintPlacement,
  resolveTopologySlot,
  slot,
} from "@/lib/attack-map/slot-mapper"

// ─── Synthesis helpers ─────────────────────────────────────────────────

const DENSITY: DensityRules = {
  jewel_column_capacity: 10,
  tile_w: 90,
  tile_h: 30,
  tile_gap: 6,
  tiles_per_row: 4,
}

function makeSubnet(id: string, az: string, x: number, y: number, kind: "public" | "private" = "private"): SubnetBox {
  return { id, az, kind, x, y, w: 320, h: 180 }
}

function makeGroup(id: string, subnet_id: string, x: number, y: number, kind: GroupBox["kind"] = "sg_cluster", capacity = 8): GroupBox {
  return { id, subnet_id, kind, capacity, x, y, w: 260, h: 120 }
}

function makeJewelColumn(x = 1100, top_y = 60): JewelColumn {
  return { x, top_y, row_height: 40, col_step: -110, capacity: 10, max_columns: 3 }
}

function makeTopology(opts: {
  system?: string
  subnets?: SubnetBox[]
  groups?: GroupBox[]
  membership?: TopologySnapshot["membership"]
  jewel_column?: JewelColumn
} = {}): TopologySnapshot {
  const subnets = (opts.subnets ?? [makeSubnet("subnet-a", "eu-west-1a", 40, 200)]).reduce<Record<string, SubnetBox>>(
    (acc, s) => ((acc[s.id] = s), acc),
    {},
  )
  const groups = (opts.groups ?? [makeGroup("grp-1", "subnet-a", 56, 220)]).reduce<Record<string, GroupBox>>(
    (acc, g) => ((acc[g.id] = g), acc),
    {},
  )
  return {
    system: opts.system ?? "test-sys",
    vpc: { x: 20, y: 60, w: 1060, h: 520 },
    subnets,
    groups,
    membership: opts.membership ?? {},
    resources: [],
    crown_jewels: [],
    crown_jewel_column: opts.jewel_column ?? makeJewelColumn(),
    drift_lane: { x: 20, y: 620, w: 1060, h: 80 },
    orphan_lane: { x: 20, y: 710, w: 1060, h: 80 },
    external_slots: { internet: { x: 540, y: 30 }, open_cidr: { x: 540, y: 30 } },
  }
}

function makeHop(node_id: string, node_type: string, extra: Partial<MovementHop> = {}): MovementHop {
  return { node_id, node_type, verdict: "SEEN", ...extra }
}

function makeChain(...hops: MovementHop[]): MovementHop[] {
  return hops
}

function makeContext(topology: TopologySnapshot, chain: MovementHop[], opts: Partial<Context> = {}): Context {
  return {
    topology,
    chain,
    hop_index: 0,
    movement_edges: opts.movement_edges ?? deriveMovementEdges(chain),
    constraint_edges: opts.constraint_edges ?? [],
    density: DENSITY,
    ...opts,
  }
}

// ─── §7.1 Determinism ─────────────────────────────────────────────────

describe("§7.1 Determinism", () => {
  it("renders same chain 100× to identical Positions", () => {
    const topo = makeTopology({
      membership: { "i-aaa": { subnet_id: "subnet-a", az: "eu-west-1a", group_id: "grp-1" } },
    })
    const chain = makeChain(makeHop("i-aaa", "EC2Instance", { subnet_id: "subnet-a", az: "eu-west-1a" }))
    const ctx = makeContext(topo, chain)

    const first = slot(chain[0], ctx)
    for (let i = 0; i < 100; i++) {
      const again = slot(chain[0], ctx)
      expect(again).toEqual(first)
    }
  })

  it("§5 invariant 3 — placement_provenance is always set", () => {
    const topo = makeTopology()
    const chain = makeChain(makeHop("i-orphan", "EC2Instance", { subnet_id: "missing", az: "eu-west-1a" }))
    const ctx = makeContext(topo, chain)
    const p = slot(chain[0], ctx)
    expect(p.placement_provenance).toBeDefined()
    expect(["prior_render", "hash", "operator_pinned", "fallback"]).toContain(p.placement_provenance)
  })
})

// ─── §7.2 Shared-role isolation ───────────────────────────────────────

describe("§7.2 Shared-role isolation", () => {
  it("3 chains using one role → 3 distinct identity strip slot_ids", () => {
    const topo = makeTopology({
      subnets: [
        makeSubnet("subnet-a", "eu-west-1a", 40, 200),
        makeSubnet("subnet-b", "eu-west-1a", 400, 200),
        makeSubnet("subnet-c", "eu-west-1b", 760, 200),
      ],
      membership: {
        "i-1": { subnet_id: "subnet-a", az: "eu-west-1a" },
        "i-2": { subnet_id: "subnet-b", az: "eu-west-1a" },
        "i-3": { subnet_id: "subnet-c", az: "eu-west-1b" },
      },
    })
    const role = "arn:aws:iam::1:role/shared"

    const chains: MovementHop[][] = [
      [makeHop("i-1", "EC2Instance"), makeHop(role, "IAMRole")],
      [makeHop("i-2", "EC2Instance"), makeHop(role, "IAMRole")],
      [makeHop("i-3", "EC2Instance"), makeHop(role, "IAMRole")],
    ]

    const positions = chains.map((c) => {
      const ctx = makeContext(topo, c)
      const ctxWithIdx = { ...ctx, hop_index: 1 }
      return resolveTopologySlot(c[1], ctxWithIdx)
    })

    const slotIds = positions.map((p) => p.slot_id)
    const unique = new Set(slotIds)
    expect(unique.size).toBe(3) // per-chain strip context, not one shared strip
  })
})

// ─── §7.3 Density ─────────────────────────────────────────────────────

describe("§7.3 Density", () => {
  it("4 EC2 in one group → distinct tile_index, no overlap", () => {
    const topo = makeTopology({
      groups: [makeGroup("grp-1", "subnet-a", 56, 220, "sg_cluster", 4)],
      membership: {
        "i-1": { subnet_id: "subnet-a", az: "eu-west-1a", group_id: "grp-1" },
        "i-2": { subnet_id: "subnet-a", az: "eu-west-1a", group_id: "grp-1" },
        "i-3": { subnet_id: "subnet-a", az: "eu-west-1a", group_id: "grp-1" },
        "i-4": { subnet_id: "subnet-a", az: "eu-west-1a", group_id: "grp-1" },
      },
    })
    const chain = makeChain(
      makeHop("i-1", "EC2Instance"),
      makeHop("i-2", "EC2Instance"),
      makeHop("i-3", "EC2Instance"),
      makeHop("i-4", "EC2Instance"),
    )
    const ctx = makeContext(topo, chain)
    const positions = chain.map((h, i) => slot(h, { ...ctx, hop_index: i }))
    const slotIds = positions.map((p) => p.slot_id)
    expect(new Set(slotIds).size).toBe(4) // each EC2 → unique tile slot
  })
})

// ─── §7.4 History-aware stability ─────────────────────────────────────

describe("§7.4 History-aware stability", () => {
  it("adding a 5th EC2 doesn't reshuffle existing 4 (prior_renders honored)", () => {
    const topo = makeTopology({
      groups: [makeGroup("grp-1", "subnet-a", 56, 220, "sg_cluster", 8)],
      membership: {
        "i-1": { subnet_id: "subnet-a", az: "eu-west-1a", group_id: "grp-1" },
        "i-2": { subnet_id: "subnet-a", az: "eu-west-1a", group_id: "grp-1" },
        "i-3": { subnet_id: "subnet-a", az: "eu-west-1a", group_id: "grp-1" },
        "i-4": { subnet_id: "subnet-a", az: "eu-west-1a", group_id: "grp-1" },
        "i-5": { subnet_id: "subnet-a", az: "eu-west-1a", group_id: "grp-1" },
      },
    })

    const baseline = makeChain(
      makeHop("i-1", "EC2Instance"),
      makeHop("i-2", "EC2Instance"),
      makeHop("i-3", "EC2Instance"),
      makeHop("i-4", "EC2Instance"),
    )
    const ctxA = makeContext(topo, baseline)
    const priorRenders = new Map<string, Position>()
    baseline.forEach((h, i) => priorRenders.set(h.node_id, slot(h, { ...ctxA, hop_index: i })))

    // Now expand chain with a 5th EC2 (a new node not in priors).
    const expanded = [...baseline, makeHop("i-5", "EC2Instance")]
    const ctxB: Context = { ...makeContext(topo, expanded), prior_renders: priorRenders }

    // The existing 4 must retain their prior Positions exactly.
    baseline.forEach((h, i) => {
      const replayed = slot(h, { ...ctxB, hop_index: i })
      const prior = priorRenders.get(h.node_id)!
      expect(replayed.slot_id).toBe(prior.slot_id)
      expect(replayed.x).toBe(prior.x)
      expect(replayed.y).toBe(prior.y)
      expect(replayed.placement_provenance).toBe("prior_render")
    })

    // The new 5th gets hash placement (no prior).
    const fifth = slot(expanded[4], { ...ctxB, hop_index: 4 })
    expect(fifth.placement_provenance).toBe("hash")
  })

  it("structural anchor change invalidates prior_render (binding per §4.1.3)", () => {
    const topoBefore = makeTopology({
      membership: { "i-1": { subnet_id: "subnet-a", az: "eu-west-1a", group_id: "grp-1" } },
    })
    const chain = makeChain(makeHop("i-1", "EC2Instance"))
    const ctxBefore = makeContext(topoBefore, chain)
    const priorPos = slot(chain[0], ctxBefore)
    const priorRenders = new Map([["i-1", priorPos]])

    // Migrate EC2 to a different subnet — invalidates the structural anchor.
    const topoAfter = makeTopology({
      subnets: [makeSubnet("subnet-z", "eu-west-1b", 400, 200)],
      groups: [makeGroup("grp-2", "subnet-z", 416, 220)],
      membership: { "i-1": { subnet_id: "subnet-z", az: "eu-west-1b", group_id: "grp-2" } },
    })
    const ctxAfter: Context = { ...makeContext(topoAfter, chain), prior_renders: priorRenders }
    const newPos = slot(chain[0], ctxAfter)
    expect(newPos.placement_provenance).not.toBe("prior_render") // stale prior must not be honored
  })
})

// ─── §7.5 KMS as constraint ───────────────────────────────────────────

describe("§7.5 KMS as constraint", () => {
  it("KMS with appears_as='constraint' rides a band on the gated movement edge, never a hop", () => {
    const topo = makeTopology({
      membership: {
        "i-1": { subnet_id: "subnet-a", az: "eu-west-1a", group_id: "grp-1" },
      },
    })
    const chain = makeChain(
      makeHop("i-1", "EC2Instance"),
      makeHop("arn:aws:iam::1:role/r", "IAMRole"),
      makeHop("arn:aws:s3:::b", "S3Bucket", { is_crown_jewel: true }),
    )
    const constraint: ConstraintEdge = {
      constraint_node_id: "arn:aws:kms::1:key/k",
      constraint_node_type: "KMSKey",
      appears_as: "constraint",
      gates_movement_edge: "arn:aws:iam::1:role/r→arn:aws:s3:::b",
      verdict: "ALLOWED",
      severity: "high",
      expires_at: null,
    }
    const ctx = makeContext(topo, chain, { constraint_edges: [constraint] })

    // KMS must NOT appear as a movement hop. Driving the resolver with the
    // constraint node yields a band placement on L6_constraint.
    const constraintHop = makeHop(constraint.constraint_node_id, "KMSKey")
    const pos = resolveConstraintPlacement(constraintHop, { ...ctx, hop_index: -1 }, base0())
    expect(pos.layer).toBe("L6_constraint")
    expect(pos.anchor_kind).toBe("band")
  })
})

// ─── §7.6 KMS as terminus ─────────────────────────────────────────────

describe("§7.6 KMS as terminus", () => {
  it("KMS marked is_crown_jewel routes to jewel column (terminus, not constraint)", () => {
    const topo = makeTopology()
    const chain = makeChain(
      makeHop("i-1", "EC2Instance"),
      makeHop("arn:aws:kms::1:key/k", "KMSKey", { is_crown_jewel: true }),
    )
    const ctx = makeContext(topo, chain)
    const pos = resolveTopologySlot(chain[1], { ...ctx, hop_index: 1 })
    expect(pos.anchor_kind).toBe("jewel")
    expect(pos.layer).toBe("L3_resource")
  })
})

// ─── §7.7 SCP placement ───────────────────────────────────────────────

describe("§7.7 SCP placement", () => {
  it("SCP gating a cross-account movement edge → constraint band", () => {
    const topo = makeTopology()
    const chain = makeChain(
      makeHop("arn:aws:iam::aaa:role/src", "IAMRole"),
      makeHop("arn:aws:iam::bbb:role/dst", "IAMRole"),
    )
    const scp: ConstraintEdge = {
      constraint_node_id: "scp-1",
      constraint_node_type: "SCP",
      appears_as: "constraint",
      gates_movement_edge: "arn:aws:iam::aaa:role/src→arn:aws:iam::bbb:role/dst",
      verdict: "BLOCKED",
      severity: "critical",
      expires_at: null,
    }
    const ctx = makeContext(topo, chain, { constraint_edges: [scp] })
    const scpHop = makeHop("scp-1", "SCP")
    const pos = resolveConstraintPlacement(scpHop, { ...ctx, hop_index: -1 }, base0())
    expect(pos.layer).toBe("L6_constraint")
    expect(pos.anchor_kind).toBe("band")
  })
})

// ─── §7.8 Constraint compression (§4.4 mandate) ───────────────────────

describe("§7.8 Constraint compression", () => {
  it("5 constraints (3 distinct types) on one edge → top-2 visible + overflow; severity-desc order", () => {
    const edge = "src→dst"
    const constraints: ConstraintEdge[] = [
      { constraint_node_id: "k1", constraint_node_type: "KMSKey", appears_as: "constraint", gates_movement_edge: edge, verdict: "ALLOWED", severity: "low", expires_at: null },
      { constraint_node_id: "rp1", constraint_node_type: "ResourcePolicy", appears_as: "constraint", gates_movement_edge: edge, verdict: "ALLOWED", severity: "critical", expires_at: null },
      { constraint_node_id: "scp1", constraint_node_type: "SCP", appears_as: "constraint", gates_movement_edge: edge, verdict: "BLOCKED", severity: "critical", expires_at: null },
      { constraint_node_id: "tp1", constraint_node_type: "TrustPolicy", appears_as: "constraint", gates_movement_edge: edge, verdict: "ALLOWED", severity: "high", expires_at: null },
      { constraint_node_id: "k2", constraint_node_type: "KMSKey", appears_as: "constraint", gates_movement_edge: edge, verdict: "ALLOWED", severity: "medium", expires_at: null },
    ]
    const compressed = compressConstraintsForEdge(edge, constraints, new Date("2026-06-16T00:00:00Z"))
    expect(compressed.visible.length).toBeLessThanOrEqual(2)
    // 4 distinct node_types after same-type merge: KMSKey, ResourcePolicy, SCP, TrustPolicy
    expect(compressed.visible.length + compressed.overflow).toBe(4)
    // Severity-desc: critical > high > medium > low.
    const sevRank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
    expect(sevRank[compressed.visible[0].severity]).toBe(0) // top chip is critical
    if (compressed.visible.length > 1) {
      expect(sevRank[compressed.visible[1].severity]).toBeLessThanOrEqual(sevRank[compressed.visible[0].severity] + 1)
    }
  })

  it("merges same-type duplicates into one chip with combined count", () => {
    const edge = "src→dst"
    const constraints: ConstraintEdge[] = [
      { constraint_node_id: "k1", constraint_node_type: "KMSKey", appears_as: "constraint", gates_movement_edge: edge, verdict: "ALLOWED", severity: "high", expires_at: null },
      { constraint_node_id: "k2", constraint_node_type: "KMSKey", appears_as: "constraint", gates_movement_edge: edge, verdict: "ALLOWED", severity: "high", expires_at: null },
      { constraint_node_id: "k3", constraint_node_type: "KMSKey", appears_as: "constraint", gates_movement_edge: edge, verdict: "ALLOWED", severity: "high", expires_at: null },
    ]
    const compressed = compressConstraintsForEdge(edge, constraints, new Date("2026-06-16T00:00:00Z"))
    // 3 KMSKeys → single merged chip with count=3, no overflow
    expect(compressed.visible.length).toBe(1)
    expect(compressed.visible[0].node_type).toBe("KMSKey")
    expect(compressed.visible[0].count).toBe(3)
    expect(compressed.overflow).toBe(0)
  })
})

// ─── §8 end-to-end via layoutPayload (sanity check the public API) ────

describe("§8 layoutPayload sanity", () => {
  it("produces a Position for every movement hop, none on the wrong layer", () => {
    const topo = makeTopology({
      membership: {
        "i-1": { subnet_id: "subnet-a", az: "eu-west-1a", group_id: "grp-1" },
      },
    })
    const payload: AttackMapPayload = {
      system: "test-sys",
      path_id: "pin-test",
      score: 38,
      severity: "HIGH",
      movement_chain: [
        { node_id: "Internet", node_type: "Internet", verdict: "ENTRY" },
        { node_id: "i-1", node_type: "EC2Instance", verdict: "SEEN", subnet_id: "subnet-a", az: "eu-west-1a" },
        { node_id: "arn:aws:iam::1:role/r", node_type: "IAMRole", verdict: "SEEN" },
        { node_id: "arn:aws:s3:::b", node_type: "S3Bucket", verdict: "SEEN", is_crown_jewel: true },
      ],
      constraint_edges: [
        {
          constraint_node_id: "arn:aws:kms::1:key/k",
          constraint_node_type: "KMSKey",
          appears_as: "constraint",
          gates_movement_edge: "arn:aws:iam::1:role/r→arn:aws:s3:::b",
          verdict: "ALLOWED",
          severity: "high",
          expires_at: null,
        },
      ],
      blast: { crown_jewels_reachable: 1, shared_workloads: [] },
    }
    const out = layoutPayload(payload, topo, DENSITY)
    // Every movement hop gets a Position keyed by node_id.
    for (const hop of payload.movement_chain) {
      expect(out.has(hop.node_id)).toBe(true)
    }
    // No movement node may land on L6_constraint (§5 invariant 6).
    for (const hop of payload.movement_chain) {
      const pos = out.get(hop.node_id)!
      expect(pos.layer).not.toBe("L6_constraint")
    }
  })
})

// ─── helpers ──────────────────────────────────────────────────────────

function base0(): Position {
  return {
    x: 0,
    y: 0,
    layer: "L3_resource",
    z_index: 100,
    slot_id: "noop",
    anchor_kind: "tile",
    placement_provenance: "hash",
  }
}
