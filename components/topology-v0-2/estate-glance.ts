/**
 * Estate Map · Glance density — generic, data-driven presentation rules.
 *
 * Contract:
 * - Works for any system with the topology-risk / Neo4j node contract.
 * - Renders only real TopologyNode / edge metadata passed in — never fabricates
 *   resources, counts, or placement.
 * - Mutual services of the same type collapse to ONE stack icon with depth
 *   (Lambda × N, ASG × N, EC2 × N) — not every sibling drawn separately.
 * - Inventory = expand stack / full cards.
 */

import type { TopologyNode } from "./types"
import { awsServiceLabel } from "./aws-architecture-icons"

export type ViewDensity = "glance" | "inventory"

export type ChipRole = "gateway" | "anchor" | "volume"

export type ChipSize = "gateway" | "medium" | "compact"

/**
 * Types that always collapse to a single stack icon when count ≥ 2
 * (AWS diagram convention: one Lambda / ASG / EC2 group with siblings behind).
 */
const STACK_ALWAYS_TYPES = new Set([
  "Lambda",
  "LambdaFunction",
  "AutoScalingGroup",
  "ASG",
  "EC2",
  "ECS",
  "ECSService",
  "ECSCluster",
  "EKS",
  "EKSCluster",
  "S3",
  "S3Bucket",
  "DynamoDB",
  "DynamoDBTable",
  "KMSKey",
  "Secret",
  "SecretsManagerSecret",
  "EventBridge",
  "EventBridgeRule",
  "SQS",
  "SQSQueue",
  "StepFunction",
  "TargetGroup",
])

/** Max distinct *named* gateway/jewel chips before everything else stacks by type. */
export const GLANCE_NAMED_CAP = 2

/** Rails (serverless / regional) always group in Glance when count exceeds this. */
export const GLANCE_RAIL_STACK_THRESHOLD = 1

const GATEWAY_TYPES = new Set([
  "LoadBalancer",
  "ALB",
  "ApplicationLoadBalancer",
  "NLB",
  "NetworkLoadBalancer",
  "GatewayLoadBalancer",
])

const ANCHOR_TYPES = new Set([
  "EC2",
  "RDS",
  "RDSInstance",
  "ECS",
  "ECSService",
  "ECSCluster",
  "EKS",
  "EKSCluster",
  "AutoScalingGroup",
  "ASG",
  "TargetGroup",
  "APIGateway",
])

/** Classify a real node for Glance visual hierarchy. Unknown types → volume. */
export function chipRole(node: TopologyNode): ChipRole {
  const t = node.type ?? ""
  if (GATEWAY_TYPES.has(t)) return "gateway"
  if (ANCHOR_TYPES.has(t)) return "anchor"
  return "volume"
}

export function chipSizeForRole(role: ChipRole): ChipSize {
  if (role === "gateway") return "gateway"
  if (role === "anchor") return "medium"
  return "compact"
}

function scoreValue(n: TopologyNode): number {
  return n.score?.value ?? -1
}

/** Stable ops-friendly order: jewels → gateways → anchors → volume, then risk, then name. */
export function sortForGlance(nodes: TopologyNode[]): TopologyNode[] {
  const roleRank = (r: ChipRole) => (r === "gateway" ? 0 : r === "anchor" ? 1 : 2)
  return [...nodes].sort((a, b) => {
    if (!!b.is_jewel !== !!a.is_jewel) return a.is_jewel ? -1 : 1
    const rr = roleRank(chipRole(a)) - roleRank(chipRole(b))
    if (rr !== 0) return rr
    const sv = scoreValue(b) - scoreValue(a)
    if (sv !== 0) return sv
    return (a.name ?? a.id).localeCompare(b.name ?? b.id)
  })
}

export type ServiceStack = {
  /** Node type key (real type string from graph). */
  type: string
  /** Short AWS-style label. */
  label: string
  /** All real members — count is never fabricated. */
  nodes: TopologyNode[]
  /** Representative shown on top of the stack (jewel / highest risk / first). */
  representative: TopologyNode
  criticalCount: number
}

export type GlanceCellPlan = {
  /**
   * Distinct visual units for the cell.
   * - Single unique gateway/jewel may appear as a 1-node "stack" (no depth).
   * - Mutual Lambdas / EC2s / ASGs → one stack with depth ≥ 2.
   */
  stacks: ServiceStack[]
}

function pickRepresentative(nodes: TopologyNode[]): TopologyNode {
  return (
    nodes.find(n => n.is_jewel) ??
    nodes.find(n => n.score?.tier === "WORST") ??
    nodes.find(n => n.score?.tier === "HIGH") ??
    sortForGlance(nodes)[0]!
  )
}

function toStack(type: string, nodes: TopologyNode[]): ServiceStack {
  return {
    type,
    label: awsServiceLabel(type),
    nodes,
    representative: pickRepresentative(nodes),
    criticalCount: nodes.filter(
      n => n.score?.tier === "WORST" || n.score?.tier === "HIGH",
    ).length,
  }
}

/**
 * Group real workloads into AWS-diagram service stacks.
 * Same type → one icon with siblings "behind" (count badge).
 * Gateways stay separate stacks (usually count 1).
 * Jewels of unique types stay visible as their own stack.
 */
export function planServiceStacks(workloads: TopologyNode[]): ServiceStack[] {
  if (workloads.length === 0) return []

  const byType = new Map<string, TopologyNode[]>()
  for (const n of workloads) {
    const key = n.type ?? "Other"
    const list = byType.get(key) ?? []
    list.push(n)
    byType.set(key, list)
  }

  const stacks: ServiceStack[] = []
  for (const [type, nodes] of byType) {
    // Always stack mutual compute / serverless / regional volume types.
    if (STACK_ALWAYS_TYPES.has(type) || nodes.length >= 2 || GATEWAY_TYPES.has(type)) {
      stacks.push(toStack(type, nodes))
      continue
    }
    // Singleton anchor (e.g. one RDS) — still one stack, depth 1.
    stacks.push(toStack(type, nodes))
  }

  // Order: gateways → jewels → critical → size → label
  return stacks.sort((a, b) => {
    const ag = GATEWAY_TYPES.has(a.type) ? 0 : 1
    const bg = GATEWAY_TYPES.has(b.type) ? 0 : 1
    if (ag !== bg) return ag - bg
    const aj = a.nodes.some(n => n.is_jewel) ? 0 : 1
    const bj = b.nodes.some(n => n.is_jewel) ? 0 : 1
    if (aj !== bj) return aj - bj
    if (b.criticalCount !== a.criticalCount) return b.criticalCount - a.criticalCount
    if (b.nodes.length !== a.nodes.length) return b.nodes.length - a.nodes.length
    return a.label.localeCompare(b.label)
  })
}

/**
 * Plan Glance contents for one AZ×tier cell from real workloads only.
 * Prefer service stacks (one Lambda with N behind) over listing every sibling.
 */
export function planGlanceCell(workloads: TopologyNode[]): GlanceCellPlan {
  const stacks = planServiceStacks(workloads)
  // Cap visible distinct stacks; overflow merges into typed stacks already —
  // if still too many distinct types, keep gateways/jewels first then rest.
  if (stacks.length <= GLANCE_NAMED_CAP + 2) return { stacks }

  const keep: ServiceStack[] = []
  const rest: ServiceStack[] = []
  for (const s of stacks) {
    const priority =
      GATEWAY_TYPES.has(s.type) || s.nodes.some(n => n.is_jewel) || keep.length < GLANCE_NAMED_CAP
    if (priority && keep.length < GLANCE_NAMED_CAP + 1) keep.push(s)
    else rest.push(s)
  }
  // Flatten rest members back into stacks by type (already typed) — just append.
  return { stacks: [...keep, ...rest] }
}

/** @deprecated use planGlanceCell().stacks — kept for older call sites during migrate */
export type GlanceCellPlanLegacy = {
  named: TopologyNode[]
  overflow: TopologyNode[]
}

/** Legacy adapter: named = singleton stacks' reps; overflow = multi-member stacks flattened. */
export function planGlanceCellLegacy(
  workloads: TopologyNode[],
  _namedCap: number = GLANCE_NAMED_CAP,
): GlanceCellPlanLegacy {
  const { stacks } = planGlanceCell(workloads)
  const named: TopologyNode[] = []
  const overflow: TopologyNode[] = []
  for (const s of stacks) {
    if (s.nodes.length === 1 && !STACK_ALWAYS_TYPES.has(s.type)) {
      named.push(s.representative)
    } else if (s.nodes.length === 1) {
      // Still show singleton Lambda/EC2 as named for inspect, but UI should stack-style
      named.push(s.representative)
    } else {
      overflow.push(...s.nodes)
    }
  }
  return { named, overflow }
}

/** True when Glance should collapse a rail into type stacks (real counts). */
export function shouldGlanceStackRail(
  nodes: TopologyNode[],
  threshold: number = GLANCE_RAIL_STACK_THRESHOLD,
): boolean {
  return nodes.length > threshold
}

export function shouldShowStackDepth(stack: ServiceStack): boolean {
  return stack.nodes.length >= 2
}
