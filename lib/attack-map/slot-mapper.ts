/**
 * Cyntro Attack Map — Slot Mapper  (Task #184)
 *
 * Pure, deterministic compiler from `AttackMapPayload` (GET /attack-path/{id})
 * + `TopologySnapshot` (GET /topology/{system}?shape=full) → Position IR.
 *
 * Implements CYNTRO_ATTACK_MAP_SLOT_MAPPER_SPEC.md v1.3.
 *
 * HARD RULES (spec §3.1, §5):
 *   - No React, no DOM, no I/O, no randomness, no Date.now() in resolution.
 *   - Same (node, ctx) → identical Position every call (determinism, invariant 1).
 *   - placement_provenance is ALWAYS set (invariant 3).
 *   - Order of placement strategy: prior_render > operator_pinned > hash > fallback (invariant 2).
 *   - Constraints never consume hop coordinates; they ride a band on the gated edge (§2.2, invariant 6).
 *
 * The renderer (#185) is dumb: it consumes Position objects and draws them.
 * This module decides nothing about SVG/Canvas/WebGL, animation, color, or lens semantics.
 */

/* ────────────────────────────────────────────────────────────────────────
 * Position IR  (spec §3.2)
 * ──────────────────────────────────────────────────────────────────────── */

export type Layer =
  | 'L0_vpc'
  | 'L1_subnet'
  | 'L2_group'
  | 'L3_resource'
  | 'L4_identity'
  | 'L5_movement'
  | 'L6_constraint'
  | 'L7_effect';

export type AnchorKind =
  | 'tile'
  | 'label'
  | 'strip'
  | 'band'
  | 'jewel'
  | 'boundary'
  | 'orphan';

export type PlacementProvenance =
  | 'prior_render'
  | 'hash'
  | 'operator_pinned'
  | 'fallback';

export type Fallback =
  | 'unknown_subnet'
  | 'orphan_identity'
  | 'external'
  | 'graph_drift';

export interface Position {
  x: number;
  y: number;
  layer: Layer;
  z_index: number;
  /** stable, human-readable, e.g. "az1.app_subnet.web_asg.tile_2" */
  slot_id: string;
  anchor_kind: AnchorKind;
  placement_provenance: PlacementProvenance;
  fallback?: Fallback;
}

/* ────────────────────────────────────────────────────────────────────────
 * Backend payload contract  (spec §8)
 * ──────────────────────────────────────────────────────────────────────── */

export type Verdict = 'ENTRY' | 'SEEN' | 'ALLOWED' | 'NOT_OBSERVED' | 'BLOCKED';
export type Severity = 'critical' | 'high' | 'medium' | 'low';

export interface MovementHop {
  node_id: string;
  node_type: string; // Internet | SecurityGroup | EC2Instance | IAMRole | S3Bucket | ...
  verdict: Verdict;
  subnet_id?: string;
  az?: string;
  is_crown_jewel?: boolean;
  actions?: string[];
  evidence?: Record<string, unknown>;
}

export interface ConstraintEdge {
  constraint_node_id: string;
  constraint_node_type: 'KMSKey' | 'SCP' | 'ResourcePolicy' | 'TrustPolicy' | string;
  /** Frontend dispatches on this, NOT on node type (§4.4). */
  appears_as: 'constraint' | 'terminus';
  /** "{src}→{dst}" — the movement edge this constraint gates. */
  gates_movement_edge: string;
  verdict: Verdict;
  severity: Severity;
  expires_at: string | null;
  evidence?: Record<string, unknown>;
}

export interface AttackMapPayload {
  system: string;
  path_id: string;
  score: number;
  severity: string;
  movement_chain: MovementHop[];
  constraint_edges: ConstraintEdge[];
  blast: {
    crown_jewels_reachable: number;
    shared_workloads: string[];
    role_reachable_jewels?: Array<{
      cj_arn: string;
      cj_name: string;
      cj_type: string;
      severity: number;
      basis: "observed" | "config";
      via_workloads: string[];
      path_ids: string[];
    }>;
    assume_edges?: Array<{
      target_role_arn: string;
      target_role_name?: string | null;
      basis: "observed" | "config";
      observed_count?: number | null;
      last_seen?: string | null;
    }>;
  };
  fix?: Record<string, unknown>;
  collection_gaps?: string[];
}

/* A movement edge is the (src → dst) pair between two consecutive hops. */
export interface MovementEdge {
  src: string;
  dst: string;
  src_index: number;
  dst_index: number;
}

/* ────────────────────────────────────────────────────────────────────────
 * Topology contract  (spec §3.3, #183 `?shape=full`)
 *
 * This is the FULL template: geometry + groups + capacity + jewel column.
 * The graph compiler consumes a strict minimal projection of the same builder
 * (subnet_ids + per-node (subnet_id, az, group_id) only) — compiler spec §4.3.1.
 * ──────────────────────────────────────────────────────────────────────── */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SubnetBox extends Box {
  id: string;
  az: string;
  kind: 'public' | 'private';
}

export interface GroupBox extends Box {
  id: string;
  subnet_id: string;
  /** ASG > SG cluster > raw subnet, in that resolution order (§4.1.2). */
  kind: 'asg' | 'sg_cluster' | 'subnet_raw';
  /** max tiles before the box enlarges (§5 invariant 8). */
  capacity: number;
}

export interface JewelColumn {
  /** x of the first (right-most) column; overflow columns step left (§4.5). */
  x: number;
  top_y: number;
  row_height: number;
  col_step: number;
  capacity: number; // rows per column
  max_columns: number; // hard cap = 3 (§4.5)
}

/** Background population — every resource and crown jewel in the system,
 * not just chain hops. The renderer draws muted ghost tiles so AZ/subnet
 * containers carry visible context instead of looking empty. */
export interface TopologyResource {
  node_id: string;
  node_type: string;
  name: string | null;
  subnet_id: string;
  az: string;
  group_id: string;
}

export interface TopologyCrownJewel {
  node_id: string;
  node_type: string;
  name: string | null;
  column_index: number;
  row_index: number;
}

export interface TopologySnapshot {
  system: string;
  vpc: Box;
  subnets: Record<string, SubnetBox>;
  groups: Record<string, GroupBox>;
  /** node_id → structural anchor. Mirrors the compiler's minimal projection. */
  membership: Record<string, { subnet_id?: string; az?: string; group_id?: string }>;
  /** All system resources — populates background tiles. Empty array OK. */
  resources: TopologyResource[];
  /** All crown jewels — populates jewel column even when off-chain. Empty OK. */
  crown_jewels: TopologyCrownJewel[];
  crown_jewel_column: JewelColumn;
  /** quarantine lane for nodes the template cannot place (§5 invariant 10/11). */
  drift_lane: Box;
  orphan_lane: Box;
  /** fixed slots for Internet / 0.0.0.0/0 / on-prem above the VPC (§4.7). */
  external_slots: Record<string, { x: number; y: number }>;
  /** vertical boundary lines for cross-account chains (§4.6). */
  account_boundaries?: Record<string, { x: number; top_y: number; bottom_y: number }>;
}

export interface DensityRules {
  jewel_column_capacity: number;
  tile_w: number;
  tile_h: number;
  tile_gap: number;
  /** tiles per row inside a group box before wrapping. */
  tiles_per_row: number;
}

export interface Context {
  topology: TopologySnapshot;
  /** ordered movement hops, from /attack-path/{id} */
  chain: MovementHop[];
  /** this node's index in `chain` (constraint nodes pass -1) */
  hop_index: number;
  movement_edges: MovementEdge[];
  constraint_edges: ConstraintEdge[];
  /** history-aware stability: prior Positions keyed by node_id */
  prior_renders?: Map<string, Position>;
  /** operator-pinned Positions keyed by node_id */
  operator_pins?: Map<string, Position>;
  density: DensityRules;
}

export type GraphNode = MovementHop;

const Z_BASE = 100;

/* ────────────────────────────────────────────────────────────────────────
 * Deterministic hash (FNV-1a, 32-bit). No randomness. (§5 invariant 1)
 * ──────────────────────────────────────────────────────────────────────── */

export function stableHash(...parts: string[]): number {
  let h = 0x811c9dc5;
  const s = parts.join('');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/* ────────────────────────────────────────────────────────────────────────
 * Node classification
 * ──────────────────────────────────────────────────────────────────────── */

const TILE_TYPES = new Set(['EC2Instance', 'Lambda', 'ECSTask', 'RDS', 'ALB', 'NAT', 'VPCE']);
const FOOTHOLD_TYPES = new Set(['EC2Instance', 'Lambda', 'ECSTask']);
const JEWEL_TYPES = new Set(['S3Bucket', 'DynamoDBTable', 'Secret']);
const EXTERNAL_TYPES = new Set(['Internet', 'OnPrem']);

/* ────────────────────────────────────────────────────────────────────────
 * Sub-resolver 1 — resolveTopologySlot  (§3.1, §4)
 * Owns (x, y), anchor_kind, base slot_id, placement_provenance, fallback.
 * This is the geometric ground truth — the chain never moves a node.
 * ──────────────────────────────────────────────────────────────────────── */

export function resolveTopologySlot(node: GraphNode, ctx: Context): Position {
  const t = ctx.topology;

  // §4.7 external actors — fixed slot above the VPC
  if (EXTERNAL_TYPES.has(node.node_type) || node.node_id === '0.0.0.0/0') {
    const kind = node.node_id === '0.0.0.0/0' ? 'open_cidr' : node.node_type.toLowerCase();
    const s = t.external_slots[kind] ?? t.external_slots['internet'] ?? { x: t.vpc.x + t.vpc.w / 2, y: t.vpc.y - 80 };
    return base(s.x, s.y, 'L0_vpc', 'tile', `external_${kind}`, 'hash');
  }

  // §4.5 crown jewels — right-edge jewel column
  if (node.is_crown_jewel || JEWEL_TYPES.has(node.node_type)) {
    return resolveJewel(node, ctx);
  }

  // §4.3 IAM identity strip
  if (node.node_type === 'IAMRole' || node.node_type === 'InstanceProfile') {
    return resolveIdentityStrip(node, ctx);
  }

  // §4.2 SecurityGroup — label on group box border
  if (node.node_type === 'SecurityGroup') {
    return resolveSgLabel(node, ctx);
  }

  // §4.1 resource tiles
  if (TILE_TYPES.has(node.node_type)) {
    return resolveResourceTile(node, ctx);
  }

  // Unknown type with a subnet → still try the subnet; else drift lane (§6).
  if (node.subnet_id && t.subnets[node.subnet_id]) {
    const sub = t.subnets[node.subnet_id];
    return base(sub.x + 8, sub.y + 8, 'L3_resource', 'tile', `${sub.az}.${sub.id}.unmapped.${node.node_id}`, 'hash');
  }
  return driftLane(node, ctx);
}

/* §4.1 resource tiles — history-aware placement (the determinism mechanism) */
function resolveResourceTile(node: GraphNode, ctx: Context): Position {
  const t = ctx.topology;
  const subnetId = node.subnet_id ?? t.membership[node.node_id]?.subnet_id;
  const subnet = subnetId ? t.subnets[subnetId] : undefined;
  if (!subnet) return driftLane(node, ctx, 'unknown_subnet'); // §6

  const groupId = t.membership[node.node_id]?.group_id ?? `${subnet.id}.raw`;
  // Cross-subnet group leak guard: the backend's TopologySnapshot v1 keeps
  // sg-cluster ids globally unique by name, not by (subnet, name) — so the
  // same `sg-cluster-XYZ` id can resolve to one AZ's geometry while the
  // resource declares another AZ. If that mismatch happens, treat as if
  // the group is missing and fall back to the resource's own subnet-raw
  // area. Without this, AZ 1A's resources visibly land inside AZ 1C.
  const candidate = t.groups[groupId];
  const groupMatchesSubnet = candidate && candidate.subnet_id === subnet.id;
  const group: GroupBox =
    (groupMatchesSubnet ? candidate : undefined) ??
    ({ id: `${subnet.id}.raw`, subnet_id: subnet.id, x: subnet.x + 8, y: subnet.y + 8, w: subnet.w - 16, h: subnet.h - 16, kind: 'subnet_raw', capacity: ctx.density.tiles_per_row * 4 } as GroupBox);

  const anchorKey = `${subnet.az}|${subnet.id}|${group.id}`;

  // (a) prior render — valid ONLY if structural anchor (az, subnet, group) is unchanged
  //     and the prior tile index still fits current capacity (§4.1.3 binding).
  const prior = ctx.prior_renders?.get(node.node_id);
  if (prior && priorAnchorMatches(prior, anchorKey, group)) {
    return { ...prior, placement_provenance: 'prior_render' };
  }

  // (b) operator pin — only for the CURRENT structural anchor; stale pins are surfaced, not honored.
  const pin = ctx.operator_pins?.get(node.node_id);
  if (pin && priorAnchorMatches(pin, anchorKey, group)) {
    return { ...pin, placement_provenance: 'operator_pinned' };
  }

  // (c) hash — deterministic tile index within the group box.
  const tileIndex = stableHash(group.id, node.node_id) % Math.max(1, group.capacity);
  const { x, y } = tileXY(group, tileIndex, ctx.density);
  const slotId = `${subnet.az}.${subnet.id}.${group.id}.tile_${tileIndex}`;
  return base(x, y, 'L3_resource', 'tile', slotId, 'hash');
}

/** A prior/pinned Position is valid only when its slot_id encodes the same (az.subnet.group). */
function priorAnchorMatches(pos: Position, anchorKey: string, group: GroupBox): boolean {
  const [az, subnet, grp] = anchorKey.split('|');
  const expectedPrefix = `${az}.${subnet}.${grp}.tile_`;
  if (!pos.slot_id.startsWith(expectedPrefix)) return false;
  const idx = Number(pos.slot_id.slice(expectedPrefix.length));
  return Number.isInteger(idx) && idx < group.capacity; // capacity shrank below index → invalid
}

function tileXY(group: GroupBox, tileIndex: number, d: DensityRules): { x: number; y: number } {
  const col = tileIndex % d.tiles_per_row;
  const row = Math.floor(tileIndex / d.tiles_per_row);
  return {
    x: group.x + 8 + col * (d.tile_w + d.tile_gap),
    y: group.y + 8 + row * (d.tile_h + d.tile_gap),
  };
}

/* §4.2 SecurityGroup — anchored as a label on the first chain-touched resource's group box */
function resolveSgLabel(node: GraphNode, ctx: Context): Position {
  const t = ctx.topology;
  // first chain resource attached to this SG, via movement edges
  const attached = ctx.movement_edges.find((e) => e.src === node.node_id || e.dst === node.node_id);
  const resourceId = attached ? (attached.src === node.node_id ? attached.dst : attached.src) : undefined;
  const groupId = resourceId ? t.membership[resourceId]?.group_id : undefined;
  const group = groupId ? t.groups[groupId] : undefined;
  if (!group) return driftLane(node, ctx, 'orphan_identity'); // SG on chain, no attached resource (§4.2)
  return base(group.x, group.y - 14, 'L2_group', 'label', `${group.id}.sg_label.${node.node_id}`, 'hash');
}

/* §4.3 IAMRole / InstanceProfile — identity strip below the foothold's subnet, per-chain (shared-role) */
function resolveIdentityStrip(node: GraphNode, ctx: Context): Position {
  const t = ctx.topology;
  // foothold = first EC2/Lambda/ECSTask upstream of this role in the chain
  let foothold: MovementHop | undefined;
  for (let i = ctx.hop_index - 1; i >= 0; i--) {
    if (FOOTHOLD_TYPES.has(ctx.chain[i]?.node_type)) {
      foothold = ctx.chain[i];
      break;
    }
  }
  const subnetId = foothold?.subnet_id ?? (foothold ? t.membership[foothold.node_id]?.subnet_id : undefined);
  const subnet = subnetId ? t.subnets[subnetId] : undefined;
  if (!subnet) return driftLane(node, ctx, 'orphan_identity'); // §6 orphan lane

  // full-width strip directly below the foothold's subnet; slot scoped per-chain via hop_index (§4.3, invariant 4)
  const x = subnet.x;
  const y = subnet.y + subnet.h + 6;
  const slotId = `${subnet.az}.${subnet.id}.identity_strip.${ctx.hop_index}`;
  return base(x, y, 'L4_identity', 'strip', slotId, 'hash');
}

/* §4.5 crown jewel — jewel column, vertical by hop progression, overflow left (max 3 cols) */
function resolveJewel(node: GraphNode, ctx: Context): Position {
  const col = ctx.topology.crown_jewel_column;
  const cap = ctx.density.jewel_column_capacity || col.capacity;
  // row by hop progression (later hops sit lower); off-chain jewels still get a deterministic row
  const order = ctx.hop_index >= 0 ? ctx.hop_index : (stableHash('jewel', node.node_id) % cap);
  let colIndex = Math.floor(order / cap);
  let row = order % cap;
  if (colIndex >= col.max_columns) {
    // beyond cap: clamp into last column, loud-but-placed (renderer can mark overflow)
    colIndex = col.max_columns - 1;
    row = order % cap;
  }
  const x = col.x - colIndex * col.col_step;
  const y = col.top_y + row * col.row_height;
  return base(x, y, 'L3_resource', 'jewel', `jewel_col_${colIndex}.row_${row}`, 'hash');
}

/* §6 / invariant 10–11 — quarantine lane. Loud, never crashes, never on-chain for scoring. */
function driftLane(node: GraphNode, ctx: Context, fb: Fallback = 'graph_drift'): Position {
  const lane = fb === 'orphan_identity' ? ctx.topology.orphan_lane : ctx.topology.drift_lane;
  const slot = stableHash(fb, node.node_id) % 12;
  const x = lane.x + (slot % 4) * (ctx.density.tile_w + ctx.density.tile_gap);
  const y = lane.y + Math.floor(slot / 4) * (ctx.density.tile_h + ctx.density.tile_gap);
  const p = base(x, y, 'L3_resource', fb === 'orphan_identity' ? 'orphan' : 'tile', `drift.${fb}.${node.node_id}`, 'fallback');
  p.fallback = fb;
  return p;
}

function base(
  x: number,
  y: number,
  layer: Layer,
  anchor_kind: AnchorKind,
  slot_id: string,
  placement_provenance: PlacementProvenance,
): Position {
  return { x, y, layer, z_index: Z_BASE, slot_id, anchor_kind, placement_provenance };
}

/* ────────────────────────────────────────────────────────────────────────
 * Sub-resolver 2 — resolveChainPosition  (§3.1)
 * Owns z_index, animation order, slot_id suffix. NEVER moves (x, y).
 * ──────────────────────────────────────────────────────────────────────── */

export function resolveChainPosition(node: GraphNode, ctx: Context, topo: Position): Position {
  if (ctx.hop_index < 0) return topo; // off-chain (constraint / greyed jewel)
  return { ...topo, z_index: Z_BASE + ctx.hop_index };
}

/* ────────────────────────────────────────────────────────────────────────
 * Sub-resolver 3 — resolveConstraintPlacement  (§3.1, §4.4)
 * Owns band placement on a movement edge + chip ordering. NEVER moves nodes.
 * Constraint nodes get their real Position here (band on gated edge).
 * ──────────────────────────────────────────────────────────────────────── */

export function resolveConstraintPlacement(node: GraphNode, ctx: Context, chained: Position): Position {
  const entry = ctx.constraint_edges.find((c) => c.constraint_node_id === node.node_id);
  if (!entry || entry.appears_as !== 'constraint') return chained; // non-constraint / terminus → pass through

  // §6: free-floating constraint (no gated edge) is dropped upstream; defensive fallback here.
  if (!entry.gates_movement_edge || !entry.gates_movement_edge.includes('→')) {
    const p = driftLane(node, ctx, 'graph_drift');
    return p;
  }
  const [src, dst] = entry.gates_movement_edge.split('→');
  const mid = edgeMidpoint(src.trim(), dst.trim(), ctx);
  return {
    x: mid.x,
    y: mid.y,
    layer: 'L6_constraint',
    z_index: Z_BASE + 40, // above flow (L5), below halos (L7)
    slot_id: `edge_${src.trim()}_${dst.trim()}.constraint.${entry.constraint_node_type}`,
    anchor_kind: 'band',
    placement_provenance: 'hash',
  };
}

function edgeMidpoint(src: string, dst: string, ctx: Context): { x: number; y: number } {
  const a = resolvePlacedHop(src, ctx);
  const b = resolvePlacedHop(dst, ctx);
  if (a && b) return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  if (a) return { x: a.x, y: a.y };
  if (b) return { x: b.x, y: b.y };
  // both ends unplaceable → drift coordinate (loud)
  return { x: ctx.topology.drift_lane.x, y: ctx.topology.drift_lane.y };
}

function resolvePlacedHop(nodeId: string, ctx: Context): Position | undefined {
  const idx = ctx.chain.findIndex((h) => h.node_id === nodeId);
  if (idx < 0) return undefined;
  const node = ctx.chain[idx];
  const subCtx: Context = { ...ctx, hop_index: idx };
  return resolveChainPosition(node, subCtx, resolveTopologySlot(node, subCtx));
}

/* ────────────────────────────────────────────────────────────────────────
 * Composition  (§3.1) — the public entry point.
 * ──────────────────────────────────────────────────────────────────────── */

export function slot(node: GraphNode, ctx: Context): Position {
  const topo = resolveTopologySlot(node, ctx);
  const chain = resolveChainPosition(node, ctx, topo);
  const final = resolveConstraintPlacement(node, ctx, chain);
  return final;
}

/* ────────────────────────────────────────────────────────────────────────
 * Constraint compression  (§4.4, invariant 7) — pure, severity-sorted, top-2 + "+N".
 * The frontend NEVER invents severity; it only sorts by backend-declared values.
 * ──────────────────────────────────────────────────────────────────────── */

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export interface CompressedConstraint {
  edge: string;
  node_type: string;
  count: number;
  severity: Severity;
  expired: boolean;
  entries: ConstraintEdge[];
}

export interface CompressedEdge {
  edge: string;
  visible: CompressedConstraint[]; // top 2
  overflow: number; // "+N more"
}

export function compressConstraintsForEdge(
  edge: string,
  constraints: ConstraintEdge[],
  now: Date,
): CompressedEdge {
  // merge same node_type into one chip with merged count + highest severity
  const byType = new Map<string, ConstraintEdge[]>();
  for (const c of constraints) {
    const arr = byType.get(c.constraint_node_type) ?? [];
    arr.push(c);
    byType.set(c.constraint_node_type, arr);
  }
  const merged: CompressedConstraint[] = [...byType.entries()].map(([node_type, entries]) => {
    const severity = entries
      .map((e) => e.severity)
      .sort((a, b) => SEVERITY_RANK[a] - SEVERITY_RANK[b])[0];
    const expired = entries.every((e) => e.expires_at != null && new Date(e.expires_at) < now);
    return { edge, node_type, count: entries.length, severity, expired, entries };
  });

  // sort by severity desc, node_type alphabetical tiebreak (§4.4)
  merged.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.node_type.localeCompare(b.node_type));

  return { edge, visible: merged.slice(0, 2), overflow: Math.max(0, merged.length - 2) };
}

/* ────────────────────────────────────────────────────────────────────────
 * Helpers for the renderer (#185) — derive movement edges from a chain.
 * ──────────────────────────────────────────────────────────────────────── */

export function deriveMovementEdges(chain: MovementHop[]): MovementEdge[] {
  const edges: MovementEdge[] = [];
  for (let i = 0; i < chain.length - 1; i++) {
    edges.push({ src: chain[i].node_id, dst: chain[i + 1].node_id, src_index: i, dst_index: i + 1 });
  }
  return edges;
}

/**
 * Place every node in a payload. Pure. Returns Positions keyed by node_id.
 * Movement nodes use their chain index; constraint nodes pass hop_index = -1
 * and get band placement from resolveConstraintPlacement.
 */
export function layoutPayload(
  payload: AttackMapPayload,
  topology: TopologySnapshot,
  density: DensityRules,
  prior_renders?: Map<string, Position>,
  operator_pins?: Map<string, Position>,
): Map<string, Position> {
  const movement_edges = deriveMovementEdges(payload.movement_chain);
  const out = new Map<string, Position>();

  payload.movement_chain.forEach((node, hop_index) => {
    const ctx: Context = {
      topology,
      chain: payload.movement_chain,
      hop_index,
      movement_edges,
      constraint_edges: payload.constraint_edges,
      prior_renders,
      operator_pins,
      density,
    };
    out.set(node.node_id, slot(node, ctx));
  });

  // constraint nodes (appears_as: 'constraint') → band placement on gated edge
  for (const c of payload.constraint_edges) {
    if (c.appears_as !== 'constraint') continue;
    const pseudo: GraphNode = { node_id: c.constraint_node_id, node_type: c.constraint_node_type, verdict: c.verdict };
    const ctx: Context = {
      topology,
      chain: payload.movement_chain,
      hop_index: -1,
      movement_edges,
      constraint_edges: payload.constraint_edges,
      prior_renders,
      operator_pins,
      density,
    };
    out.set(c.constraint_node_id, slot(pseudo, ctx));
  }

  return out;
}
