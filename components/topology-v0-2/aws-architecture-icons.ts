/**
 * Official AWS Architecture Icons via theSVG CDN
 * (https://thesvg.org/collection/aws — CC BY-ND 2.0, unmodified).
 *
 * Generic type → slug map. Never invents resources; only picks an icon
 * for a real TopologyNode.type / edge kind.
 */

const CDN = "https://thesvg.org/icons"

/** Verified slugs from thesvg AWS collection (2026-Q1). */
const SLUG: Record<string, string> = {
  EC2: "aws-amazon-ec2",
  Lambda: "aws-aws-lambda",
  LambdaFunction: "aws-aws-lambda",
  RDS: "aws-amazon-rds",
  RDSInstance: "aws-amazon-rds",
  DynamoDB: "aws-amazon-dynamodb",
  DynamoDBTable: "aws-amazon-dynamodb",
  S3: "aws-amazon-simple-storage-service",
  S3Bucket: "aws-amazon-simple-storage-service",
  LoadBalancer: "aws-res-elastic-load-balancing-application-load-balancer",
  ALB: "aws-res-elastic-load-balancing-application-load-balancer",
  ApplicationLoadBalancer: "aws-res-elastic-load-balancing-application-load-balancer",
  NLB: "aws-res-elastic-load-balancing-network-load-balancer",
  NetworkLoadBalancer: "aws-res-elastic-load-balancing-network-load-balancer",
  AutoScalingGroup: "aws-amazon-ec2-auto-scaling",
  ASG: "aws-amazon-ec2-auto-scaling",
  ECS: "aws-amazon-elastic-container-service",
  ECSService: "aws-amazon-elastic-container-service",
  EKS: "aws-amazon-elastic-kubernetes-service",
  EKSCluster: "aws-amazon-elastic-kubernetes-service",
  KMSKey: "aws-aws-key-management-service",
  Secret: "aws-aws-secrets-manager",
  SecretsManagerSecret: "aws-aws-secrets-manager",
  // Edge metadata (not TopologyNode types)
  IGW: "aws-res-amazon-vpc-internet-gateway",
  NAT: "aws-res-amazon-vpc-nat-gateway",
  VPCE: "aws-res-amazon-vpc-endpoints",
}

export function awsIconSlug(type: string | null | undefined): string | null {
  if (!type) return null
  return SLUG[type] ?? null
}

export function awsIconUrl(type: string | null | undefined): string | null {
  const slug = awsIconSlug(type)
  if (!slug) return null
  return `${CDN}/${slug}/default.svg`
}

/** Human label for a stacked service group. */
export function awsServiceLabel(type: string): string {
  switch (type) {
    case "Lambda":
    case "LambdaFunction":
      return "Lambda"
    case "AutoScalingGroup":
    case "ASG":
      return "Auto Scaling"
    case "LoadBalancer":
    case "ALB":
    case "ApplicationLoadBalancer":
      return "ALB"
    case "RDS":
    case "RDSInstance":
      return "RDS"
    case "DynamoDB":
    case "DynamoDBTable":
      return "DynamoDB"
    case "S3":
    case "S3Bucket":
      return "S3"
    case "EC2":
      return "EC2"
    default:
      return type.replace(/Function|Instance|Table|Bucket|Manager/g, "") || type
  }
}
