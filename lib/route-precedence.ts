// Route-precedence derivation for the Per-Path Flow Map.
//
// AWS routing rule: when a subnet has multiple routes to different
// gateways (e.g. a default 0.0.0.0/0 → IGW route AND a prefix-list
// route for com.amazonaws.<region>.s3 → VPCE), the more SPECIFIC
// prefix wins. For an S3 read from in-VPC compute to an in-region
// bucket, the VPCE route is selected — bytes traverse the AWS
// backbone and never touch the public internet. For any other
// destination, the catch-all IGW route carries it.
//
// This module derives "which gateway carries this destination's
// traffic?" for a destination resource, given the path's egress
// gateways. The Per-Path Flow Map renders the answer as a chip on
// the destination card so the operator reads "via VPCE · private"
// or "via IGW · public" instead of having to apply AWS routing
// rules in their head from the EGRESS GATEWAYS lane inventory.
//
// Anchor: pattern_render_the_answer_not_the_inventory (memory file
// captured 2026-06-01) — Flow Map currently shows components but
// not the decision the operator came to learn. This module is the
// minimal additive answer-derivation layer.

import type { NodeType, EgressGatewayNode } from "@/components/dependency-map/traffic-flow-map"

export interface RoutePrecedence {
  /** Gateway that carries traffic to the destination resource. */
  gateway: EgressGatewayNode
  /** True when the route uses a Gateway VPCE (private, AWS
   *  backbone). False when it uses IGW / NAT / Egress-only IGW
   *  (public internet). Drives chip color (green vs amber) +
   *  data-route-precedence-via attribute for spot-checks. */
  isPrivate: boolean
  /** Operator-facing route label, e.g. "com.amazonaws.eu-west-1.s3"
   *  for a VPCE or "0.0.0.0/0" for an IGW default route. Best-
   *  effort: populated from gateway.routeTargetService /
   *  routeDestinationCidr when backend ships them; falls back to
   *  gateway.serviceHint or a conservative default. */
  label: string
}

/** AWS service shorthand for a Cyntro NodeType — used to match
 *  Gateway VPCEs against the destination's service. Only AWS
 *  services with native Gateway VPCEs (S3, DynamoDB) are
 *  precedence-relevant today; other services fall through to IGW.
 *  Interface VPCEs (PrivateLink, SQS / SNS / KMS / Secrets Manager /
 *  ECR / etc.) are also covered when the gateway carries an
 *  Interface kindLabel — same matching semantics. */
function vpceServiceHintForType(type: NodeType): string | null {
  if (type === "storage") return "s3"
  if (type === "dynamodb") return "dynamodb"
  if (type === "sqs") return "sqs"
  if (type === "sns") return "sns"
  return null
}

/** Pick the best-matching VPCE for a destination service. Returns
 *  undefined when no VPCE in the lane covers the destination's
 *  service. */
function findMatchingVPCE(
  serviceHint: string,
  gateways: ReadonlyArray<EgressGatewayNode>,
): EgressGatewayNode | undefined {
  const target = serviceHint.toLowerCase()
  return gateways.find((g) => {
    if (g.kind !== "VPCEndpoint") return false
    const svc = (g.routeTargetService || g.serviceHint || "").toLowerCase()
    if (!svc) return false
    // Match canonical "com.amazonaws.<region>.s3" or the shorthand
    // "s3" stored in serviceHint.
    return svc === target || svc.endsWith(`.${target}`)
  })
}

/** Pick the public-internet fallback gateway. Prefers IGW (the
 *  AWS-canonical default-route target); falls back to NAT / Egress-
 *  only IGW so private-subnet paths still resolve to something
 *  honest. Returns undefined when the lane has no public-egress
 *  gateway — in that case derivePrecedenceForDestination returns
 *  null and the renderer omits the chip. */
function findPublicGateway(
  gateways: ReadonlyArray<EgressGatewayNode>,
): EgressGatewayNode | undefined {
  return (
    gateways.find((g) => g.kind === "InternetGateway") ||
    gateways.find((g) => g.kind === "NATGateway") ||
    gateways.find((g) => g.kind === "EgressOnlyInternetGateway")
  )
}

/** Derive the winning route to a destination resource given the
 *  path's available egress gateways.
 *
 *  Precedence: matching Gateway VPCE (private) → public-egress
 *  gateway (IGW / NAT / Egress-only IGW). Returns null when
 *  neither layer applies — the Per-Path Flow Map then renders
 *  no chip rather than a phantom claim.
 *
 *  Pure function. No side effects. Safe to call inline in render
 *  hot paths (or wrap in useMemo for larger destination sets). */
export function derivePrecedenceForDestination(
  resource: { type: NodeType },
  gateways: ReadonlyArray<EgressGatewayNode>,
): RoutePrecedence | null {
  // Step 1: prefer a matching Gateway VPCE for the destination's
  // service. AWS routes the prefix-list specifically through the
  // VPCE, beating the IGW default route.
  const hint = vpceServiceHintForType(resource.type)
  if (hint) {
    const vpce = findMatchingVPCE(hint, gateways)
    if (vpce) {
      const label =
        vpce.routeTargetService ||
        (vpce.serviceHint ? `com.amazonaws.${vpce.serviceHint}` : "AWS PrivateLink")
      return { gateway: vpce, isPrivate: true, label }
    }
  }

  // Step 2: fall back to a public-egress gateway. AWS default route
  // catches everything not matched by a more-specific prefix.
  const pub = findPublicGateway(gateways)
  if (pub) {
    const label = pub.routeDestinationCidr || "0.0.0.0/0"
    return { gateway: pub, isPrivate: false, label }
  }

  // Step 3: no gateway in the lane covers this destination. Don't
  // fabricate an answer — let the renderer omit the chip.
  return null
}
