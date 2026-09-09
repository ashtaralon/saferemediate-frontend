/**
 * Official AWS Architecture Icons via theSVG CDN
 * (https://thesvg.org/collection/aws — CC BY-ND 2.0, unmodified).
 *
 * ONE TABLE, NOT TWO
 * ------------------
 * This file used to carry a `SLUG` map and a separate `awsServiceLabel`
 * switch, and `aws-frame.tsx` carried a THIRD table of hand-drawn glyphs for
 * whatever the first two missed. They keyed on overlapping-but-different type
 * sets, so a type could have a label and no icon (or the reverse) with
 * nothing to catch it. Everything is now derived from one `CATALOG` record
 * per canonical type, plus an `ALIASES` table folding the graph's many
 * spellings onto it. Add a service in one place or not at all.
 *
 * WHY THE ALIAS TABLE IS NOT OPTIONAL
 * -----------------------------------
 * The backend's `api/topology_risk._label_to_type` normalizes ~39 graph
 * labels onto 17 canonical short names — and then falls through with
 * `.get(label, label)`, so every OTHER label reaches us as the raw graph
 * label. The graph really does carry twins: `ApiGateway` / `APIGateway` /
 * `APIGATEWAY`, `RDS` / `RDSInstance`, `NACL` / `NetworkACL`,
 * `CloudTrail` / `CloudTrailTrail`, `Account` / `AWSAccount`. Accept every
 * spelling; emit one canonical key.
 *
 * SERVICE ICON vs RESOURCE ICON
 * -----------------------------
 * AWS ships two kinds. The SERVICE icon is the filled, category-coloured
 * square (Amazon EC2, AWS Lambda) — that is what a service node wears, and
 * what the map's coloured icon squares are built for. The `aws-res-*`
 * RESOURCE icons are line art meant to sit on white, and exist for things
 * with no service of their own: an Internet Gateway, a NAT Gateway, an ENI,
 * an IAM role. Prefer the service icon; reach for `aws-res-*` only when no
 * service icon names the thing.
 *
 * TWO LABELS, ON PURPOSE
 * ----------------------
 * `name` is the precise AWS service name ("Application Load Balancer") for
 * tooltips and detail panels, because AWS's own convention is to never write
 * "load balancer". `short` is the compact family label a stack chip or lane
 * header can fit ("ALB"). They are different jobs; collapsing them either
 * overflows the chip or lies in the tooltip.
 *
 * WHAT `scope` IS FOR
 * -------------------
 * AWS's reference diagrams nest Region > VPC > AZ > Subnet type > Subnet >
 * Resources, and an icon is meaningless without knowing WHICH frame it
 * belongs in. S3 is not "in" a subnet; an Internet Gateway sits ON the VPC
 * boundary; IAM is global. `scope` is that fact, and the renderer places by
 * it. Where the answer is data-dependent — a Lambda is in-VPC only if it has
 * a VPC config — the scope is `vpc-conditional` and the renderer MUST read
 * the graph rather than assume.
 *
 * HONESTY (CLAUDE.md rule #1)
 * ---------------------------
 * `precision` distinguishes an EXACT official icon for that resource from a
 * FAMILY icon borrowed from its parent service (a Target Group drawn with the
 * ALB icon — AWS ships no Target Group icon). A type with no defensible icon
 * gets `slug: null` and renders as a labelled card with no glyph. We never
 * substitute a lookalike to fill a hole, and never invent a slug: every slug
 * below returned HTTP 200 from the CDN, and
 * `scripts/verify-aws-icon-slugs.sh` re-checks them on demand.
 *
 * Containers are deliberately icon-less. Security Group, Subnet and Internet
 * have no icon in the official AWS set because in AWS's visual grammar they
 * are FRAMES (a dashed SG boundary, a tinted subnet card), not nodes. That
 * absence is the convention, not a coverage gap.
 */

const CDN = "https://thesvg.org/icons"

/** Where a service is drawn, relative to the AWS canonical nesting. */
export type AwsPlacementScope =
  /** Inside an AZ × tier cell — needs a resolved subnet to place. */
  | "in-subnet"
  /** Drawn ON the VPC edge: IGW, NAT GW, VPC endpoints. */
  | "vpc-boundary"
  /** In-VPC only if the graph says so (Lambda `vpc_config`). */
  | "vpc-conditional"
  /** In-region, outside every VPC: S3, DynamoDB, SQS, EventBridge. */
  | "regional"
  /** Outside the region frame: IAM, Organizations, Route 53. */
  | "global"
  /** A frame, not a node — drawn as a boundary with a label. */
  | "container"
  /** Off-estate: the internet, an external IP, a domain. */
  | "external"

/** Official AWS icon-set category. Drives the icon-square tint. */
export type AwsCategory =
  | "compute"
  | "containers"
  | "storage"
  | "database"
  | "networking"
  | "security"
  | "integration"
  | "management"
  | "analytics"
  | "neutral"

export interface AwsServicePresentation {
  /** CDN slug, or null when no defensible official icon exists. */
  slug: string | null
  /** `exact` = the official icon for this resource. `family` = borrowed from
   *  the parent service because AWS ships none for the resource itself. */
  precision: "exact" | "family" | "none"
  category: AwsCategory
  scope: AwsPlacementScope
  /** Precise AWS service name — for tooltips and detail panels. */
  name: string
  /** Compact family label — for stack chips and lane headers. */
  short: string
}

const CATALOG: Record<string, AwsServicePresentation> = {
  // ---------------------------------------------------------------- compute
  EC2: {
    slug: "aws-amazon-ec2",
    precision: "exact",
    category: "compute",
    scope: "in-subnet",
    name: "EC2 Instance",
    short: "EC2",
  },
  Lambda: {
    slug: "aws-aws-lambda",
    precision: "exact",
    category: "compute",
    // A Lambda is in-subnet ONLY with a VPC config. Most are not, and the map
    // draws those in a runtime lane outside the VPC boundary rather than
    // implying network placement it has no evidence for.
    scope: "vpc-conditional",
    name: "Lambda Function",
    short: "Lambda",
  },
  AutoScalingGroup: {
    slug: "aws-amazon-ec2-auto-scaling",
    precision: "exact",
    category: "compute",
    scope: "in-subnet",
    name: "Auto Scaling Group",
    short: "Auto Scaling",
  },
  LaunchTemplate: {
    slug: "aws-amazon-ec2-auto-scaling",
    precision: "family",
    category: "compute",
    // Configuration, not a running thing in a subnet.
    scope: "regional",
    name: "Launch Template",
    short: "Launch Template",
  },
  EIP: {
    slug: "aws-res-amazon-ec2-elastic-ip-address",
    precision: "exact",
    category: "networking",
    scope: "vpc-boundary",
    name: "Elastic IP Address",
    short: "EIP",
  },

  // ------------------------------------------------------------- containers
  ECS: {
    slug: "aws-amazon-elastic-container-service",
    precision: "exact",
    category: "containers",
    scope: "regional",
    name: "ECS Cluster",
    short: "ECS",
  },
  ECSService: {
    slug: "aws-res-amazon-elastic-container-service-service",
    precision: "exact",
    category: "containers",
    scope: "in-subnet",
    name: "ECS Service",
    short: "ECS Service",
  },
  TaskDefinition: {
    slug: "aws-res-amazon-elastic-container-service-task",
    precision: "exact",
    category: "containers",
    scope: "regional",
    name: "ECS Task Definition",
    short: "Task Def",
  },
  EKS: {
    slug: "aws-amazon-elastic-kubernetes-service",
    precision: "exact",
    category: "containers",
    scope: "regional",
    name: "EKS Cluster",
    short: "EKS",
  },

  // ---------------------------------------------------------------- storage
  S3: {
    slug: "aws-amazon-simple-storage-service",
    precision: "exact",
    category: "storage",
    // S3 is regional, reached over an endpoint. Drawing a bucket inside a
    // subnet is the classic wrong AWS diagram.
    scope: "regional",
    name: "S3 Bucket",
    short: "S3",
  },
  S3Prefix: {
    slug: "aws-res-amazon-simple-storage-service-object",
    precision: "family",
    category: "storage",
    scope: "regional",
    name: "S3 Prefix",
    short: "S3 Prefix",
  },

  // --------------------------------------------------------------- database
  RDS: {
    slug: "aws-amazon-rds",
    precision: "exact",
    category: "database",
    scope: "in-subnet",
    name: "RDS Instance",
    short: "RDS",
  },
  // The backend RETYPES an RDS row to Neptune/DocumentDB from `engine` or from
  // observed listener ports (`_retype_nodes_from_observed_listeners`). Before
  // these entries existed, Neptune had no slug and fell through to a
  // hand-drawn glyph in aws-frame.tsx, and DocumentDB fell all the way to the
  // unknown-type "?" — so correcting the engine family made the chip LESS
  // legible. This graph has a live example: db:cyntro-pilot-instance carries
  // engine=neptune.
  Neptune: {
    slug: "aws-amazon-neptune",
    precision: "exact",
    category: "database",
    scope: "in-subnet",
    name: "Neptune",
    short: "Neptune",
  },
  DocumentDB: {
    slug: "aws-amazon-documentdb",
    precision: "exact",
    category: "database",
    scope: "in-subnet",
    name: "DocumentDB",
    short: "DocumentDB",
  },
  DynamoDB: {
    slug: "aws-amazon-dynamodb",
    precision: "exact",
    category: "database",
    scope: "regional",
    name: "DynamoDB Table",
    short: "DynamoDB",
  },

  // ------------------------------------------------------------- networking
  LoadBalancer: {
    slug: "aws-res-elastic-load-balancing-application-load-balancer",
    precision: "exact",
    category: "networking",
    scope: "in-subnet",
    name: "Application Load Balancer",
    short: "ALB",
  },
  NLB: {
    slug: "aws-res-elastic-load-balancing-network-load-balancer",
    precision: "exact",
    category: "networking",
    scope: "in-subnet",
    name: "Network Load Balancer",
    short: "NLB",
  },
  LoadBalancerListener: {
    slug: "aws-res-elastic-load-balancing-application-load-balancer",
    precision: "family",
    category: "networking",
    scope: "in-subnet",
    name: "Load Balancer Listener",
    short: "Listener",
  },
  TargetGroup: {
    slug: "aws-res-elastic-load-balancing-application-load-balancer",
    precision: "family",
    category: "networking",
    scope: "in-subnet",
    name: "Target Group",
    short: "TG",
  },
  InternetGateway: {
    slug: "aws-res-amazon-vpc-internet-gateway",
    precision: "exact",
    category: "networking",
    scope: "vpc-boundary",
    name: "Internet Gateway",
    short: "IGW",
  },
  NATGateway: {
    slug: "aws-res-amazon-vpc-nat-gateway",
    precision: "exact",
    category: "networking",
    // A NAT gateway LIVES in a public subnet. The boundary is the honest
    // simplification when no subnet resolved; when one has, the renderer
    // prefers the public-subnet cell.
    scope: "vpc-boundary",
    name: "NAT Gateway",
    short: "NAT GW",
  },
  VPCEndpoint: {
    slug: "aws-res-amazon-vpc-endpoints",
    precision: "exact",
    category: "networking",
    // A VPC endpoint is a VPC-level construct; AWS reference diagrams put it
    // ON the VPC boundary, not inside a subnet card.
    scope: "vpc-boundary",
    name: "VPC Endpoint",
    short: "VPCE",
  },
  EICEndpoint: {
    slug: "aws-res-amazon-vpc-endpoints",
    precision: "family",
    category: "networking",
    scope: "vpc-boundary",
    name: "EC2 Instance Connect Endpoint",
    short: "EIC",
  },
  NetworkInterface: {
    slug: "aws-res-amazon-vpc-elastic-network-interface",
    precision: "exact",
    category: "networking",
    scope: "in-subnet",
    name: "Elastic Network Interface",
    short: "ENI",
  },
  NACL: {
    slug: "aws-res-amazon-vpc-network-access-control-list",
    precision: "exact",
    category: "networking",
    scope: "container",
    name: "Network ACL",
    short: "NACL",
  },
  RouteTable: {
    slug: "aws-res-amazon-vpc-router",
    precision: "family",
    category: "networking",
    scope: "container",
    name: "Route Table",
    short: "Route Table",
  },
  VPNGateway: {
    slug: "aws-res-amazon-vpc-vpn-gateway",
    precision: "exact",
    category: "networking",
    scope: "vpc-boundary",
    name: "Site-to-Site VPN Gateway",
    short: "VPN GW",
  },
  CustomerGateway: {
    slug: "aws-res-amazon-vpc-customer-gateway",
    precision: "exact",
    category: "networking",
    scope: "external",
    name: "Customer Gateway",
    short: "CGW",
  },
  VPCPeering: {
    slug: "aws-res-amazon-vpc-peering-connection",
    precision: "exact",
    category: "networking",
    scope: "vpc-boundary",
    name: "VPC Peering Connection",
    short: "Peering",
  },
  FlowLogs: {
    slug: "aws-res-amazon-vpc-flow-logs",
    precision: "exact",
    category: "management",
    scope: "regional",
    name: "VPC Flow Logs",
    short: "Flow Logs",
  },
  Route53: {
    slug: "aws-amazon-route-53",
    precision: "exact",
    category: "networking",
    // Route 53 sits ABOVE the region frame in AWS reference diagrams.
    scope: "global",
    name: "Route 53",
    short: "Route 53",
  },

  // ------------------------------------------------ application integration
  APIGateway: {
    slug: "aws-amazon-api-gateway",
    precision: "exact",
    category: "integration",
    scope: "regional",
    name: "API Gateway",
    short: "APIGW",
  },
  SQS: {
    slug: "aws-amazon-simple-queue-service",
    precision: "exact",
    category: "integration",
    scope: "regional",
    name: "SQS Queue",
    short: "SQS",
  },
  SNSTopic: {
    slug: "aws-amazon-simple-notification-service",
    precision: "exact",
    category: "integration",
    scope: "regional",
    name: "SNS Topic",
    short: "SNS",
  },
  EventBridge: {
    slug: "aws-amazon-eventbridge",
    precision: "exact",
    category: "integration",
    scope: "regional",
    name: "EventBridge Rule",
    short: "EventBridge",
  },
  EventBus: {
    slug: "aws-res-amazon-eventbridge-custom-event-bus",
    precision: "exact",
    category: "integration",
    scope: "regional",
    name: "EventBridge Event Bus",
    short: "Event Bus",
  },
  StepFunction: {
    slug: "aws-aws-step-functions",
    precision: "exact",
    category: "integration",
    scope: "regional",
    name: "Step Functions State Machine",
    short: "SFN",
  },

  // ---------------------------------------------------- security & identity
  KMSKey: {
    slug: "aws-aws-key-management-service",
    precision: "exact",
    category: "security",
    scope: "regional",
    name: "KMS Key",
    short: "KMS",
  },
  SecretsManagerSecret: {
    slug: "aws-aws-secrets-manager",
    precision: "exact",
    category: "security",
    scope: "regional",
    name: "Secrets Manager Secret",
    short: "Secret",
  },
  IAMRole: {
    slug: "aws-res-aws-identity-access-management-role",
    precision: "exact",
    category: "security",
    scope: "global",
    name: "IAM Role",
    short: "Role",
  },
  IAMPolicy: {
    slug: "aws-res-aws-identity-access-management-permissions",
    precision: "exact",
    category: "security",
    scope: "global",
    name: "IAM Policy",
    short: "Policy",
  },
  IAMUser: {
    // AWS ships no IAM *user* resource icon in this collection; the service
    // icon is the honest stand-in and is marked as such.
    slug: "aws-aws-identity-and-access-management",
    precision: "family",
    category: "security",
    scope: "global",
    name: "IAM User",
    short: "User",
  },
  InstanceProfile: {
    slug: "aws-res-aws-identity-access-management-role",
    precision: "family",
    category: "security",
    scope: "global",
    name: "Instance Profile",
    short: "Instance Profile",
  },
  STSSession: {
    slug: "aws-res-aws-identity-access-management-temporary-security-credential",
    precision: "exact",
    category: "security",
    scope: "global",
    name: "Temporary Security Credential",
    short: "STS",
  },
  SCP: {
    slug: "aws-res-aws-identity-access-management-permissions",
    precision: "family",
    category: "security",
    scope: "global",
    name: "Service Control Policy",
    short: "SCP",
  },

  // ------------------------------------------------- management & governance
  Account: {
    slug: "aws-res-aws-organizations-account",
    precision: "exact",
    category: "management",
    scope: "container",
    name: "AWS Account",
    short: "Account",
  },
  Organization: {
    slug: "aws-aws-organizations",
    precision: "exact",
    category: "management",
    scope: "global",
    name: "AWS Organizations",
    short: "Organizations",
  },
  CloudTrail: {
    slug: "aws-aws-cloudtrail",
    precision: "exact",
    category: "management",
    scope: "regional",
    name: "CloudTrail Trail",
    short: "CloudTrail",
  },
  CloudWatchLogGroup: {
    slug: "aws-res-amazon-cloudwatch-logs",
    precision: "exact",
    category: "management",
    scope: "regional",
    name: "CloudWatch Log Group",
    short: "Log Group",
  },
  ConfigRule: {
    slug: "aws-aws-config",
    precision: "exact",
    category: "management",
    scope: "regional",
    name: "Config Rule",
    short: "Config",
  },
  SSMAssociation: {
    slug: "aws-aws-systems-manager",
    precision: "family",
    category: "management",
    scope: "regional",
    name: "Systems Manager Association",
    short: "SSM",
  },
  AthenaWorkgroup: {
    slug: "aws-amazon-athena",
    precision: "exact",
    category: "analytics",
    scope: "regional",
    name: "Athena Workgroup",
    short: "Athena",
  },

  // ------------------------------------------------------------- containers
  // Frames, not nodes. The icon (where one exists) is for the legend and the
  // collapsed state only — the renderer draws these as boundaries.
  VPC: {
    slug: "aws-amazon-virtual-private-cloud",
    precision: "exact",
    category: "networking",
    scope: "container",
    name: "VPC",
    short: "VPC",
  },
  Subnet: {
    // No subnet icon exists in the official set: a subnet is a tinted card.
    slug: null,
    precision: "none",
    category: "networking",
    scope: "container",
    name: "Subnet",
    short: "Subnet",
  },
  SecurityGroup: {
    // Deliberately icon-less. AWS draws a security group as a DASHED BOUNDARY
    // around what it protects, never as a node.
    slug: null,
    precision: "none",
    category: "networking",
    scope: "container",
    name: "Security Group",
    short: "SG",
  },

  // ------------------------------------------------------------- off-estate
  Internet: {
    slug: null,
    precision: "none",
    category: "neutral",
    scope: "external",
    name: "Internet",
    short: "Internet",
  },
}

/**
 * Every spelling the graph emits → canonical CATALOG key.
 *
 * The right-hand side must be a CATALOG key; the unit test proves it, so a
 * typo here fails CI instead of silently dropping an icon.
 */
const ALIASES: Record<string, string> = {
  // compute
  EC2Instance: "EC2",
  LambdaFunction: "Lambda",
  ASG: "AutoScalingGroup",

  // containers
  ECSCluster: "ECS",
  EKSCluster: "EKS",
  K8sCluster: "EKS",

  // storage
  S3Bucket: "S3",

  // database — the RDS family and the two engine retypes
  RDSInstance: "RDS",
  RDSCluster: "RDS",
  DBInstance: "RDS",
  DBCluster: "RDS",
  NeptuneCluster: "Neptune",
  NeptuneInstance: "Neptune",
  NeptuneGraph: "Neptune",
  NeptuneDBCluster: "Neptune",
  DocumentDBCluster: "DocumentDB",
  DocumentDBInstance: "DocumentDB",
  DocDB: "DocumentDB",
  DocDBCluster: "DocumentDB",
  DocDBInstance: "DocumentDB",
  DynamoDBTable: "DynamoDB",

  // networking
  ALB: "LoadBalancer",
  ApplicationLoadBalancer: "LoadBalancer",
  NetworkLoadBalancer: "NLB",
  IGW: "InternetGateway",
  NAT: "NATGateway",
  NatGateway: "NATGateway",
  VPCE: "VPCEndpoint",
  ENI: "NetworkInterface",
  NetworkACL: "NACL",
  Domain: "Route53",

  // integration — note the THREE API Gateway spellings in this graph
  ApiGateway: "APIGateway",
  APIGATEWAY: "APIGateway",
  SQSQueue: "SQS",
  SNS: "SNSTopic",
  EventBridgeRule: "EventBridge",
  EventBridgeTarget: "EventBridge",
  EventSource: "EventBridge",
  StateMachine: "StepFunction",

  // security
  Secret: "SecretsManagerSecret",

  // management
  AWSAccount: "Account",
  CloudTrailTrail: "CloudTrail",
  SSMStateManagerAssociation: "SSMAssociation",
}

/** Resolve any graph spelling to its canonical CATALOG key. */
export function awsCanonicalType(type: string | null | undefined): string | null {
  if (!type) return null
  if (CATALOG[type]) return type
  const aliased = ALIASES[type]
  return aliased && CATALOG[aliased] ? aliased : null
}

/**
 * Full presentation record, or null when this type is not a recognized AWS
 * resource. Null is a real answer: the caller must render an honest
 * "type unresolved" card rather than guessing a glyph.
 */
export function awsPresentation(
  type: string | null | undefined,
): AwsServicePresentation | null {
  const key = awsCanonicalType(type)
  return key ? CATALOG[key] : null
}

export function awsIconSlug(type: string | null | undefined): string | null {
  return awsPresentation(type)?.slug ?? null
}

export function awsIconUrl(type: string | null | undefined): string | null {
  const slug = awsIconSlug(type)
  return slug ? `${CDN}/${slug}/default.svg` : null
}

/**
 * Where this service belongs in the AWS canonical nesting. `null` for an
 * unrecognized type — the caller sends those to the explicit unplaced area
 * instead of dropping them or guessing a cell.
 */
export function awsPlacementScope(
  type: string | null | undefined,
): AwsPlacementScope | null {
  return awsPresentation(type)?.scope ?? null
}

export function awsCategory(type: string | null | undefined): AwsCategory | null {
  return awsPresentation(type)?.category ?? null
}

/**
 * True when the icon shown is borrowed from the parent service rather than
 * being the official icon for this exact resource. The map surfaces this so a
 * family icon is never read as precise evidence of resource type.
 */
export function awsIconIsFamilyFallback(type: string | null | undefined): boolean {
  return awsPresentation(type)?.precision === "family"
}

/** Compact family label for a service chip or a stacked service group. */
export function awsServiceLabel(type: string): string {
  const hit = awsPresentation(type)
  if (hit) return hit.short
  // Unknown type: strip the graph's noun suffixes so the card reads as a name
  // rather than a schema token. Never invent a service name.
  return type.replace(/Function|Instance|Table|Bucket|Manager/g, "") || type
}

/**
 * Precise AWS service name, for tooltips and detail panels. AWS's own
 * convention: never "load balancer", always "Application Load Balancer".
 */
export function awsServiceFullName(type: string): string {
  return awsPresentation(type)?.name ?? awsServiceLabel(type)
}

/** Exported for the unit test and the catalog doc; not for rendering. */
export const __catalogForTest = { CATALOG, ALIASES, CDN }
