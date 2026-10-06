/**
 * The account inventory's row v3 `details` (backend cyntro_data/projection/account_inventory_rows.py DETAIL_ATTRIBUTES; I1):
 * every allowed attribute named for people, how its value reads, which two or three of them a type's group shows as columns,
 * the type's own date (with its honest label: an EC2 instance is LAUNCHED, a Lambda function LAST MODIFIED), and the facts
 * that say a resource answers from the internet. The allow-list is captured by executing the backend
 * (__tests__/fixtures/account-inventory-types/detail-attributes.json); a test fails when an allowed attribute has no label here.
 * A value is shown exactly as collected: nothing is inferred, a missing attribute is simply not shown.
 */
import { formatUtcInstantExact } from "@/lib/account-admin"

export type DetailValue = string | number | boolean
type Format = "text" | "id" | "bool" | "count" | "time" | "mb" | "seconds"

const L = (label: string, format: Format = "text") => ({ label, format })

/** Every attribute the allow-list can serve (shared names -- vpc_id, aws_state -- read the same for every type). */
export const DETAIL_LABELS: Record<string, { label: string; format: Format }> = {
  instance_state: L("State"), instance_type: L("Instance type"), vpc_id: L("VPC", "id"), subnet_id: L("Subnet", "id"),
  private_ip: L("Private IP", "id"), iam_instance_profile: L("Instance profile", "id"), launch_time: L("Launched", "time"),
  runtime: L("Runtime"), memory_size: L("Memory", "mb"), timeout: L("Timeout", "seconds"), is_vpc_attached: L("In a VPC", "bool"),
  last_modified: L("Last modified", "time"),
  engine: L("Engine"), engine_version: L("Engine version"), db_instance_class: L("Instance class"), multi_az: L("Multi-AZ", "bool"),
  publicly_accessible: L("Publicly accessible", "bool"), storage_encrypted: L("Storage encrypted", "bool"),
  aws_state: L("State"), instance_create_time: L("Created", "time"), engine_mode: L("Engine mode"),
  cluster_create_time: L("Created", "time"),
  region: L("Bucket Region", "id"), creation_date: L("Created", "time"),
  create_date: L("Created", "time"), path: L("Path", "id"), max_session_duration: L("Max session", "seconds"),
  permissions_boundary: L("Permissions boundary", "id"),
  aws_managed: L("AWS managed", "bool"), attachment_count: L("Attachments", "count"), update_date: L("Updated", "time"),
  cidr_block: L("CIDR", "id"), availability_zone: L("Availability Zone", "id"),
  map_public_ip_on_launch: L("Public IP on launch", "bool"), available_ip_address_count: L("Free IPs", "count"),
  default_for_az: L("Default for its AZ", "bool"),
  description: L("Description"), ingress_rule_count: L("Inbound rules", "count"), egress_rule_count: L("Outbound rules", "count"),
  is_default: L("Default", "bool"), instance_tenancy: L("Tenancy"),
  ingress_entry_count: L("Inbound entries", "count"), egress_entry_count: L("Outbound entries", "count"),
  association_count: L("Associations", "count"),
  route_count: L("Routes", "count"), has_igw_route: L("Route to an internet gateway", "bool"),
  has_nat_route: L("Route to a NAT gateway", "bool"), is_main: L("Main route table", "bool"),
  interface_type: L("Interface type"), association_public_ip: L("Public IP", "id"),
  attachment_instance_id: L("Attached instance", "id"),
  connectivity_type: L("Connectivity"), attached_vpc_count: L("Attached VPCs", "count"),
  vpc_endpoint_type: L("Endpoint type"), service_name: L("Service", "id"), private_dns_enabled: L("Private DNS", "bool"),
  scheme: L("Scheme"), load_balancer_type: L("Type"), dns_name: L("DNS name", "id"),
  target_type: L("Target type"), protocol: L("Protocol"), port: L("Port", "count"),
  version: L("Kubernetes version"), status: L("Status"),
  endpoint_public_access: L("Public endpoint", "bool"), endpoint_private_access: L("Private endpoint", "bool"),
  key_state: L("Key state"), key_manager: L("Key manager"),
}

/** The two or three facts a type's group shows as columns (each is on that type's allow-list; a test checks). */
export const SUMMARY_COLUMNS: Record<string, string[]> = {
  "ec2:instance": ["instance_type", "instance_state", "private_ip"],
  "lambda:function": ["runtime", "memory_size"],
  "rds:db-instance": ["engine", "db_instance_class", "publicly_accessible"],
  "rds:db-cluster": ["engine", "engine_mode", "publicly_accessible"],
  "s3:bucket": ["region"],
  "iam:role": ["path", "max_session_duration"],
  "iam:policy": ["aws_managed", "attachment_count"],
  "ec2:subnet": ["cidr_block", "availability_zone", "map_public_ip_on_launch"],
  "ec2:security-group": ["vpc_id", "ingress_rule_count", "egress_rule_count"],
  "ec2:vpc": ["cidr_block", "is_default"],
  "ec2:network-acl": ["vpc_id", "association_count"],
  "ec2:route-table": ["vpc_id", "route_count", "has_igw_route"],
  "ec2:network-interface": ["interface_type", "subnet_id", "association_public_ip"],
  "ec2:nat-gateway": ["connectivity_type", "subnet_id"],
  "ec2:internet-gateway": ["attached_vpc_count"],
  "ec2:vpc-endpoint": ["vpc_endpoint_type", "service_name"],
  "elasticloadbalancing:load-balancer": ["scheme", "load_balancer_type"],
  "elasticloadbalancing:target-group": ["protocol", "port", "target_type"],
  "eks:cluster": ["version", "endpoint_public_access"],
  "kms:key-authorization": ["key_state", "key_manager"],
}

/** The type's own date attribute -- its column is headed by that attribute's label (Launched / Created / Updated ...). */
export const DATE_ATTRIBUTE: Record<string, string> = {
  "ec2:instance": "launch_time", "lambda:function": "last_modified", "rds:db-instance": "instance_create_time",
  "rds:db-cluster": "cluster_create_time", "s3:bucket": "creation_date", "iam:role": "create_date",
  "iam:policy": "update_date", "kms:key-authorization": "creation_date",
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/

export function detailLabel(name: string): string {
  return DETAIL_LABELS[name]?.label ?? name
}

/** A value exactly as collected, in words: Yes/No, a UTC time, a unit -- never a guess. */
export function formatDetail(name: string, value: DetailValue): string {
  const format = DETAIL_LABELS[name]?.format ?? "text"
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (typeof value === "number") {
    if (format === "mb") return `${value} MB`
    if (format === "seconds") return `${value} s`
    return String(value)
  }
  if (format === "time" && ISO.test(value)) return formatUtcInstantExact(value)
  return value
}

/** The facts on a row that say it answers from the internet, each named as the fact itself (never a risk verdict). */
export function internetFacingFacts(resourceType: string, details: Record<string, DetailValue> | undefined): string[] {
  if (!details) return []
  const facts: string[] = []
  if (resourceType === "elasticloadbalancing:load-balancer" && details.scheme === "internet-facing") facts.push("scheme = internet-facing")
  if ((resourceType === "rds:db-instance" || resourceType === "rds:db-cluster") && details.publicly_accessible === true) {
    facts.push("publicly_accessible = true")
  }
  if (resourceType === "ec2:subnet" && details.map_public_ip_on_launch === true) facts.push("map_public_ip_on_launch = true")
  if (resourceType === "ec2:network-interface" && typeof details.association_public_ip === "string" && details.association_public_ip) {
    facts.push(`public IP ${details.association_public_ip}`)
  }
  if (resourceType === "eks:cluster" && details.endpoint_public_access === true) facts.push("endpoint_public_access = true")
  return facts
}
