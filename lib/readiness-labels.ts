/** Map All Services display types to Neo4j labels for decision-coverage API. */
const DISPLAY_TO_NEO4J_LABEL: Record<string, string> = {
  Lambda: "LambdaFunction",
  LambdaFunction: "LambdaFunction",
  S3: "S3Bucket",
  S3Bucket: "S3Bucket",
  KMS: "KMSKey",
  KMSKey: "KMSKey",
  ENI: "NetworkInterface",
  NetworkInterface: "NetworkInterface",
  CloudTrail: "CloudTrailTrail",
  CloudTrailTrail: "CloudTrailTrail",
  SQS: "SQSQueue",
  SQSQueue: "SQSQueue",
  DynamoDB: "DynamoDBTable",
  DynamoDBTable: "DynamoDBTable",
  RDS: "RDSInstance",
  RDSInstance: "RDSInstance",
  EC2: "EC2Instance",
  EC2Instance: "EC2Instance",
  ALB: "LoadBalancer",
  NLB: "LoadBalancer",
  LoadBalancer: "LoadBalancer",
  SecurityGroup: "SecurityGroup",
  IAMRole: "IAMRole",
  IAMPolicy: "IAMPolicy",
  VPC: "VPC",
  RouteTable: "RouteTable",
  Subnet: "Subnet",
  InternetGateway: "InternetGateway",
}

export function toNeo4jLabel(resourceType: string): string | null {
  const mapped = DISPLAY_TO_NEO4J_LABEL[resourceType] ?? resourceType
  return mapped || null
}

export interface ReadinessPayload {
  resource_id: string
  neo4j_label: string
  system_name?: string | null
  inventory: boolean
  config_collected: boolean
  evidence_collected: boolean
  remediation_ready: boolean
  max_outcome: string
  missing?: string[]
  surface_id?: string | null
}

export const READINESS_LAYER_LABELS = [
  { key: "inventory" as const, label: "In inventory" },
  { key: "config_collected" as const, label: "Config collected" },
  { key: "evidence_collected" as const, label: "Evidence collected" },
  { key: "remediation_ready" as const, label: "Remediation ready" },
]

export function formatMaxOutcome(outcome: string): string {
  return outcome.replace(/_/g, " ").toLowerCase()
}
