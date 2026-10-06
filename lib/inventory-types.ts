/**
 * Every resource_type an account inventory row can carry, named for people: its group label, the shared service-type
 * descriptor that gives it an icon and colors (lib/service-type.tsx), and the summary-card category it counts under.
 *
 * The set is the backend's own: certified_inventory_scopes (cyntro_data/projection/inventory_authority_project.py) plus
 * the Kubernetes kinds (cyntro_data/k8s/normalize.py PHASE1_KINDS), captured by executing them
 * (__tests__/fixtures/account-inventory-types/resource-types.json) -- a test fails when a served type has no entry here.
 * Explicit on purpose: the fuzzy resolver reads "ec2:subnet" as an EC2 instance and an organization policy context as
 * an IAM policy. A type this table does not know is shown by its own spelling with the neutral descriptor, never guessed.
 */
import { SERVICE_TYPE_CONFIG, type CanonicalServiceType, type ServiceMeta } from "@/lib/service-type"

/** The summary cards: what a resource IS for an operator, not the AWS service it belongs to. A resource-based policy
 *  ("KMS key policies") counts under Identity & access, where its question is. */
export type InventoryCategory = "compute" | "data" | "identity" | "network" | "other"

export const INVENTORY_CATEGORY_LABEL: Record<InventoryCategory, string> = {
  compute: "Compute",
  data: "Data & storage",
  identity: "Identity & access",
  network: "Network",
  other: "Account & other",
}

export interface InventoryTypeMeta {
  resourceType: string
  /** The group heading: plural, sentence case ("Security groups"). */
  label: string
  category: InventoryCategory
  service: ServiceMeta
}

const T = (label: string, category: InventoryCategory, canonical: CanonicalServiceType) => ({ label, category, canonical })

const TYPES: Record<string, { label: string; category: InventoryCategory; canonical: CanonicalServiceType }> = {
  "ec2:instance": T("EC2 instances", "compute", "EC2"),
  "lambda:function": T("Lambda functions", "compute", "Lambda"),
  "eks:cluster": T("EKS clusters", "compute", "EKS"),
  "s3:bucket": T("S3 buckets", "data", "S3"),
  "rds:db-instance": T("RDS instances", "data", "RDS"),
  "rds:db-cluster": T("RDS clusters", "data", "RDS"),
  "iam:role": T("IAM roles", "identity", "IAMRole"),
  "iam:policy": T("IAM policies", "identity", "IAMPolicy"),
  "s3:bucket-authorization": T("S3 bucket policies", "identity", "S3"),
  "lambda:function-authorization": T("Lambda resource policies", "identity", "Lambda"),
  "kms:key-authorization": T("KMS key policies", "identity", "KMS"),
  "secretsmanager:secret-authorization": T("Secrets Manager policies", "identity", "SecretsManager"),
  "sqs:queue-authorization": T("SQS queue policies", "identity", "SQS"),
  "sns:topic-authorization": T("SNS topic policies", "identity", "SNS"),
  "events:event-bus-authorization": T("EventBridge policies", "identity", "EventBridge"),
  "ec2:vpc-endpoint-authorization": T("VPC endpoint policies", "identity", "VPCEndpoint"),
  "ec2:vpc": T("VPCs", "network", "VPC"),
  "ec2:subnet": T("Subnets", "network", "Subnet"),
  "ec2:security-group": T("Security groups", "network", "SecurityGroup"),
  "ec2:network-acl": T("Network ACLs", "network", "NACL"),
  "ec2:route-table": T("Route tables", "network", "RouteTable"),
  "ec2:network-interface": T("Network interfaces", "network", "NetworkInterface"),
  "ec2:internet-gateway": T("Internet gateways", "network", "InternetGateway"),
  "ec2:nat-gateway": T("NAT gateways", "network", "NATGateway"),
  "ec2:vpc-endpoint": T("VPC endpoints", "network", "VPCEndpoint"),
  "elasticloadbalancing:load-balancer": T("Load balancers", "network", "LoadBalancer"),
  "elasticloadbalancing:target-group": T("Target groups", "network", "LoadBalancer"),
  "elasticloadbalancing:listener": T("Load balancer listeners", "network", "LoadBalancer"),
  "account:regions": T("Regions", "other", "Account"),
  "organizations:account-policy-context": T("Organization policy context", "other", "Account"),
}

/** Kubernetes kinds, as their group label reads after "Kubernetes ". */
const K8S_KINDS: Record<string, string> = {
  namespace: "namespaces", serviceaccount: "service accounts", pod: "pods", service: "services",
  endpointslice: "endpoint slices", role: "roles", clusterrole: "cluster roles", rolebinding: "role bindings",
  clusterrolebinding: "cluster role bindings", networkpolicy: "network policies", node: "nodes",
  deployment: "deployments", statefulset: "stateful sets", daemonset: "daemon sets", replicaset: "replica sets",
  job: "jobs", cronjob: "cron jobs", ingress: "ingresses",
}

/** Whether this table names the type (a test pins every served type to true). */
export function knownInventoryType(resourceType: string): boolean {
  if (resourceType in TYPES) return true
  return resourceType.startsWith("k8s:") && resourceType.slice(4) in K8S_KINDS
}

export function inventoryTypeMeta(resourceType: string): InventoryTypeMeta {
  const entry = TYPES[resourceType]
  if (entry) return { resourceType, label: entry.label, category: entry.category, service: SERVICE_TYPE_CONFIG[entry.canonical] }
  if (resourceType.startsWith("k8s:") && resourceType.slice(4) in K8S_KINDS) {
    return {
      resourceType,
      label: `Kubernetes ${K8S_KINDS[resourceType.slice(4)]}`,
      category: "compute",
      service: SERVICE_TYPE_CONFIG.Kubernetes,
    }
  }
  return { resourceType, label: resourceType, category: "other", service: SERVICE_TYPE_CONFIG.Resource }
}
