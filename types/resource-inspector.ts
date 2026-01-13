/**
 * Resource Inspector Types
 * ========================
 *
 * Unified types for all resource inspector modals.
 * Each resource type has a consistent 3-section structure:
 * 1. Current (configured state)
 * 2. Observed (evidence from logs)
 * 3. Remove (recommendations)
 */

// Base inspector data shared by all resource types
export interface BaseInspectorData {
  resource_type: string
  resource_id: string
  resource_name: string
  icon: string
  evidence: string[]
}

// Common section structures
export interface RemoveItem {
  type?: string
  rule_number?: number
  message: string
  severity: 'high' | 'warning' | 'info'
  action?: string
  reason?: string
  rule_summary?: string
}

export interface RemoveSection {
  title: string
  items: RemoveItem[]
  count: number
}

export interface ObservedSection {
  title: string
  source: string
  window?: string
  available: boolean
  message?: string
}

// ============================================================================
// SECURITY GROUP
// ============================================================================

export interface SGConfiguredRule {
  direction: string
  protocol: string
  from_port: number
  to_port: number
  port_display: string
  port_name: string | null
  source_cidr: string | null
  source_sg: string | null
  source_sg_name: string | null
  source_type: string
  description: string
  is_public: boolean
  status: 'used' | 'unused' | 'unknown'
  flow_count: number
  last_seen: string | null
}

export interface SGSourceIP {
  ip: string
  flow_count: number
  last_seen: string | null
}

export interface SGInspectorData extends BaseInspectorData {
  resource_type: 'SecurityGroup'
  sg_name: string
  vpc_id: string
  description: string
  system_name: string | null
  environment: string | null
  health_status: string
  gap_count: number
  summary: {
    total_rules: number
    used_rules: number
    unused_rules: number
    unknown_rules: number
    public_rules: number
  }
  configured_rules: SGConfiguredRule[]
  top_source_ips: SGSourceIP[]
  unique_source_count: number
  recommendations: RemoveItem[] | null
  last_updated: string
}

// ============================================================================
// NETWORK ACL
// ============================================================================

export interface NACLRule {
  rule_number: number
  protocol: string
  port_range: string
  source: string
  action: 'ALLOW' | 'DENY'
  is_default_rule: boolean
}

export interface NACLSubnet {
  id: string
  association_id?: string
  cidr?: string
  az?: string
}

export interface NACLInspectorData extends BaseInspectorData {
  resource_type: 'NetworkACL'
  current: {
    title: string
    source: string
    vpc_id: string
    is_default: boolean
    inbound_rules: NACLRule[]
    outbound_rules: NACLRule[]
    associated_subnets: NACLSubnet[]
    total_rules: number
  }
  observed: ObservedSection
  remove: RemoveSection | null
}

// ============================================================================
// IAM ROLE
// ============================================================================

export interface IAMPolicy {
  name: string
  arn?: string
  type: 'AWS Managed' | 'Customer Managed' | 'Inline'
  permissions?: string[]
}

export interface IAMRoleInspectorData extends BaseInspectorData {
  resource_type: 'IAMRole'
  arn: string
  current: {
    title: string
    source: string
    description: string
    create_date: string
    policies: IAMPolicy[]
    total_policies: number
  }
  observed: ObservedSection
  remove: RemoveSection | null
}

// ============================================================================
// S3 BUCKET
// ============================================================================

export interface S3PublicAccessBlock {
  block_public_acls: boolean
  ignore_public_acls: boolean
  block_public_policy: boolean
  restrict_public_buckets: boolean
  is_public: boolean
}

export interface S3PolicyStatement {
  effect: string
  principal: string | object
  actions: string[]
  resources: string[]
}

export interface S3InspectorData extends BaseInspectorData {
  resource_type: 'S3'
  current: {
    title: string
    source: string
    public_access_block: S3PublicAccessBlock
    bucket_policy: {
      exists: boolean
      statements: S3PolicyStatement[]
    } | null
  }
  observed: ObservedSection
  remove: RemoveSection | null
}

// ============================================================================
// RDS INSTANCE
// ============================================================================

export interface RDSSecurityGroup {
  sg_id: string
  status: string
}

export interface RDSInspectorData extends BaseInspectorData {
  resource_type: 'RDS'
  db_engine: string
  db_port: number
  current: {
    title: string
    source: string
    publicly_accessible: boolean
    security_groups: RDSSecurityGroup[]
    endpoint: string
    vpc_id: string
  }
  observed: ObservedSection
  remove: RemoveSection | null
}

// ============================================================================
// EC2 INSTANCE
// ============================================================================

export interface EC2SecurityGroup {
  sg_id: string
  sg_name: string
}

export interface EC2Network {
  vpc_id: string
  subnet_id: string
  private_ip: string
  public_ip: string
}

export interface EC2InspectorData extends BaseInspectorData {
  resource_type: 'EC2'
  state: string
  instance_type: string
  current: {
    title: string
    source: string
    security_groups: EC2SecurityGroup[]
    iam_role: {
      arn: string
      id: string
    } | null
    network: EC2Network
  }
  observed: ObservedSection
  remove: RemoveSection | null
}

// ============================================================================
// UNION TYPE
// ============================================================================

export type ResourceInspectorData =
  | SGInspectorData
  | NACLInspectorData
  | IAMRoleInspectorData
  | S3InspectorData
  | RDSInspectorData
  | EC2InspectorData
  | (BaseInspectorData & { supported: false; message: string })
