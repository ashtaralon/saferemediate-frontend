/// <reference types="vitest/globals" />
/**
 * AWS presentation catalog — the icon + placement contract.
 *
 * This suite exists because the icon map and the backend's type vocabulary
 * drifted apart silently. The backend retypes an RDS row whose engine is
 * `neptune` to type `Neptune` (api/topology_risk._canvas_type and
 * _retype_nodes_from_observed_listeners) — and the icon map had no `Neptune`
 * key, so making the engine family MORE correct deleted the chip's glyph.
 * This graph has a live instance of exactly that row.
 *
 * The offline guards below are the ratchet: every type the backend can emit
 * either resolves to a verified icon or is DECLARED icon-less on purpose.
 * There is no third state where a type quietly renders bare.
 */
import { describe, expect, it } from "vitest"

import {
  __catalogForTest,
  awsCanonicalType,
  awsCategory,
  awsIconIsFamilyFallback,
  awsIconSlug,
  awsIconUrl,
  awsPresentation,
  awsServiceFullName,
  awsServiceLabel,
  awsServiceScope,
} from "@/components/topology-v0-2/aws-architecture-icons"
import type { AwsServiceScope } from "@/components/topology-v0-2/aws-architecture-icons"
import { PLACEMENT_RULES, mapSlotForType } from "@/components/topology-v0-2/estate-placement"
import type { MapSlot } from "@/components/topology-v0-2/estate-placement"

const { CATALOG, ALIASES } = __catalogForTest

/**
 * Slugs verified to return HTTP 200 from https://thesvg.org/icons/<slug>/default.svg.
 * Frozen deliberately: CI must not depend on a third-party CDN being up, so
 * the network check lives in `scripts/verify-aws-icon-slugs.sh` and this list
 * is what it refreshes. A slug absent here is either a typo or unverified —
 * run the script rather than adding it by hand.
 */
const VERIFIED_SLUGS = new Set([
  "aws-amazon-api-gateway",
  "aws-amazon-athena",
  "aws-amazon-cloudwatch",
  "aws-amazon-documentdb",
  "aws-amazon-dynamodb",
  "aws-amazon-ec2",
  "aws-amazon-ec2-auto-scaling",
  "aws-amazon-elastic-container-service",
  "aws-amazon-elastic-kubernetes-service",
  "aws-amazon-eventbridge",
  "aws-amazon-neptune",
  "aws-amazon-rds",
  "aws-amazon-redshift",
  "aws-amazon-route-53",
  "aws-amazon-simple-notification-service",
  "aws-amazon-simple-queue-service",
  "aws-amazon-simple-storage-service",
  "aws-amazon-virtual-private-cloud",
  "aws-aws-cloudtrail",
  "aws-aws-config",
  "aws-aws-fargate",
  "aws-aws-identity-and-access-management",
  "aws-aws-key-management-service",
  "aws-aws-lambda",
  "aws-aws-organizations",
  "aws-aws-secrets-manager",
  "aws-aws-step-functions",
  "aws-aws-systems-manager",
  "aws-res-amazon-cloudwatch-logs",
  "aws-res-amazon-cloudwatch-rule",
  "aws-res-amazon-dynamodb-table",
  "aws-res-amazon-ec2-elastic-ip-address",
  "aws-res-amazon-ec2-instance",
  "aws-res-amazon-ec2-instances",
  "aws-res-amazon-elastic-container-service-container-1",
  "aws-res-amazon-elastic-container-service-service",
  "aws-res-amazon-elastic-container-service-task",
  "aws-res-amazon-eventbridge-custom-event-bus",
  "aws-res-amazon-eventbridge-default-event-bus",
  "aws-res-amazon-eventbridge-rule",
  "aws-res-amazon-simple-notification-service-topic",
  "aws-res-amazon-simple-queue-service-queue",
  "aws-res-amazon-simple-storage-service-bucket",
  "aws-res-amazon-simple-storage-service-general-access-points",
  "aws-res-amazon-simple-storage-service-object",
  "aws-res-amazon-vpc-carrier-gateway",
  "aws-res-amazon-vpc-customer-gateway",
  "aws-res-amazon-vpc-elastic-network-interface",
  "aws-res-amazon-vpc-endpoints",
  "aws-res-amazon-vpc-flow-logs",
  "aws-res-amazon-vpc-internet-gateway",
  "aws-res-amazon-vpc-nat-gateway",
  "aws-res-amazon-vpc-network-access-analyzer",
  "aws-res-amazon-vpc-network-access-control-list",
  "aws-res-amazon-vpc-peering-connection",
  "aws-res-amazon-vpc-reachability-analyzer",
  "aws-res-amazon-vpc-router",
  "aws-res-amazon-vpc-traffic-mirroring",
  "aws-res-amazon-vpc-virtual-private-cloud-vpc",
  "aws-res-amazon-vpc-vpn-gateway",
  "aws-res-aws-identity-access-management-add-on",
  "aws-res-aws-identity-access-management-data-encryption-key",
  "aws-res-aws-identity-access-management-iam-roles-anywhere",
  "aws-res-aws-identity-access-management-mfa-token",
  "aws-res-aws-identity-access-management-permissions",
  "aws-res-aws-identity-access-management-role",
  "aws-res-aws-identity-access-management-temporary-security-credential",
  "aws-res-aws-lambda-lambda-function",
  "aws-res-aws-organizations-account",
  "aws-res-aws-organizations-organizational-unit",
  "aws-res-elastic-load-balancing-application-load-balancer",
  "aws-res-elastic-load-balancing-gateway-load-balancer",
  "aws-res-elastic-load-balancing-network-load-balancer",
])

/**
 * Every `type` string the backend can put on a TopologyNode for this estate.
 *
 * Left column = what the graph holds, right column = what
 * `api/topology_risk._label_to_type` turns it into (it falls through with
 * `.get(label, label)`, so unmapped labels arrive raw). Sourced from two
 * censuses run against the live graph: `labels(n)` and `:Resource.type`.
 */
const BACKEND_EMITTED_TYPES = [
  // canonical short names produced by _label_to_type
  "EC2", "Lambda", "RDS", "S3", "DynamoDB", "LoadBalancer", "AutoScalingGroup",
  "TargetGroup", "EventBridge", "SQS", "StepFunction", "ECS", "APIGateway",
  "SecretsManagerSecret", "KMSKey", "Neptune", "DocumentDB",
  // raw graph labels / resource types that pass through unmapped
  "EC2Instance", "LambdaFunction", "RDSInstance", "S3Bucket", "S3Prefix",
  "DynamoDBTable", "LoadBalancerListener", "LaunchTemplate", "EventBus",
  "EventSource", "EventBridgeTarget", "EventBridgeRule", "SNSTopic",
  "StateMachine", "ECSCluster", "TaskDefinition", "K8sCluster",
  "ApiGateway", "APIGATEWAY", "SecurityGroup", "NetworkInterface", "Subnet",
  "VPC", "VPCEndpoint", "InternetGateway", "EICEndpoint", "NACL",
  "NetworkACL", "RouteTable", "EIP", "IAMRole", "IAMPolicy", "IAMUser",
  "InstanceProfile", "Account", "AWSAccount", "Organization", "SCP",
  "CloudTrailTrail", "CloudWatchLogGroup", "ConfigRule", "AthenaWorkgroup",
  "SSMStateManagerAssociation", "Internet", "Domain",
] as const

describe("catalog integrity", () => {
  it("every catalog slug is CDN-verified", () => {
    const unverified = Object.entries(CATALOG)
      .filter(([, v]) => v.slug !== null && !VERIFIED_SLUGS.has(v.slug))
      .map(([k, v]) => `${k} -> ${v.slug}`)
    expect(unverified).toEqual([])
  })

  it("every alias target is a real catalog key", () => {
    const dangling = Object.entries(ALIASES)
      .filter(([, target]) => !CATALOG[target])
      .map(([from, target]) => `${from} -> ${target}`)
    expect(dangling).toEqual([])
  })

  it("no alias shadows a catalog key (one spelling, one owner)", () => {
    const shadowed = Object.keys(ALIASES).filter((k) => CATALOG[k])
    expect(shadowed).toEqual([])
  })

  it("precision `none` and a null slug always agree", () => {
    const inconsistent = Object.entries(CATALOG)
      .filter(([, v]) => (v.slug === null) !== (v.precision === "none"))
      .map(([k]) => k)
    expect(inconsistent).toEqual([])
  })
})

describe("backend type vocabulary is fully covered", () => {
  it("resolves every type the backend can emit", () => {
    const unresolved = BACKEND_EMITTED_TYPES.filter((t) => !awsPresentation(t))
    expect(unresolved).toEqual([])
  })

  it("gives every emitted type a service scope", () => {
    const unplaceable = BACKEND_EMITTED_TYPES.filter((t) => !awsServiceScope(t))
    expect(unplaceable).toEqual([])
  })

  it("draws an icon for every emitted type except declared containers", () => {
    // A type may render without a glyph ONLY by being a frame or off-estate.
    // Anything else missing an icon is the silent-bare-chip regression.
    const bareButNotAFrame = BACKEND_EMITTED_TYPES.filter((t) => {
      const p = awsPresentation(t)!
      return p.slug === null && p.scope !== "container" && p.scope !== "external"
    })
    expect(bareButNotAFrame).toEqual([])
  })
})

describe("the Neptune retype regression", () => {
  // api/topology_risk retypes RDS -> Neptune from `engine` or from observed
  // listener ports. Both targets must carry an icon, or correcting the engine
  // family removes the glyph.
  it.each(["Neptune", "NeptuneCluster", "NeptuneInstance", "DocumentDB"])(
    "%s has an icon, so the retype never loses one",
    (type) => {
      expect(awsIconUrl(type)).toContain("https://thesvg.org/icons/")
      expect(awsIconSlug(type)).not.toBeNull()
    },
  )

  it("uses the engine's own icon, not RDS's", () => {
    expect(awsIconSlug("Neptune")).toBe("aws-amazon-neptune")
    expect(awsIconSlug("DocumentDB")).toBe("aws-amazon-documentdb")
    expect(awsIconSlug("RDS")).toBe("aws-amazon-rds")
  })
})

describe("graph twins fold onto one canonical type", () => {
  it.each([
    [["ApiGateway", "APIGateway", "APIGATEWAY"], "APIGateway"],
    [["RDS", "RDSInstance", "RDSCluster"], "RDS"],
    [["NACL", "NetworkACL"], "NACL"],
    [["CloudTrail", "CloudTrailTrail"], "CloudTrail"],
    [["Account", "AWSAccount"], "Account"],
    [["EC2", "EC2Instance"], "EC2"],
    [["StepFunction", "StateMachine"], "StepFunction"],
  ] as const)("%s all resolve to %s", (spellings, canonical) => {
    for (const s of spellings) expect(awsCanonicalType(s)).toBe(canonical)
    const slugs = new Set(spellings.map((s) => awsIconSlug(s)))
    expect(slugs.size).toBe(1)
  })
})

describe("service scope follows the AWS canonical nesting", () => {
  it("puts regional services outside the VPC, not in a subnet", () => {
    // Drawing an S3 bucket or a DynamoDB table inside a subnet is the
    // classic wrong AWS diagram; both are reached over an endpoint.
    for (const t of ["S3", "S3Bucket", "DynamoDB", "SQS", "SNSTopic",
                     "EventBridge", "StepFunction", "APIGateway"]) {
      expect(awsServiceScope(t)).toBe("regional")
    }
  })

  it("puts VPC-level gateways on the boundary", () => {
    for (const t of ["InternetGateway", "IGW", "NATGateway", "NAT",
                     "VPCEndpoint", "VPCE"]) {
      expect(awsServiceScope(t)).toBe("vpc-boundary")
    }
  })

  it("puts IAM and Organizations outside the region", () => {
    for (const t of ["IAMRole", "IAMPolicy", "IAMUser", "InstanceProfile",
                     "Organization", "SCP"]) {
      expect(awsServiceScope(t)).toBe("global")
    }
  })

  it("keeps compute and databases in a subnet", () => {
    for (const t of ["EC2", "RDS", "Neptune", "NetworkInterface",
                     "LoadBalancer", "NLB", "Redshift", "RedshiftCluster"]) {
      expect(awsServiceScope(t)).toBe("in-subnet")
    }
  })

  it("keeps container compute in a subnet, but not a task definition", () => {
    // A cluster's control plane is regional; its tasks get an ENI in a subnet
    // you chose, and the task is what a reader is looking for on this map.
    // These read `regional` when the catalog was written, contradicting the
    // placement authority, which draws them in the app tier — a subnet cell.
    for (const t of ["ECS", "ECSCluster", "ECSService", "ECSTask",
                     "EKS", "EKSCluster", "K8sCluster", "Fargate"]) {
      expect(awsServiceScope(t)).toBe("in-subnet")
    }
    // A task definition is a versioned registry document — no ENI, no subnet.
    expect(awsServiceScope("TaskDefinition")).toBe("regional")
  })

  it("leaves Lambda placement to the graph", () => {
    // Most Lambdas have no VPC config. Claiming a subnet for them would be
    // network placement with no evidence behind it.
    expect(awsServiceScope("Lambda")).toBe("vpc-conditional")
    expect(awsServiceScope("LambdaFunction")).toBe("vpc-conditional")
  })

  it("treats frames as containers, never as nodes", () => {
    for (const t of ["VPC", "Subnet", "SecurityGroup", "Account"]) {
      expect(awsServiceScope(t)).toBe("container")
    }
  })
})

/**
 * The seam between the two tables.
 *
 * There are two contracts about where a node belongs, and they are NOT
 * duplicates: `estate-placement.ts` owns the MapSlot a node is DRAWN in and is
 * what the renderer consumes; this catalog's `scope` says what AWS says the
 * service IS. They answer different questions and legitimately diverge — so the
 * risk is not that they differ, it is that they differ in a way NOBODY DECIDED.
 *
 * This block is the ratchet on that. It derives its type list from the two
 * tables' own keys rather than a hand-written list, because a hand-written list
 * is how EKS/Fargate/Redshift stayed invisible: an earlier census typed out 62
 * types by hand, missed those, and reported 2 contradictions where there were 4.
 */
describe("the two placement contracts stay reconciled", () => {
  /** Slots that draw a chip INSIDE an AZ x subnet-tier cell. */
  const SUBNET_CELL_SLOTS = new Set<MapSlot>(["web", "app", "data"])

  /**
   * The scope each slot structurally implies. Read off the renderer, not
   * guessed: the ingress band is built at aws-frame.tsx `albBand` and rendered
   * ABOVE the AZ grid spanning its full width ("never inside a single AZ's tier
   * cell"), so `ingress` asserts in-VPC but NOT in-subnet; `serverless` is the
   * runtime lane outside the subnet grid.
   */
  const NATURAL_SCOPE: Partial<Record<MapSlot, readonly AwsServiceScope[]>> = {
    web: ["in-subnet"],
    app: ["in-subnet"],
    data: ["in-subnet"],
    ingress: ["in-subnet"],
    serverless: ["vpc-conditional"],
    triggers: ["regional"],
    regional: ["regional"],
    boundary: ["vpc-boundary"],
    // `hidden` draws nothing, so it makes no structural claim to contradict.
  }

  /**
   * Divergences that are deliberate. API Gateway IS regional — it lives outside
   * every VPC and is reached over an endpoint — and it is DRAWN in the ingress
   * band because that is where a reader looks for the front door. The band is
   * not a subnet, so nothing dishonest is asserted by that pairing.
   */
  const ACCEPTED_DIVERGENCES = new Set(["APIGateway", "ApiGateway", "APIGATEWAY"])

  const ALL_KNOWN_TYPES = [
    ...new Set([
      ...Object.keys(CATALOG),
      ...Object.keys(ALIASES),
      ...PLACEMENT_RULES.flatMap((r) => r.types),
    ]),
  ].sort()

  it("knows a non-trivial number of types (guards against an empty sweep)", () => {
    // Without this, a broken derivation turns every assertion below into a
    // sweep over nothing that passes by vacuum.
    expect(ALL_KNOWN_TYPES.length).toBeGreaterThan(90)
  })

  it("never draws a chip in a subnet cell for a service that is not subnet-bound", () => {
    // The strongest honesty claim on this map: a chip inside an AZ x tier cell
    // says "this thing has an address in that subnet". If the catalog says the
    // service is regional or global, the map is asserting a network position
    // the service cannot have.
    const contradictions = ALL_KNOWN_TYPES.filter((t) => {
      const scope = awsServiceScope(t)
      return scope !== null
        && SUBNET_CELL_SLOTS.has(mapSlotForType(t))
        && scope !== "in-subnet"
    })
    expect(contradictions).toEqual([])
  })

  it("can name every type the placement authority places", () => {
    // A type the authority places but the catalog cannot name renders as
    // "type unresolved" while still being drawn in a tier — placed and
    // anonymous. Redshift, Fargate, ECSTask and GatewayLoadBalancer were all
    // in exactly that state.
    const placedButUnnamed = ALL_KNOWN_TYPES.filter(
      (t) => mapSlotForType(t) !== "hidden" && awsServiceScope(t) === null,
    )
    expect(placedButUnnamed).toEqual([])
  })

  it("has no slot/scope divergence beyond the ones on record", () => {
    const diverging = ALL_KNOWN_TYPES.filter((t) => {
      const scope = awsServiceScope(t)
      const natural = NATURAL_SCOPE[mapSlotForType(t)]
      if (!scope || !natural) return false
      return !natural.includes(scope) && !ACCEPTED_DIVERGENCES.has(t)
    })
    // A new name here is not automatically a bug — it is a decision that has
    // not been made yet. Either correct the table that is wrong, or add the
    // type to ACCEPTED_DIVERGENCES with the reason it is honest.
    expect(diverging).toEqual([])
  })
})

describe("honest states", () => {
  it("returns null for an unrecognized type rather than guessing", () => {
    for (const t of ["ShadowIAMRemediation", "EvidenceAssertion", "Sasquatch",
                     "", null, undefined]) {
      expect(awsPresentation(t as string)).toBeNull()
      expect(awsIconUrl(t as string)).toBeNull()
      expect(awsServiceScope(t as string)).toBeNull()
      expect(awsCategory(t as string)).toBeNull()
    }
  })

  it("declares security groups and subnets icon-less on purpose", () => {
    // AWS draws a security group as a dashed boundary and a subnet as a
    // tinted card. Neither has an icon in the official set, so a null here
    // is the convention rather than a hole to be filled with a lookalike.
    for (const t of ["SecurityGroup", "Subnet", "Internet"]) {
      expect(awsIconSlug(t)).toBeNull()
      expect(awsPresentation(t)!.precision).toBe("none")
    }
  })

  it("flags a borrowed icon as a family fallback", () => {
    // TargetGroup wears the ALB icon because AWS ships none for it. The map
    // must be able to say so rather than implying resource-exact precision.
    expect(awsIconIsFamilyFallback("TargetGroup")).toBe(true)
    expect(awsIconIsFamilyFallback("IAMUser")).toBe(true)
    expect(awsIconIsFamilyFallback("InstanceProfile")).toBe(true)
    expect(awsIconIsFamilyFallback("EC2")).toBe(false)
    expect(awsIconIsFamilyFallback("Neptune")).toBe(false)
  })
})

describe("service naming", () => {
  it("uses precise AWS service names in the full name", () => {
    // "Don't write 'load balancer.' Write 'Application Load Balancer'."
    expect(awsServiceFullName("LoadBalancer")).toBe("Application Load Balancer")
    expect(awsServiceFullName("NLB")).toBe("Network Load Balancer")
    expect(awsServiceFullName("InternetGateway")).toBe("Internet Gateway")
    expect(awsServiceFullName("VPCEndpoint")).toBe("VPC Endpoint")
    expect(awsServiceFullName("Lambda")).toBe("Lambda Function")
    expect(awsServiceFullName("EC2")).toBe("EC2 Instance")
  })

  it("keeps the chip label short enough to fit a stack header", () => {
    // A stack chip reads "EC2 x5", not "EC2 Instance x5". The precise name
    // belongs in the tooltip. A lane header shortens further still, in its own
    // table (FAMILY_SHORT_LABELS in aws-frame.tsx) — this catalog is what the
    // CHIPS read, and it must not pick up header-width abbreviations.
    expect(awsServiceLabel("LoadBalancer")).toBe("ALB")
    expect(awsServiceLabel("EC2")).toBe("EC2")
    expect(awsServiceLabel("EC2Instance")).toBe("EC2")
    expect(awsServiceLabel("EventBridge")).toBe("EventBridge")
    expect(awsServiceLabel("DynamoDBTable")).toBe("DynamoDB")
    expect(awsServiceLabel("S3Bucket")).toBe("S3")
    for (const t of BACKEND_EMITTED_TYPES) {
      expect(awsServiceLabel(t).length).toBeLessThanOrEqual(16)
    }
  })

  it("still degrades gracefully for an unknown type", () => {
    expect(awsServiceLabel("WidgetFunction")).toBe("Widget")
    expect(awsServiceLabel("Mystery")).toBe("Mystery")
    // No catalog entry means no invented service name — the short label is
    // all we can honestly say.
    expect(awsServiceFullName("Mystery")).toBe("Mystery")
  })
})

describe("icon kind follows the AWS icon set's own split", () => {
  it("wears the filled service icon where a service icon exists", () => {
    // The coloured service square is what a service node wears. `aws-res-*`
    // line art is for resources with no service of their own.
    for (const t of ["EC2", "Lambda", "RDS", "Neptune", "DynamoDB", "S3",
                     "SQS", "SNSTopic", "EventBridge", "StepFunction",
                     "APIGateway", "KMSKey", "ECS", "EKS"]) {
      expect(awsIconSlug(t)).not.toMatch(/^aws-res-/)
    }
  })

  it("uses resource line art only where AWS ships no service icon", () => {
    // An Internet Gateway, a NAT Gateway, an ENI and an IAM role are not
    // services; the resource icon is the only official option.
    for (const t of ["InternetGateway", "NATGateway", "VPCEndpoint",
                     "NetworkInterface", "NACL", "EIP", "IAMRole",
                     "IAMPolicy", "LoadBalancer", "NLB", "Account"]) {
      expect(awsIconSlug(t)).toMatch(/^aws-res-/)
    }
  })
})
