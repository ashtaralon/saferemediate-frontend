/**
 * Estate Map placement registry — AWS architecture-diagram layout.
 *
 * Contract:
 * - Only Neo4j-backed TopologyNode types are placed. This file never fabricates
 *   chips; it only answers "if this type appears in the payload, which slot?".
 * - Empty slots stay empty when the account has no nodes of that type.
 * - Adding a customer service later = one registry row + icon slug.
 *
 * Slots mirror AWS reference architectures (VPC AZ×tier grid, boundary
 * gateways, regional services outside the VPC) — not the AWS Console sidebar.
 */

import type { SubnetTier } from "./types"

/**
 * Where a node lands on the Estate Map canvas.
 *
 * Ten slots, each mirroring one group of AWS's own architecture grammar
 * (docs/aws-map-presentation.md §2). A type carries EXACTLY ONE slot; the
 * catalog (`aws-architecture-icons.ts`) keeps a separate `scope` — what AWS
 * says the service IS — and `__tests__/topology-aws-presentation-catalog.test.ts`
 * holds the two in agreement. Every catalog type must resolve to a DECLARED
 * rule here: `hidden` is still what an unknown type gets by default, but for
 * a known type it is a decision written down, not a fall-through, and
 * `placementRuleForType` tells the two apart.
 */
export type MapSlot =
  | "external" // off-estate: Internet, customer gateway — payload sentinels, never a grid chip
  | "global" // inside AWS Cloud, above the Region: Route 53 (chips), drawn only with content
  | "ingress" // ALB / API GW — spanning band above AZ grid
  | "web" // public / edge compute in VPC
  | "app" // private compute in VPC
  | "data" // datastores in VPC
  | "boundary" // IGW / NAT / VPCE / EIP / VPN / peering — straddle the VPC edge (drawn from vpc_topology.edges)
  | "serverless" // column 1 body: runs outside the subnet grid (non-VPC Lambda)
  | "triggers" // column 1 band: what INVOKES the serverless lane — EventBridge / SQS / SNS / Step Functions
  | "regional" // column 2: terminal services reached over the service plane — S3 / DDB / KMS / Secrets / CloudTrail / Logs
  | "container" // frames, never nodes: VPC / Subnet / Security Group / NACL / route table / account
  | "hidden" // identity / config artifacts — Inventory / panels only (and the default for an unknown type)

/**
 * Slots that never draw a chip in this frame's AZ x tier grid. The grid
 * treats every one of them as "drawn elsewhere or by design" rather than as
 * this frame's gap — a boundary device is drawn from `vpc_topology.edges`, a
 * rail type by its lane, a container as a frame, a global/external node by the
 * band that owns it (the global band renderer is Map v3 task T5).
 */
export const OFF_GRID_SLOTS: ReadonlySet<MapSlot> = new Set<MapSlot>([
  "external",
  "global",
  "boundary",
  "serverless",
  "triggers",
  "regional",
  "container",
  "hidden",
])

export type PlacementRule = {
  /** TopologyNode.type spellings (short + long). */
  types: readonly string[]
  slot: MapSlot
  /** Glance: collapse siblings of this type into one stack. */
  stack?: boolean
  /** Glance visual weight. */
  chipRole?: "gateway" | "anchor" | "volume"
}

/**
 * Canonical type → slot map. Order within a slot does not matter.
 * Keep aliases (EC2 / EC2Instance) together so BE short names and legacy
 * labels both resolve.
 */
export const PLACEMENT_RULES: readonly PlacementRule[] = [
  // ── Ingress band ──────────────────────────────────────────────
  {
    types: [
      "LoadBalancer",
      "ALB",
      "ApplicationLoadBalancer",
      "NLB",
      "NetworkLoadBalancer",
      "GatewayLoadBalancer",
      "APIGateway",
      "ApiGateway",
      "APIGATEWAY",
    ],
    slot: "ingress",
    stack: false,
    chipRole: "gateway",
  },
  // ── VPC web tier ──────────────────────────────────────────────
  {
    types: ["AutoScalingGroup", "ASG", "TargetGroup"],
    slot: "web",
    stack: true,
    chipRole: "anchor",
  },
  // ── VPC app tier (default for EC2 when subnet tier unknown) ───
  {
    types: [
      "EC2", "EC2Instance",
      "ECS", "ECSCluster", "ECSService", "ECSTask", "Fargate",
      // A cluster's control plane is regional; its compute is not. Nodes and
      // pods carry ENIs in subnets you chose (docs §2), so the whole K8s
      // family is subnet-placed — by the subnet the graph resolves, or not
      // at all.
      "EKS", "EKSCluster", "K8sCluster", "K8sPod",
    ],
    slot: "app",
    stack: true,
    chipRole: "anchor",
  },
  // ── VPC data tier ─────────────────────────────────────────────
  {
    types: [
      "RDS",
      "RDSInstance",
      "RDSCluster",
      // Neptune, DocumentDB and Redshift are VPC-bound databases like RDS.
      // Without a rule their slot resolved to "hidden" and they reached the
      // data tier only because the subnet grid places by subnet id (C1
      // production QA, 2026-09-02: two Neptune writers).
      "Neptune",
      "NeptuneCluster",
      "NeptuneInstance",
      "NeptuneDBCluster",
      "DocumentDB",
      "DocumentDBCluster",
      "DocumentDBInstance",
      "DocDB",
      "DocDBCluster",
      "DocDBInstance",
      "NeptuneGraph",
      // Bare RDS API nouns some collectors still emit.
      "DBInstance",
      "DBCluster",
      "Redshift",
      "RedshiftCluster",
      // ElastiCache nodes and EFS mount targets are ENIs in the subnets of a
      // subnet group — AWS draws both inside the private/data subnet, never on
      // the regional rail. Today the graph holds them only as ENI-owner stubs
      // (backend `check_estate_map_admission` classifies them NEEDS_COLLECTOR),
      // so the slot is declared ahead of the collector: the day one writes a
      // real node, it lands here instead of in "type-unrecognized".
      "ElastiCache",
      "ElastiCacheCluster",
      "EFS",
      "EFSFileSystem",
    ],
    slot: "data",
    stack: true,
    chipRole: "anchor",
  },
  // ── Serverless rail (no subnet) ───────────────────────────────
  {
    types: ["Lambda", "LambdaFunction"],
    slot: "serverless",
    stack: true,
    chipRole: "volume",
  },
  // ── Triggers band (sits above the serverless lane) ────────────
  // These are not destinations the way S3/DDB are -- they are what INVOKES
  // the Lambda lane, so they read as a source band above it rather than as
  // another terminal node on the regional rail. Splitting the slot is what
  // lets the fan-out draw once from a band instead of once per rail chip.
  {
    types: [
      "EventBridge",
      "EventBridgeRule",
      "EventBridgeTarget",
      "EventSource",
      "EventBus",
      "SQS",
      "SQSQueue",
      // An SNS topic delivers to subscribers — it invokes, like a queue or a
      // rule, so it belongs in the band that fans out, not among the terminal
      // data services.
      "SNS",
      "SNSTopic",
      "StepFunction",
      "StateMachine",
    ],
    slot: "triggers",
    stack: true,
    chipRole: "volume",
  },
  // ── Regional rail (not VPC-bound): column 2, terminal services ───
  {
    types: [
      "S3",
      "S3Bucket",
      "DynamoDB",
      "DynamoDBTable",
      "KMSKey",
      "Secret",
      "SecretsManagerSecret",
      // Platform services the graph can carry for a system. Cataloged as
      // `regional` for a long time while no rule named them, so they resolved
      // to `hidden` BY DEFAULT — indistinguishable from a type nobody knows.
      "CloudTrail",
      "CloudTrailTrail",
      "CloudWatchLogGroup",
      "AthenaWorkgroup",
    ],
    slot: "regional",
    stack: true,
    chipRole: "volume",
  },
  // ── Global: inside AWS Cloud, above the Region ────────────────────
  // Route 53 is the one global service a system's graph can name today.
  // The IAM family is also global in AWS's grammar but stays `hidden`: an
  // identity is drawn where it participates (a path, a panel), never as a
  // chip in a band — listing every role above the region would bury the map.
  {
    types: ["Route53", "Domain"],
    slot: "global",
    stack: true,
    chipRole: "volume",
  },
  // ── VPC boundary: straddles the VPC edge ────────────────────────
  // Drawn from `vpc_topology.edges` (igws / nat_gws / vpces) by the frame's
  // boundary strip, not from nodes[]. Declared so a boundary device that ever
  // arrives as a node is recognised as "drawn on the edge", not as a gap.
  {
    types: [
      "InternetGateway", "IGW",
      "NATGateway", "NAT", "NatGateway",
      "VPCEndpoint", "VPCE",
      "EIP",
      "VPNGateway",
      "VPCPeering",
      "EICEndpoint",
    ],
    slot: "boundary",
    stack: false,
    chipRole: "gateway",
  },
  // ── Containers: frames, never nodes ────────────────────────────
  {
    types: [
      "VPC",
      "Subnet",
      "SecurityGroup",
      "NACL", "NetworkACL",
      "RouteTable",
      "Account", "AWSAccount",
    ],
    slot: "container",
    stack: false,
  },
  // ── Off-estate ────────────────────────────────────────────────
  {
    types: ["Internet", "CustomerGateway"],
    slot: "external",
    stack: false,
  },
  // ── Hidden BY DECISION: Inventory and panels only ──────────────
  // Identities, credentials and configuration artifacts. Each is a known
  // type with a catalog entry; none is a place on the map. Declaring them
  // here is what lets `isOffCanvasByDesign` tell "we chose not to draw this"
  // from "no rule knows this" — both used to return the default `hidden`.
  {
    types: [
      "IAMRole", "IAMPolicy", "IAMUser", "InstanceProfile", "STSSession",
      "Organization", "SCP",
      "LaunchTemplate", "TaskDefinition", "LoadBalancerListener",
      "S3Prefix", "ConfigRule", "SSMAssociation", "SSMStateManagerAssociation",
      "FlowLogs",
      // Plumbing the topology endpoint deliberately never serves (docs §7);
      // if it ever did, the grid's subnet-id path would place it.
      "NetworkInterface", "ENI",
    ],
    slot: "hidden",
    stack: false,
  },
] as const

const TYPE_TO_RULE: Map<string, PlacementRule> = (() => {
  const m = new Map<string, PlacementRule>()
  for (const rule of PLACEMENT_RULES) {
    for (const t of rule.types) m.set(t, rule)
  }
  return m
})()

export function placementRuleForType(type: string | null | undefined): PlacementRule | null {
  if (!type) return null
  return TYPE_TO_RULE.get(type) ?? null
}

export function mapSlotForType(type: string | null | undefined): MapSlot {
  return placementRuleForType(type)?.slot ?? "hidden"
}

/** Types that live on the regional right rail. */
export const REGIONAL_EDGE_SERVICE_TYPES: ReadonlySet<string> = new Set(
  PLACEMENT_RULES.filter(r => r.slot === "regional").flatMap(r => [...r.types]),
)

/** Types drawn in the triggers band above the serverless lane. */
export const TRIGGER_TYPES: ReadonlySet<string> = new Set(
  PLACEMENT_RULES.filter(r => r.slot === "triggers").flatMap(r => [...r.types]),
)

/**
 * Every type that renders on a right-hand rail instead of the AZ x tier grid.
 *
 * Read this -- NOT `REGIONAL_EDGE_SERVICE_TYPES` -- for any "is this node
 * grid-placed?" decision. Triggers split out of `regional`, and three call
 * sites asked the regional set that question: grid placement would have let an
 * EventBridge rule fall through to the unplaced bucket, and the stale rollup
 * would have listed it under "Stale workloads". Anything that means "has its
 * own rail" belongs here so the next slot split cannot silently strand a type.
 */
export const RAIL_PLACED_TYPES: ReadonlySet<string> = new Set([
  ...REGIONAL_EDGE_SERVICE_TYPES,
  ...TRIGGER_TYPES,
])

/** Types drawn in the global band above the region. */
export const GLOBAL_TYPES: ReadonlySet<string> = new Set(
  PLACEMENT_RULES.filter(r => r.slot === "global").flatMap(r => [...r.types]),
)

/** Types that straddle the VPC edge (drawn from `vpc_topology.edges`). */
export const BOUNDARY_TYPES: ReadonlySet<string> = new Set(
  PLACEMENT_RULES.filter(r => r.slot === "boundary").flatMap(r => [...r.types]),
)

/**
 * True when a type is off the canvas BY DECISION rather than for want of a
 * rule: it has a declared rule, and that rule's slot never draws a chip in
 * this frame's grid. An unknown type also resolves to `hidden`, but has no
 * rule — `placementRuleForType` returns null — so it is NOT off-canvas by
 * design; it is a gap the unplaced area must report as `type-unrecognized`.
 *
 * Serverless / triggers / regional are excluded on purpose: those types are
 * drawn, by their lanes, and the grid asks a different question about them
 * (`RAIL_PLACED_TYPES`, `SERVERLESS_TYPES`).
 */
export function isDeclaredOffCanvas(type: string | null | undefined): boolean {
  const rule = placementRuleForType(type)
  if (!rule) return false
  return (
    rule.slot === "hidden" ||
    rule.slot === "container" ||
    rule.slot === "external" ||
    rule.slot === "global" ||
    rule.slot === "boundary"
  )
}

/** Types drawn in the ingress / ALB header band. */
export const INGRESS_TYPES: ReadonlySet<string> = new Set(
  PLACEMENT_RULES.filter(r => r.slot === "ingress").flatMap(r => [...r.types]),
)

/** @deprecated alias — LoadBalancer-only name; prefer INGRESS_TYPES */
export const ALB_HEADER_TYPES = INGRESS_TYPES

/** Lambda / serverless compute types. */
export const SERVERLESS_TYPES: ReadonlySet<string> = new Set(
  PLACEMENT_RULES.filter(r => r.slot === "serverless").flatMap(r => [...r.types]),
)

export const RDS_TYPES: ReadonlySet<string> = new Set(
  PLACEMENT_RULES.filter(r => r.slot === "data").flatMap(r => [...r.types]),
)

/** Glance: types that always stack when count ≥ 2. */
export const STACK_ALWAYS_TYPES: ReadonlySet<string> = new Set(
  PLACEMENT_RULES.filter(r => r.stack).flatMap(r => [...r.types]),
)

export const GATEWAY_TYPES: ReadonlySet<string> = new Set(
  PLACEMENT_RULES.filter(r => r.chipRole === "gateway").flatMap(r => [...r.types]),
)

export const ANCHOR_TYPES: ReadonlySet<string> = new Set(
  PLACEMENT_RULES.filter(r => r.chipRole === "anchor").flatMap(r => [...r.types]),
)

/**
 * Synthetic VPC-grid tier when subnet placement is missing.
 * Only web/app/data — ingress/regional/serverless are not grid cells.
 */
export const SYNTHETIC_TIER_TYPES: Readonly<Record<string, SubnetTier>> = (() => {
  const out: Record<string, SubnetTier> = {}
  for (const rule of PLACEMENT_RULES) {
    if (rule.slot === "web" || rule.slot === "app" || rule.slot === "data") {
      for (const t of rule.types) out[t] = rule.slot
    }
  }
  return out
})()

/**
 * Types that name a GROUP of members rather than one placeable resource: a
 * target group binds instances, an auto-scaling group spans subnets, a DB
 * cluster owns its instances. None has a subnet of its own — the members do —
 * so "no subnet in the graph" is the wrong diagnosis and "run a full sync" the
 * wrong remedy (2026-09-11 review: all six unplaced C1 resources were these).
 * Reported as groups until the map draws them as brackets around their
 * members; never pinned into one cell, which would be a false structural claim.
 *
 * Matched on `resource_label` first (the graph label — a cluster and its
 * instances both project as `type: "RDS"`), then on `type` for the group types
 * that keep their own canvas type.
 */
export const LOGICAL_GROUP_TYPES: ReadonlySet<string> = new Set([
  "AutoScalingGroup",
  "ASG",
  "TargetGroup",
  "RDSCluster",
  "NeptuneCluster",
  "NeptuneDBCluster",
  "DocumentDBCluster",
  "DocDBCluster",
  "DBCluster",
])

export function isLogicalGroupNode(node: {
  type: string | null
  resource_label?: string | null
}): boolean {
  if (node.resource_label && LOGICAL_GROUP_TYPES.has(node.resource_label)) return true
  return !!node.type && LOGICAL_GROUP_TYPES.has(node.type)
}

/**
 * Resolve canvas placement for a live node.
 *
 * Order (AWS-honest, no fabrication):
 * 1. BE `placement_tier` when web|app|data
 * 2. Subnet tier from IN_SUBNET (caller supplies)
 * 3. Type registry default for VPC-grid types
 * 4. Slot from registry (ingress / serverless / regional / hidden / …)
 *
 * `vpc-conditional` (a Lambda): the catalog says a function is in a subnet
 * ONLY when its VPC config says so, and the graph carries that as
 * `subnet_ids`. So a serverless-slot type WITH a resolved subnet is placed in
 * that subnet's tier, and only a function without one goes to the runtime
 * lane. This decision used to live in the renderer
 * (`extractServerlessOutsideVpc` checked the subnet itself) while this
 * function answered "serverless" unconditionally — two answers to one
 * question. The renderer now asks here. `subnetResolved` means "a subnet with
 * an AZ", which is what the grid can actually draw; a tier of `unknown` on
 * such a subnet still places (the grid keeps the subnet's own row), so
 * `gridTier` is null there rather than a guessed tier.
 */
export function resolveNodePlacement(input: {
  type: string | null | undefined
  placementTier?: SubnetTier | null
  subnetTier?: SubnetTier | null
  /** The node names a subnet the graph resolves (with an AZ). */
  subnetResolved?: boolean
}): { slot: MapSlot; gridTier: SubnetTier | null } {
  const rule = placementRuleForType(input.type)
  const slot = rule?.slot ?? "hidden"

  if (slot === "serverless" && input.subnetResolved) {
    const tier = input.subnetTier
    if (tier === "web" || tier === "app" || tier === "data") {
      return { slot: tier, gridTier: tier }
    }
    return { slot: "app", gridTier: null }
  }

  if (slot !== "web" && slot !== "app" && slot !== "data") {
    return { slot, gridTier: null }
  }

  const explicit = input.placementTier
  if (explicit === "web" || explicit === "app" || explicit === "data") {
    return { slot, gridTier: explicit }
  }
  const fromSubnet = input.subnetTier
  if (fromSubnet === "web" || fromSubnet === "app" || fromSubnet === "data") {
    return { slot, gridTier: fromSubnet }
  }
  if (slot === "web" || slot === "app" || slot === "data") {
    return { slot, gridTier: slot }
  }
  return { slot, gridTier: null }
}
