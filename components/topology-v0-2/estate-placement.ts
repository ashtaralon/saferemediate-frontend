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

/** Where a node lands on the Estate Map canvas. */
export type MapSlot =
  | "ingress" // ALB / API GW — spanning band above AZ grid
  | "web" // public / edge compute in VPC
  | "app" // private compute in VPC
  | "data" // datastores in VPC
  | "serverless" // compute with no subnet (Lambda outside VPC)
  | "regional" // S3 / DDB / KMS / SQS / … outside VPC box
  | "boundary" // IGW / NAT / VPCE (from vpc_topology.edges, not nodes[])
  | "hidden" // identity / config artifacts — Inventory / panels only

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
    types: ["EC2", "EC2Instance", "ECS", "ECSCluster", "ECSService", "ECSTask", "EKS", "EKSCluster", "Fargate"],
    slot: "app",
    stack: true,
    chipRole: "anchor",
  },
  // ── VPC data tier ─────────────────────────────────────────────
  {
    types: ["RDS", "RDSInstance", "RDSCluster"],
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
  // ── Regional rail (outside VPC) ───────────────────────────────
  {
    types: [
      "S3",
      "S3Bucket",
      "DynamoDB",
      "DynamoDBTable",
      "KMSKey",
      "Secret",
      "SecretsManagerSecret",
      "SQS",
      "SQSQueue",
      "StepFunction",
      "StateMachine",
      "EventBridge",
      "EventBridgeRule",
    ],
    slot: "regional",
    stack: true,
    chipRole: "volume",
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
 * Resolve canvas placement for a live node.
 *
 * Order (AWS-honest, no fabrication):
 * 1. BE `placement_tier` when web|app|data
 * 2. Subnet tier from IN_SUBNET (caller supplies)
 * 3. Type registry default for VPC-grid types
 * 4. Slot from registry (ingress / serverless / regional / hidden)
 */
export function resolveNodePlacement(input: {
  type: string | null | undefined
  placementTier?: SubnetTier | null
  subnetTier?: SubnetTier | null
}): { slot: MapSlot; gridTier: SubnetTier | null } {
  const rule = placementRuleForType(input.type)
  const slot = rule?.slot ?? "hidden"

  if (slot === "ingress" || slot === "serverless" || slot === "regional" || slot === "hidden" || slot === "boundary") {
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
