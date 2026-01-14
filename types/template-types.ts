/**
 * Cyntro Template Registry Types
 *
 * TypeScript definitions for the template registry.
 * Used by UniversalTemplateRenderer to render consistent decision artifacts.
 */

// =============================================================================
// CORE ENUMS
// =============================================================================

export type Plane = 'configured' | 'observed' | 'changed' | 'authorized';

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'unknown';

export type GapStatus = 'used' | 'unobserved' | 'unknown';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type Severity = 'info' | 'warning' | 'critical';

export type SlotType = 'static' | 'dynamic';

export type SectionFocus = 'network' | 'identity' | 'mixed';

// =============================================================================
// PLANE DEFINITIONS
// =============================================================================

export interface PlaneDefinition {
  label: string;
  description: string;
  sources: string[];
  color: string;
}

export interface PlaneRequirement {
  required?: boolean;
  strongly_recommended?: boolean;
  recommended?: boolean;
  optional?: boolean;
  not_applicable?: boolean;
  sources: string[];
  fallback_reason?: string;
}

export interface PlaneCoverage {
  available: boolean;
  source: string | null;
  reason: string | null;
  coverage_percent?: number;
  last_updated?: string;
}

// =============================================================================
// CONFIDENCE DEFINITIONS
// =============================================================================

export interface ConfidenceDefinition {
  label: string;
  min_coverage_days: number;
  min_telemetry_percent: number;
  allow_gap_suggestions: boolean;
  allow_remove_actions: boolean;
  color: string;
  show_reason?: boolean;
}

// =============================================================================
// GAP STATUS DEFINITIONS
// =============================================================================

export interface GapStatusDefinition {
  label: string;
  description: string;
  color: string;
  icon: string;
  action: string | null;
  min_confidence?: ConfidenceLevel;
  reason_required?: boolean;
}

// =============================================================================
// SECTION DEFINITIONS
// =============================================================================

export interface SectionField {
  key: string;
  label: string;
  type?: string;
  computed?: boolean;
  editable?: boolean;
  options?: string[];
  optional?: boolean;
  warn_if_true?: boolean;
}

export interface SectionSubsection {
  id: string;
  title: string;
  fields?: string[];
  query_id?: string;
  limit?: number;
  sort_by?: string;
  type?: string;
  condition?: string;
  show_if?: string;
  show_if_available?: boolean;
  show_if_exists?: boolean;
  ordered?: boolean;
  flags?: Record<string, { pattern: string; severity: Severity; label?: string }>;
  compare?: {
    allowed: { source: string; field?: string };
    observed: { source: string; field?: string };
  };
  min_confidence?: ConfidenceLevel;
  source?: string;
  link_to?: string;
}

export interface SectionEnhancement {
  source: string;
  title?: string;
  show_if_available: boolean;
  fields: string[];
}

export interface UniversalSection {
  order: number;
  slot_type: SlotType;
  title?: string;
  always_show?: boolean;
  fields?: SectionField[];
  plane?: Plane;
  planes?: Plane[];
  subsections?: string[];
  show_unknown_state?: boolean;
  confidence_gated?: boolean;
  min_confidence?: ConfidenceLevel;
  description?: string;
  max_entries?: number;
  max_items?: number;
  deterministic?: boolean;
}

// =============================================================================
// RESOURCE TEMPLATE SECTIONS
// =============================================================================

export interface WhatHappenedSection {
  focus: SectionFocus;
  source?: string;
  sources?: string[];
  requires_data_events?: boolean;
  note?: string;
  confidence_warning?: string;
  fallback?: {
    message: string;
    confidence: ConfidenceLevel;
  };
  subsections: SectionSubsection[];
  enhancements?: SectionEnhancement[];
}

export interface WhatAllowedSubsection {
  title: string;
  plane?: Plane;
  planes?: Plane[];
  show_if?: string;
  note?: string;
  subsections: SectionSubsection[];
}

export interface WhatAllowedSection {
  network?: WhatAllowedSubsection;
  identity?: WhatAllowedSubsection;
}

export interface GapAnalysisSection {
  requires_observed?: boolean;
  confidence_gate?: boolean;
  note?: string;
  subsections: SectionSubsection[];
}

export interface BlastRadiusSection {
  query_id: string;
  hops?: number;
  critical?: boolean;
  message?: string;
}

export interface ChangeHistorySection {
  events: string[];
}

export interface InsightRule {
  id: string;
  condition: string;
  template: string;
  severity: Severity;
  cites: Plane[];
}

export interface InsightsSection {
  rules: InsightRule[];
}

export interface ResourceTemplateSections {
  what_happened?: WhatHappenedSection;
  what_allowed?: WhatAllowedSection;
  gap_analysis?: GapAnalysisSection;
  blast_radius?: BlastRadiusSection;
  change_history?: ChangeHistorySection;
  insights?: InsightsSection;
}

// =============================================================================
// RESOURCE TEMPLATE
// =============================================================================

export interface ResourceTemplate {
  display_name: string;
  icon: string;
  color: string;
  planes: Record<Plane, PlaneRequirement>;
  sections: ResourceTemplateSections;
}

// =============================================================================
// QUERY REGISTRY
// =============================================================================

export interface QueryDefinition {
  description: string;
  returns: string[];
  hops?: number;
  critical?: boolean;
}

// =============================================================================
// FULL REGISTRY
// =============================================================================

export interface TemplateRegistry {
  $schema: string;
  version: string;
  description: string;
  planes: Record<Plane, PlaneDefinition>;
  confidence_levels: Record<ConfidenceLevel, ConfidenceDefinition>;
  gap_statuses: Record<GapStatus, GapStatusDefinition>;
  universal_sections: Record<string, UniversalSection>;
  resource_templates: Record<string, ResourceTemplate>;
  query_registry: Record<string, QueryDefinition>;
}

// =============================================================================
// API RESPONSE TYPES
// =============================================================================

export interface ConnectionFlow {
  peer_name: string;
  peer_type: string;
  peer_arn?: string;
  relationship_type: string;
  port?: number | string;
  protocol?: string;
  hit_count?: number;
  bytes?: number;
  last_seen: string | null;
  first_seen?: string | null;
}

export interface SecurityGroupRule {
  rule_id?: string;
  protocol: string;
  port_range?: string;
  from_port?: number;
  to_port?: number;
  source?: string;
  destination?: string;
  cidr?: string;
  description?: string;
}

export interface SecurityGroupInfo {
  id: string;
  name: string;
  vpc_id?: string;
  inbound_rules: SecurityGroupRule[];
  outbound_rules: SecurityGroupRule[];
  inbound_rules_count: number;
  outbound_rules_count: number;
  risky_rules_count?: number;
  has_open_to_world?: boolean;
}

export interface IAMRoleInfo {
  name: string;
  arn: string;
  allowed_actions: string[];
  used_actions: string[];
  allowed_count: number;
  used_count: number;
  has_admin_access?: boolean;
  has_wildcard_resources?: boolean;
}

export interface GapItem {
  type: 'port' | 'iam_action' | 'rule';
  value: string | number;
  status: GapStatus;
  last_seen?: string | null;
  recommendation?: string | null;
}

export interface GapSummary {
  allowed_count: number;
  used_count: number;
  unobserved_count: number;
  unknown_count: number;
  gap_percent: number;
}

export interface GapAnalysis {
  confidence_sufficient: boolean;
  confidence: ConfidenceLevel;
  network: {
    gaps: GapItem[];
    summary: GapSummary;
  };
  identity: {
    gaps: GapItem[];
    summary: GapSummary;
  };
  overall: {
    risk_level: RiskLevel;
    remediation_available: boolean;
    recommendations: {
      type: string;
      action: string;
      count: number;
      description: string;
    }[];
  };
}

export interface BlastRadiusResource {
  name: string;
  type: string;
  arn?: string;
}

export interface BlastRadius {
  affected_resources: BlastRadiusResource[];
  total_affected: number;
  risk_level: RiskLevel;
  message?: string;
}

export interface ChangeEvent {
  action: string;
  actor?: string;
  timestamp?: string;
  summary?: string;
}

export interface ChangeHistory {
  source: string;
  changes: ChangeEvent[];
  total_changes: number;
}

export interface Insight {
  id: string;
  text: string;
  severity: Severity;
  cites: Plane[];
}

// =============================================================================
// RESOURCE POPUP RESPONSE
// =============================================================================

export interface ResourcePopupHeader {
  resource_id: string;
  resource_type: string;
  display_name: string;
  icon: string;
  color: string;
  identity: {
    name: string;
    arn?: string;
    id?: string;
    system_name?: string;
    region?: string;
    vpc_id?: string;
    private_ip?: string;
    public_ip?: string;
  };
  evidence_window: string;
  plane_coverage: Record<Plane, PlaneCoverage>;
  last_seen: string | null;
  confidence: ConfidenceLevel;
}

export interface WhatHappened {
  source: string | null;
  confidence: ConfidenceLevel;
  inbound_flows: ConnectionFlow[];
  outbound_flows: ConnectionFlow[];
  api_usage?: {
    service: string;
    action: string;
    count: number;
    last_used?: string;
  }[];
  note?: string;
  summary: {
    total_inbound: number;
    total_outbound: number;
    total_api_calls?: number;
    unique_inbound_peers: number;
    unique_outbound_peers: number;
    has_internet_exposure: boolean;
  };
}

export interface WhatAllowed {
  network: {
    security_groups: SecurityGroupInfo[];
    nacls?: any[];
    subnet_context?: any;
  };
  identity: {
    iam_role: IAMRoleInfo | null;
    policies?: any[];
    trust_policy?: any;
  };
}

export interface ResourcePopupResponse {
  header: ResourcePopupHeader;
  what_happened: WhatHappened;
  what_allowed: WhatAllowed;
  gap_analysis: GapAnalysis;
  blast_radius: BlastRadius;
  change_history: ChangeHistory;
  insights: Insight[];

  // Legacy compatibility fields
  resource_id: string;
  resource_type: string;
  template: {
    display_name: string;
    icon: string;
    color: string;
  };
  identity: ResourcePopupHeader['identity'];
  connections: {
    inbound: ConnectionFlow[];
    outbound: ConnectionFlow[];
    total_inbound: number;
    total_outbound: number;
  };
  security: WhatAllowed;
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

export type ResourceType =
  | 'AWS::EC2::Instance'
  | 'AWS::S3::Bucket'
  | 'AWS::EC2::SecurityGroup'
  | 'AWS::IAM::Role'
  | 'AWS::Lambda::Function'
  | 'AWS::RDS::DBInstance'
  | 'AWS::EC2::NetworkAcl';

export const RESOURCE_TYPE_MAP: Record<string, ResourceType> = {
  'EC2Instance': 'AWS::EC2::Instance',
  'S3Bucket': 'AWS::S3::Bucket',
  'SecurityGroup': 'AWS::EC2::SecurityGroup',
  'IAMRole': 'AWS::IAM::Role',
  'LambdaFunction': 'AWS::Lambda::Function',
  'RDSInstance': 'AWS::RDS::DBInstance',
  'NACL': 'AWS::EC2::NetworkAcl',
  'NetworkAcl': 'AWS::EC2::NetworkAcl',
};
