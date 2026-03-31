import { PlaneBadges } from '../behavioral-intelligence/reconciliation-badge'

export interface CVESummary {
  cve_id: string
  cvss_score: number
  severity: string
  exploit_available: boolean
}

export interface TrafficSummary {
  unique_sources: number
  total_bytes: number
  hit_count: number
  days_observed: number
  last_seen: string | null
}

export interface DriftSummary {
  type: string
  description: string
  severity: string
  timestamp: string
}

export interface AnomalySummary {
  type: string
  description: string
  severity: string
}

export interface CriticalPathSummary {
  src_name: string
  dst_name: string
  dst_type: string
  port: number | null
  observed: boolean
}

export interface BlastRadiusSummary {
  affected_count: number
  has_production: boolean
  affected_types: string[]
}

export interface EvidenceItem {
  label: string
  value: string | number
  source: string
}

export interface ScoreBreakdown {
  traffic: number
  cve: number
  drift: number
  blast_radius: number
}

export interface BehavioralVulnerability {
  id: string
  tier: 1 | 2 | 3 | 4
  tier_label: string
  sentence: string
  behavioral_score: number
  cvss_score: number
  port: number
  protocol: string
  service_name: string
  sg_id: string
  sg_name: string
  is_public: boolean
  cve_count: number
  top_cves: CVESummary[]
  planes: PlaneBadges
  traffic_summary: TrafficSummary | null
  drift_items: DriftSummary[]
  anomalies: AnomalySummary[]
  critical_paths: CriticalPathSummary[]
  blast_radius: BlastRadiusSummary
  evidence: EvidenceItem[]
  score_breakdown: ScoreBreakdown
}

export interface BehavioralVulnerabilitiesResponse {
  system_name: string
  timestamp: string
  total: number
  by_tier: Record<number, number>
  vulnerabilities: BehavioralVulnerability[]
}
