export interface SeverityBreakdown {
  overall_score: number
  severity: string
  impact: number
  internet_exposure: number
  permission_breadth: number
  data_sensitivity: number
  identity_chain: number
  network_controls: number
  weights: {
    impact: number
    internet_exposure: number
    permission_breadth: number
    data_sensitivity: number
    identity_chain: number
    network_controls: number
  }
}

export interface NodeRemediation {
  service: string
  actions: string[]
  priority: string
}

export interface InternetExposureAlert {
  is_exposed: boolean
  open_ports: number[]
  observed_ports: number[]
  recommended_ports: number[]
  controls: {
    nacl: boolean
    security_group: boolean
    waf: boolean
    private_subnet: boolean
  }
  message: string
}

// -- Enriched fields (new backend shape) --

export interface NodePermissions {
  total: number
  used: number
  unused: number
  high_risk: string[]
}

export interface NodePolicyDetails {
  inline_policies: number
  managed_policies: number
  wildcards: string[]
}

export interface NodeRules {
  inbound_count: number
  outbound_count: number
  open_to_internet: boolean
}

export interface NodeAccessSummary {
  total_accessors: number
  api_calls: number
  data_volume_bytes: number
}

export interface NodeEncryption {
  at_rest: boolean
  in_transit: boolean
}

export interface NodeTrafficSummary {
  inbound_bytes: number
  outbound_bytes: number
  api_calls: number
}

export interface RiskReduction {
  current_score: number
  achievable_score: number
  top_actions: { action: string; impact: number }[]
}

export interface LaneDefinition {
  id: string
  label: string
  icon: string
}

// -- Node types --

export interface PathNodeDetail {
  id: string
  name: string
  type: string
  tier: "entry" | "identity" | "network_control" | "crown_jewel"
  lane?: "entry" | "compute" | "security_group" | "nacl" | "subnet" | "vpc" | "iam" | "pivot" | "crown_jewel"
  is_internet_exposed: boolean
  lp_score: number | null
  gap_count: number
  remediation: NodeRemediation | null
  internet_exposure_alert: InternetExposureAlert | null
  // Enriched fields (optional for backward compat)
  permissions?: NodePermissions | null
  policy_details?: NodePolicyDetails | null
  rules?: NodeRules | null
  open_ports?: number[]
  observed_ports?: number[]
  unused_ports?: number[]
  data_classification?: string | null
  access_summary?: NodeAccessSummary | null
  encryption?: NodeEncryption | null
  traffic_summary?: NodeTrafficSummary | null
  recommendations?: string[]
}

export interface PathEdgeDetail {
  source: string
  target: string
  type: string
  label: string
  port: number | null
  protocol: string | null
  is_observed: boolean
  traffic_bytes?: number
  hit_count?: number
}

export interface IdentityAttackPath {
  id: string
  crown_jewel_id: string
  nodes: PathNodeDetail[]
  edges: PathEdgeDetail[]
  severity: SeverityBreakdown
  path_kind: string
  evidence_type: "observed" | "configured"
  hop_count: number
  // Enriched fields (optional for backward compat)
  lanes?: LaneDefinition[]
  risk_reduction?: RiskReduction | null
}

export interface CrownJewelSummary {
  id: string
  name: string
  type: string
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
  path_count: number
  highest_risk_score: number
  is_internet_exposed: boolean
  data_classification: string | null
  priority_score: number
}

export interface IdentityAttackPathsResponse {
  system_name: string
  timestamp: string
  crown_jewels: CrownJewelSummary[]
  paths: IdentityAttackPath[]
  total_paths: number
  critical_paths: number
  high_paths: number
  exposed_jewels: number
  total_jewels: number
  error?: string | null
}

export interface JewelDetailResponse {
  system_name: string
  jewel_id: string
  jewel_name: string
  jewel_type: string
  is_internet_exposed: boolean
  paths: IdentityAttackPath[]
  total_paths: number
  timestamp: string
  error?: string
}
