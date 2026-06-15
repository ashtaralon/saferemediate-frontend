// =============================================================================
// Visual Hierarchy Contract v1 — Cloud Graph Spatial Governance
// =============================================================================
//
// Implements /tmp/visual-hierarchy-contract-v1.md as enforceable TypeScript.
//
// §0.1 — Layout is defined as RELATIONAL CONSTRAINTS, not coordinates.
//        Zones below are preferred starting positions (ELK hints); the
//        invariants in enforceAnchoring() are the contract.
// §0.2 — Spine is a COMPUTED INVARIANT — emitted by the backend via
//        report.attacker_steps[]. The frontend honors, never re-derives.
// §0.3 — Layout determinism: same (report, canvas, options) inputs MUST
//        produce identical positions. Enforced by a post-ELK pass that snaps
//        nodes into compliance with invariants; no clocks, no random seeds.

import type { Node } from "reactflow"
import type { AttackPathReport } from "./attack-path-report-types"
import type { CMCard, CMEdge, CMFrame } from "./containment-model"
import type { SemanticClass } from "./cloud-graph-semantic"

// ─── Re-export for callers that need the semantic class type ───
export type { SemanticClass }

// =============================================================================
// §1 — Layout Zones (preferred starting positions, normalized 0–1)
// =============================================================================
//
// All ranges are relative to the AWS Cloud frame's INTERIOR box (so the
// zones survive any canvas size). ELK treats these as positioning hints;
// the post-ELK enforcement pass (§2) applies the relational constraints
// that are the contract.

export interface LayoutZone {
  /** Preferred horizontal band (xMin, xMax), 0–1, relative to Cloud interior. */
  x: [number, number]
  /** Preferred vertical band. */
  y: [number, number]
  /** When two nodes share this zone, packing direction. */
  pack: "horizontal" | "vertical"
  /** Minimum gap (px) between sibling nodes in this zone. */
  gapPx: number
}

export const LAYOUT_ZONES: Record<SemanticClass, LayoutZone> = {
  // Attacker's origin — top-left "where it begins"
  ENTRY:    { x: [0.00, 0.22], y: [0.04, 0.32], pack: "vertical",   gapPx: 16 },
  // Transit conduits on the path — top corridor between ENTRY and IDENTITY
  NETWORK:  { x: [0.20, 0.58], y: [0.04, 0.42], pack: "horizontal", gapPx: 24 },
  // What the attacker BECOMES — midline corridor
  IDENTITY: { x: [0.38, 0.66], y: [0.42, 0.66], pack: "vertical",   gapPx: 14 },
  // Crown jewels — terminal-right zone, always destination-positioned
  JEWEL:    { x: [0.74, 0.98], y: [0.34, 0.78], pack: "vertical",   gapPx: 18 },
  // Config metadata (SG/NACL/RT) — bottom band; never competes with spine
  CONTROL:  { x: [0.00, 1.00], y: [0.78, 0.98], pack: "horizontal", gapPx: 14 },
  // Off-spine nodes — wherever ELK lands them, OUTSIDE protagonist zones
  OFF_SPINE:{ x: [0.00, 1.00], y: [0.00, 1.00], pack: "horizontal", gapPx: 12 },
}

// =============================================================================
// §2 — Spine sequence (§0.2: computed invariant from the backend IR)
// =============================================================================

/** The canonical ordered sequence of node ids the attack chain traverses,
 *  as emitted by the backend Attack-Path Compiler in report.attacker_steps[].
 *  Layout MUST honor this order on the x-axis (monotonic). */
export function spineSequence(report: AttackPathReport): string[] {
  const sequence: string[] = []
  const byClaim = new Map(report.claims.map((c) => [c.id, c]))
  for (const step of report.attacker_steps) {
    for (const claimId of step.claim_ids) {
      const claim = byClaim.get(claimId)
      claim?.source_refs?.forEach((ref) => {
        if (ref.kind === "neo4j_node" && ref.id) {
          if (!sequence.includes(ref.id)) sequence.push(ref.id)
        }
      })
    }
  }
  return sequence
}

// =============================================================================
// §3 — Edge Routing Classes
// =============================================================================

export type EdgeRoutingClass = "spine" | "infra" | "metadata"

export interface EdgeRoutingToken {
  /** Visible stroke width in px. */
  width: number
  opacity: number
  /** ReactFlow edge path algorithm to use. */
  routing: "smoothstep" | "step" | "straight"
  /** Whether the moving white dot animates along this edge. */
  animated: boolean
  /** Whether the label is visible by default or hover-only. */
  labelVisibility: "always" | "hover"
}

export const EDGE_ROUTING_TOKENS: Record<EdgeRoutingClass, EdgeRoutingToken> = {
  spine: {
    width: 2.5,
    opacity: 1.0,
    routing: "smoothstep",
    animated: true,
    labelVisibility: "always",
  },
  infra: {
    width: 1.5,
    opacity: 0.45,           // §3: reads as "structural connection", recessive
    routing: "step",         // orthogonal — no curve, mechanical
    animated: false,
    labelVisibility: "hover",
  },
  metadata: {
    width: 1.0,
    opacity: 0.0,            // §3: INVISIBLE by default
    routing: "straight",
    animated: false,
    labelVisibility: "hover",
  },
}

/** Map a CMEdge to its semantic routing class. */
export function edgeRoutingClass(e: CMEdge): EdgeRoutingClass {
  // Path-class on the path-layer = spine (the attack chain)
  if (e.style === "path" && e.layer === "path") return "spine"
  // Encryption + private routes = infra (structural connection)
  if (e.style === "enc" || e.style === "priv") return "infra"
  // Everything else = metadata (hidden by default)
  return "metadata"
}

// =============================================================================
// §4 — Containment Geometry
// =============================================================================

export type ContainerKind = "cloud" | "region" | "vpc" | "az" | "subnet"

export interface ContainmentRule {
  /** Children CANNOT escape this frame's bounding box. */
  hardBounds: boolean
  /** Label rendered INSIDE the frame's header band, not floating outside. */
  labelInside: boolean
  /** Minimum padding from frame edge to inner content (px). */
  paddingPx: number
  /** If a child would escape due to size, what happens. */
  escapeBehavior: "expand-frame" | "snap-child" | "shrink-child"
}

export const CONTAINMENT_RULES: Record<ContainerKind, ContainmentRule> = {
  cloud:  { hardBounds: true, labelInside: true, paddingPx: 24, escapeBehavior: "expand-frame" },
  region: { hardBounds: true, labelInside: true, paddingPx: 22, escapeBehavior: "expand-frame" },
  vpc:    { hardBounds: true, labelInside: true, paddingPx: 20, escapeBehavior: "expand-frame" },
  az:     { hardBounds: true, labelInside: true, paddingPx: 16, escapeBehavior: "expand-frame" },
  subnet: { hardBounds: true, labelInside: true, paddingPx: 14, escapeBehavior: "expand-frame" },
}

// =============================================================================
// §5 — Anchoring Invariants (§2 of the contract markdown)
// =============================================================================
//
// These are HARD assertions. ELK should satisfy them, but if it doesn't,
// the post-ELK enforcement pass below snaps nodes into compliance. Each
// violation is logged in dev so layout bugs are visible, not silent.

interface PositionedNode {
  id: string
  x: number
  y: number
  width: number
  height: number
  semantic: SemanticClass
}

interface ConstraintViolation {
  rule: string
  detail: string
  nodeId?: string
}

/** Apply all anchoring invariants A1–A6. Snaps offenders into their zone.
 *  Returns the (possibly mutated) nodes plus a list of violations encountered.
 *  Pure function — same inputs produce same outputs (§0.3 determinism). */
export function enforceAnchoring(
  nodes: PositionedNode[],
  canvas: { width: number; height: number },
  spineOrder: string[],
): { nodes: PositionedNode[]; violations: ConstraintViolation[] } {
  const violations: ConstraintViolation[] = []
  // Work on a copy — pure-function discipline.
  const out: PositionedNode[] = nodes.map((n) => ({ ...n }))
  const byId = new Map(out.map((n) => [n.id, n]))

  const entries = out.filter((n) => n.semantic === "ENTRY")
  const jewels = out.filter((n) => n.semantic === "JEWEL")
  const identities = out.filter((n) => n.semantic === "IDENTITY")

  // ── A1: Every JEWEL.x ≥ every ENTRY.x + (canvas.w × 0.5) ──
  for (const j of jewels) {
    for (const e of entries) {
      const minJewelX = e.x + canvas.width * 0.5
      if (j.x < minJewelX) {
        violations.push({
          rule: "A1",
          nodeId: j.id,
          detail: `JEWEL ${j.id} at x=${j.x.toFixed(1)} violates min x=${minJewelX.toFixed(1)} (≥ ENTRY ${e.id}.x + 0.5*w)`,
        })
        j.x = minJewelX
      }
    }
  }

  // ── A2: For every IDENTITY i: ENTRY.x ≤ i.x ≤ JEWEL.x ──
  for (const i of identities) {
    const minIdentityX = Math.min(...entries.map((e) => e.x), 0)
    const maxIdentityX = Math.max(...jewels.map((j) => j.x), canvas.width)
    if (i.x < minIdentityX) {
      violations.push({
        rule: "A2",
        nodeId: i.id,
        detail: `IDENTITY ${i.id} at x=${i.x.toFixed(1)} left of all ENTRY nodes`,
      })
      i.x = minIdentityX
    }
    if (i.x > maxIdentityX) {
      violations.push({
        rule: "A2",
        nodeId: i.id,
        detail: `IDENTITY ${i.id} at x=${i.x.toFixed(1)} right of all JEWEL nodes`,
      })
      i.x = maxIdentityX
    }
  }

  // ── A3: No two protagonists share an x-band < 12% of canvas width ──
  const minProtagonistGap = canvas.width * 0.12
  const protagonists = [...entries, ...identities, ...jewels].sort((a, b) => a.x - b.x)
  for (let i = 1; i < protagonists.length; i++) {
    const prev = protagonists[i - 1]
    const cur = protagonists[i]
    if (cur.semantic === prev.semantic) continue // siblings allowed
    const gap = cur.x - prev.x
    if (gap < minProtagonistGap) {
      violations.push({
        rule: "A3",
        nodeId: cur.id,
        detail: `Protagonist ${cur.id} (${cur.semantic}) at x=${cur.x.toFixed(1)} too close to ${prev.id} (${prev.semantic}) at x=${prev.x.toFixed(1)}, gap=${gap.toFixed(1)} < ${minProtagonistGap.toFixed(1)}`,
      })
      cur.x = prev.x + minProtagonistGap
    }
  }

  // ── A4: All CONTROL nodes have y > canvas.h × 0.65 ──
  const minControlY = canvas.height * 0.65
  for (const n of out) {
    if (n.semantic === "CONTROL" && n.y < minControlY) {
      violations.push({
        rule: "A4",
        nodeId: n.id,
        detail: `CONTROL ${n.id} at y=${n.y.toFixed(1)} above min y=${minControlY.toFixed(1)} (must stay in bottom band)`,
      })
      n.y = minControlY
    }
  }

  // ── A6: Spine sequence is monotonic on x-axis for PROTAGONIST CLASS
  //        transitions ──
  //
  // Two refinements vs the naive "every step right of the previous":
  //   1) Only protagonist classes (ENTRY / NETWORK / IDENTITY / JEWEL) carry
  //      x-ordering meaning. CONTROL nodes (SG / NACL / RT) live in the
  //      bottom band per A4 — forcing them into the spine x-sequence would
  //      put them at small x because they pack horizontally there, breaking
  //      monotonicity for downstream protagonists.
  //   2) Within a single class (e.g. two JEWELs reachable from the same
  //      identity), siblings have no required x-order. They're parallel
  //      targets, not sequenced ones.
  //
  // The invariant we DO enforce: when the spine transitions from one
  // protagonist class to a different protagonist class, the later class's
  // node must be at greater or equal x.
  const PROTAGONIST: ReadonlySet<SemanticClass> = new Set([
    "ENTRY",
    "NETWORK",
    "IDENTITY",
    "JEWEL",
  ])
  let lastProtagonist: PositionedNode | undefined
  for (const id of spineOrder) {
    const cur = byId.get(id)
    if (!cur || !PROTAGONIST.has(cur.semantic)) continue
    if (lastProtagonist && cur.semantic !== lastProtagonist.semantic && cur.x < lastProtagonist.x) {
      violations.push({
        rule: "A6",
        nodeId: cur.id,
        detail: `Spine class transition ${lastProtagonist.semantic}→${cur.semantic}: ${cur.id}.x=${cur.x.toFixed(1)} < ${lastProtagonist.id}.x=${lastProtagonist.x.toFixed(1)} (later class must be ≥ x)`,
      })
      cur.x = lastProtagonist.x + 24
    }
    lastProtagonist = cur
  }

  // ── A7: Intra-class sibling separation ──
  //
  // A3 enforces gaps between protagonist nodes of DIFFERENT classes. Same-
  // class siblings (e.g. two CROWN JEWELs reachable from the same identity)
  // are A3-exempt by design — they're parallel targets, not sequenced. But
  // without ANY separation they can stack on top of each other in DOM space,
  // which is exactly what the C2 acceptance test catches.
  //
  // For each semantic class with ≥2 nodes, stack siblings in the zone's
  // declared pack direction with the zone's gapPx, sorted by current
  // position so the ordering reads naturally.
  const byClass = new Map<SemanticClass, PositionedNode[]>()
  for (const n of out) {
    if (!byClass.has(n.semantic)) byClass.set(n.semantic, [])
    byClass.get(n.semantic)!.push(n)
  }
  for (const [semClass, siblings] of byClass) {
    if (siblings.length < 2) continue
    const zone = LAYOUT_ZONES[semClass]
    if (zone.pack === "vertical") {
      siblings.sort((a, b) => a.y - b.y || a.x - b.x)
      for (let i = 1; i < siblings.length; i++) {
        const prev = siblings[i - 1]
        const minY = prev.y + prev.height + zone.gapPx
        if (siblings[i].y < minY) {
          violations.push({
            rule: "A7",
            nodeId: siblings[i].id,
            detail: `${semClass} sibling ${siblings[i].id}.y=${siblings[i].y.toFixed(1)} overlaps ${prev.id}.y=${prev.y.toFixed(1)} (vertical pack gap ${zone.gapPx}px)`,
          })
          siblings[i].y = minY
        }
      }
    } else {
      siblings.sort((a, b) => a.x - b.x || a.y - b.y)
      for (let i = 1; i < siblings.length; i++) {
        const prev = siblings[i - 1]
        const minX = prev.x + prev.width + zone.gapPx
        if (siblings[i].x < minX) {
          violations.push({
            rule: "A7",
            nodeId: siblings[i].id,
            detail: `${semClass} sibling ${siblings[i].id}.x=${siblings[i].x.toFixed(1)} overlaps ${prev.id}.x=${prev.x.toFixed(1)} (horizontal pack gap ${zone.gapPx}px)`,
          })
          siblings[i].x = minX
        }
      }
    }
  }

  return { nodes: out, violations }
}

// =============================================================================
// §6 — Containment Enforcement
// =============================================================================

/** Ensure every child node fits inside its declared parent frame. If escape
 *  is detected and the rule says "expand-frame", grows the parent frame to
 *  contain the child plus padding. Pure function — deterministic. */
export function enforceContainment(
  nodes: PositionedNode[],
  frames: Array<CMFrame & { kind: ContainerKind }>,
  childToParent: Map<string, string>, // node id → frame id
): { frames: Array<CMFrame & { kind: ContainerKind }>; violations: ConstraintViolation[] } {
  const violations: ConstraintViolation[] = []
  const outFrames = frames.map((f) => ({ ...f }))
  const frameById = new Map(outFrames.map((f) => [f.id, f]))

  for (const node of nodes) {
    const parentId = childToParent.get(node.id)
    if (!parentId) continue
    const frame = frameById.get(parentId)
    if (!frame) continue

    const rule = CONTAINMENT_RULES[frame.kind]
    if (!rule.hardBounds) continue

    const pad = rule.paddingPx
    const childRight = node.x + node.width
    const childBottom = node.y + node.height
    const frameRight = frame.x + frame.w
    const frameBottom = frame.y + frame.h

    let escaped = false
    if (node.x < frame.x + pad) {
      escaped = true
      if (rule.escapeBehavior === "expand-frame") {
        const delta = frame.x + pad - node.x
        frame.x -= delta
        frame.w += delta
      }
    }
    if (node.y < frame.y + pad) {
      escaped = true
      if (rule.escapeBehavior === "expand-frame") {
        const delta = frame.y + pad - node.y
        frame.y -= delta
        frame.h += delta
      }
    }
    if (childRight > frameRight - pad) {
      escaped = true
      if (rule.escapeBehavior === "expand-frame") {
        frame.w = childRight - frame.x + pad
      }
    }
    if (childBottom > frameBottom - pad) {
      escaped = true
      if (rule.escapeBehavior === "expand-frame") {
        frame.h = childBottom - frame.y + pad
      }
    }

    if (escaped) {
      violations.push({
        rule: "C4-containment",
        nodeId: node.id,
        detail: `Node ${node.id} escaped frame ${frame.id} (kind=${frame.kind}); ${rule.escapeBehavior} applied`,
      })
    }
  }

  // Cascade — child frame escapes also expand parent frame if nested.
  // For now, a single non-recursive pass; nested cases (subnet child escapes,
  // AZ frame should also expand) are handled by the next pass calling this
  // function on the upgraded frames.

  return { frames: outFrames, violations }
}

// =============================================================================
// §7 — Determinism guarantee
// =============================================================================

/** Tag exported by enforcement functions when their output is deterministic.
 *  Test harness asserts this contract holds across canvas-size variations. */
export const DETERMINISTIC = Symbol.for("cloud-graph-hierarchy:deterministic")

// =============================================================================
// §8 — ContainmentModel adapter (matches the actual data shape in use)
// =============================================================================
//
// The ContainmentModel already carries positioned cards + frames. This helper
// applies the §4 containment rules directly on it, expanding any frame whose
// declared children escape its bounds — the fix for the "KMS floats outside
// VPC" bug. Pure function; same model in → same expanded model out.

interface BoxLike { x: number; y: number; w: number; h: number }

function rectContains(outer: BoxLike, inner: BoxLike, padding = 0): boolean {
  return (
    inner.x >= outer.x + padding &&
    inner.y >= outer.y + padding &&
    inner.x + inner.w <= outer.x + outer.w - padding &&
    inner.y + inner.h <= outer.y + outer.h - padding
  )
}

/** Find the smallest non-Cloud frame whose bounding box could contain `card`
 *  if expanded. The AWS Cloud frame is excluded from parent-detection because
 *  it always geographically encompasses every card — selecting it would make
 *  the enforcement pass a no-op (Cloud is already big enough). We want the
 *  next-most-specific frame (Region/VPC/AZ/Subnet) so the *meaningful*
 *  container expands and the card visually ends up inside it.
 *
 *  Step 1: smallest non-Cloud frame whose CENTER contains the card center.
 *  Step 2 (fallback): nearest non-Cloud frame by center distance — for cards
 *  that escaped their intended frame entirely (the cyntro-demo-cmk case). */
function findIntendedParent(
  card: { x: number; y: number; w: number; h: number },
  frames: ReadonlyArray<CMFrame>,
): CMFrame | undefined {
  const cx = card.x + card.w / 2
  const cy = card.y + card.h / 2
  const nonCloud = frames.filter((f) => f.kind !== "cloud")
  // 1) Smallest non-Cloud frame whose center contains the card center.
  const containing = nonCloud
    .filter((f) => cx >= f.x && cx <= f.x + f.w && cy >= f.y && cy <= f.y + f.h)
    .sort((a, b) => a.w * a.h - b.w * b.h)
  if (containing[0]) return containing[0]
  // 2) Fallback — card is OUTSIDE every non-Cloud frame's bounds. This means
  //    it was probably never meant to live in a tiny subnet/AZ; it belongs in
  //    a larger ancestor (VPC, Region). Search by KIND PRIORITY (larger first)
  //    so KMS-outside-subnets falls into VPC instead of nearest-distance Subnet.
  const KIND_PRIORITY: CMFrame["kind"][] = ["vpc", "region", "az", "subnet"]
  for (const kind of KIND_PRIORITY) {
    const ofKind = nonCloud.filter((f) => f.kind === kind)
    if (ofKind.length === 0) continue
    let best = ofKind[0]
    let bestDist = Infinity
    for (const f of ofKind) {
      const fcx = f.x + f.w / 2
      const fcy = f.y + f.h / 2
      const dist = Math.hypot(cx - fcx, cy - fcy)
      if (dist < bestDist) {
        best = f
        bestDist = dist
      }
    }
    return best
  }
  // 3) Last resort — Cloud (no visible effect, but the pass has a target).
  return frames.find((f) => f.kind === "cloud")
}

/** Apply §4 containment rules directly to a ContainmentModel-like structure.
 *  For each card, expand the parent frame so the card sits fully inside with
 *  the required padding. For nested frames (subnet inside AZ inside VPC),
 *  cascades upward: child-frame expansion may require parent-frame expansion.
 *
 *  Returns the same model shape with frames possibly enlarged. Cards positions
 *  are NOT moved (data-truth wins; we expand the container, not the contained). */
export function enforceContainmentOnModel<
  M extends { frames: CMFrame[]; cards: CMCard[]; width: number; height: number },
>(model: M): { model: M; violations: ConstraintViolation[] } {
  const violations: ConstraintViolation[] = []
  // Work on a deep-copy of frames (cards untouched).
  const frames: CMFrame[] = model.frames.map((f) => ({ ...f }))
  const frameById = new Map(frames.map((f) => [f.id, f]))

  // Iterate cards, expand their intended parent frame if they escape.
  for (const card of model.cards) {
    const parent = findIntendedParent(card, frames)
    if (!parent) continue
    const rule = CONTAINMENT_RULES[parent.kind as ContainerKind]
    if (!rule || !rule.hardBounds) continue
    const pad = rule.paddingPx
    const live = frameById.get(parent.id)
    if (!live) continue

    let expanded = false
    if (card.x < live.x + pad) {
      const delta = live.x + pad - card.x
      live.x -= delta
      live.w += delta
      expanded = true
    }
    if (card.y < live.y + pad) {
      const delta = live.y + pad - card.y
      live.y -= delta
      live.h += delta
      expanded = true
    }
    if (card.x + card.w > live.x + live.w - pad) {
      live.w = card.x + card.w + pad - live.x
      expanded = true
    }
    if (card.y + card.h > live.y + live.h - pad) {
      live.h = card.y + card.h + pad - live.y
      expanded = true
    }
    if (expanded) {
      violations.push({
        rule: "C4-containment",
        nodeId: card.id,
        detail: `Card ${card.id} escaped frame ${live.id} (${live.kind}); frame expanded`,
      })
    }
  }

  // Cascade — child frame may now escape its parent. Walk parent chain.
  // Parent linkages are SNAPSHOTTED here based on ORIGINAL geometry (before
  // any expansions), so an expanded subnet whose center has drifted outside
  // its VPC still resolves correctly back to its original VPC parent.
  const PARENT_KIND_LOCAL: Partial<Record<CMFrame["kind"], CMFrame["kind"]>> = {
    subnet: "az",
    az: "vpc",
    vpc: "region",
    region: "cloud",
  }
  // Snapshot original parent for each frame (one shot, before expansion mutates).
  const originalParentOf = new Map<string, string>()
  const originalFrames = model.frames // pre-mutation frames
  for (const child of originalFrames) {
    const parentKind = PARENT_KIND_LOCAL[child.kind]
    if (!parentKind) continue
    const ccx = child.x + child.w / 2
    const ccy = child.y + child.h / 2
    // Largest-overlap parent (or center-containment) at original positions.
    const parent = originalFrames.find(
      (f) =>
        f.kind === parentKind &&
        ccx >= f.x &&
        ccx <= f.x + f.w &&
        ccy >= f.y &&
        ccy <= f.y + f.h,
    )
    if (parent) originalParentOf.set(child.id, parent.id)
  }
  const liveFrameById = frameById // mutable lookup
  // Apply twice — handles two levels of cascade (subnet→az→vpc).
  for (let pass = 0; pass < 3; pass++) {
    for (const child of frames) {
      const parentId = originalParentOf.get(child.id)
      if (!parentId) continue
      const parent = liveFrameById.get(parentId)
      if (!parent) continue
      const rule = CONTAINMENT_RULES[parent.kind as ContainerKind]
      if (!rule || !rule.hardBounds) continue
      const pad = rule.paddingPx
      if (child.x < parent.x + pad) {
        const delta = parent.x + pad - child.x
        parent.x -= delta
        parent.w += delta
      }
      if (child.y < parent.y + pad) {
        const delta = parent.y + pad - child.y
        parent.y -= delta
        parent.h += delta
      }
      if (child.x + child.w > parent.x + parent.w - pad) {
        parent.w = child.x + child.w + pad - parent.x
      }
      if (child.y + child.h > parent.y + parent.h - pad) {
        parent.h = child.y + child.h + pad - parent.y
      }
    }
  }

  // Recompute model bounds so the viewport encompasses everything.
  let maxRight = model.width
  let maxBottom = model.height
  for (const f of frames) {
    if (f.x + f.w > maxRight) maxRight = f.x + f.w
    if (f.y + f.h > maxBottom) maxBottom = f.y + f.h
  }

  return {
    model: {
      ...model,
      frames,
      width: maxRight,
      height: maxBottom,
    },
    violations,
  }
}

/** §0.3 acceptance helper — compares two layout results for byte-identical
 *  positions (after normalizing for canvas scale). Returns the deltas list;
 *  empty list = passes determinism contract. */
export function compareDeterminism(
  layoutA: { positions: Map<string, { x: number; y: number }>; canvasW: number },
  layoutB: { positions: Map<string, { x: number; y: number }>; canvasW: number },
  tolerancePx = 0.5,
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = []
  const scaleA = layoutA.canvasW
  const scaleB = layoutB.canvasW
  for (const [id, posA] of layoutA.positions) {
    const posB = layoutB.positions.get(id)
    if (!posB) {
      violations.push({ rule: "D1", nodeId: id, detail: `Node ${id} missing in layout B` })
      continue
    }
    // Normalize for canvas scale
    const normAx = posA.x / scaleA
    const normBx = posB.x / scaleB
    const normAy = posA.y / scaleA
    const normBy = posB.y / scaleB
    const dx = Math.abs(normAx - normBx) * Math.max(scaleA, scaleB)
    const dy = Math.abs(normAy - normBy) * Math.max(scaleA, scaleB)
    if (dx > tolerancePx || dy > tolerancePx) {
      violations.push({
        rule: "D1",
        nodeId: id,
        detail: `Node ${id} drifted across canvas-size change: dx=${dx.toFixed(2)}px dy=${dy.toFixed(2)}px (tolerance ${tolerancePx}px)`,
      })
    }
  }
  return violations
}
