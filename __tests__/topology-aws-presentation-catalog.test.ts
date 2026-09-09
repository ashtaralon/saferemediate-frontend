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
  awsPlacementScope,
  awsPresentation,
  awsServiceFullName,
  awsServiceLabel,
} from "@/components/topology-v0-2/aws-architecture-icons"

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
  "aws-amazon-route-53",
  "aws-amazon-simple-notification-service",
  "aws-amazon-simple-queue-service",
  "aws-amazon-simple-storage-service",
  "aws-amazon-virtual-private-cloud",
  "aws-aws-cloudtrail",
  "aws-aws-config",
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

  it("gives every emitted type a placement scope", () => {
    const unplaceable = BACKEND_EMITTED_TYPES.filter((t) => !awsPlacementScope(t))
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

describe("placement follows the AWS canonical nesting", () => {
  it("puts regional services outside the VPC, not in a subnet", () => {
    // Drawing an S3 bucket or a DynamoDB table inside a subnet is the
    // classic wrong AWS diagram; both are reached over an endpoint.
    for (const t of ["S3", "S3Bucket", "DynamoDB", "SQS", "SNSTopic",
                     "EventBridge", "StepFunction", "APIGateway"]) {
      expect(awsPlacementScope(t)).toBe("regional")
    }
  })

  it("puts VPC-level gateways on the boundary", () => {
    for (const t of ["InternetGateway", "IGW", "NATGateway", "NAT",
                     "VPCEndpoint", "VPCE"]) {
      expect(awsPlacementScope(t)).toBe("vpc-boundary")
    }
  })

  it("puts IAM and Organizations outside the region", () => {
    for (const t of ["IAMRole", "IAMPolicy", "IAMUser", "InstanceProfile",
                     "Organization", "SCP"]) {
      expect(awsPlacementScope(t)).toBe("global")
    }
  })

  it("keeps compute and databases in a subnet", () => {
    for (const t of ["EC2", "RDS", "Neptune", "NetworkInterface",
                     "LoadBalancer", "NLB"]) {
      expect(awsPlacementScope(t)).toBe("in-subnet")
    }
  })

  it("leaves Lambda placement to the graph", () => {
    // Most Lambdas have no VPC config. Claiming a subnet for them would be
    // network placement with no evidence behind it.
    expect(awsPlacementScope("Lambda")).toBe("vpc-conditional")
    expect(awsPlacementScope("LambdaFunction")).toBe("vpc-conditional")
  })

  it("treats frames as containers, never as nodes", () => {
    for (const t of ["VPC", "Subnet", "SecurityGroup", "Account"]) {
      expect(awsPlacementScope(t)).toBe("container")
    }
  })
})

describe("honest states", () => {
  it("returns null for an unrecognized type rather than guessing", () => {
    for (const t of ["ShadowIAMRemediation", "EvidenceAssertion", "Sasquatch",
                     "", null, undefined]) {
      expect(awsPresentation(t as string)).toBeNull()
      expect(awsIconUrl(t as string)).toBeNull()
      expect(awsPlacementScope(t as string)).toBeNull()
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
    // A stack chip reads "EC2 x5", not "EC2 Instance x5"; a lane header reads
    // "EventBridge / DynamoDB / S3". The precise name belongs in the tooltip.
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
