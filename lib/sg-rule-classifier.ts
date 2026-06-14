/**
 * SG remediation rule classifier — mirrors api/sg_gap_analysis.py::_classify_sg_rule
 * and unified/lp/sg_source_classifier.py source modes.
 *
 * Paired with the HAS_TRAFFIC bridge (gap-analysis reads TrafficPattern
 * edges, not FLOW_LOG). Do not simplify the sensitive+traffic branch
 * without re-reading sg_source_classifier external_scanner semantics.
 */

export type RuleAction =
  | "safe_to_remove"
  | "verify_first"
  | "investigate_first"
  | "protected"

export interface ClassifierRuleTraffic {
  connection_count?: number
  unique_source_count?: number
  unique_sources?: string[] | number
  sample_sources?: string[]
}

export interface ClassifierRule {
  direction: string
  protocol?: string
  port_range: string
  source: string
  destination: string
  is_public: boolean
  traffic?: ClassifierRuleTraffic
  recommendation?: { confidence?: number }
}

const SENSITIVE_PORTS = new Set([22, 3389, 3306, 5432, 27017, 6379, 9200, 11211])
const MIN_OBSERVATION_DAYS_FOR_IDLE_VERDICT = 14
const PUBLIC_CIDRS = new Set(["0.0.0.0/0", "::/0"])
/** Matches unified.lp.sg_source_classifier._EXTERNAL_LOW_CARDINALITY */
const EXTERNAL_LOW_CARDINALITY = 20

export function rulePeer(rule: ClassifierRule): string {
  const isOutbound =
    rule.direction === "outbound" || rule.direction === "egress"
  return (isOutbound ? rule.destination : rule.source) || ""
}

export function isSensitiveExposure(rule: ClassifierRule): boolean {
  if (!rule.is_public) return false
  const m = /^(\d+)(?:-(\d+))?$/.exec(rule.port_range)
  if (!m) return false
  const lo = parseInt(m[1], 10)
  const hi = m[2] ? parseInt(m[2], 10) : lo
  for (const p of SENSITIVE_PORTS) {
    if (p >= lo && p <= hi) return true
  }
  return false
}

function isPublicCidr(peer: string): boolean {
  return PUBLIC_CIDRS.has((peer || "").trim())
}

export function trafficUniqueCount(traffic?: ClassifierRuleTraffic): number {
  if (!traffic) return 0
  if (traffic.unique_source_count != null) return traffic.unique_source_count
  const raw = traffic.unique_sources
  if (typeof raw === "number") return raw
  if (Array.isArray(raw)) return raw.length
  return 0
}

function isRfc1918(ip: string): boolean {
  if (!ip) return false
  const parts = ip.split(".")
  if (parts.length !== 4) return false
  const nums = parts.map((p) => parseInt(p, 10))
  if (nums.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false
  if (nums[0] === 10) return true
  if (nums[0] === 172 && nums[1] >= 16 && nums[1] <= 31) return true
  if (nums[0] === 192 && nums[1] === 168) return true
  return false
}

export type SourceMode =
  | "internal_narrow"
  | "external_narrow"
  | "external_scanner"

/** Mirror of unified.lp.sg_source_classifier.classify_sources (decision tree). */
export function classifySourceMode(
  sampleSources: string[],
  uniqueSources: number,
): SourceMode {
  const samples = (sampleSources || []).filter(Boolean)
  if (!samples.length) {
    return "external_narrow"
  }
  const internal = samples.filter((s) => isRfc1918(s))
  const external = samples.filter((s) => !isRfc1918(s))

  if (internal.length && !external.length) {
    return "internal_narrow"
  }
  if (internal.length && external.length) {
    return "internal_narrow"
  }
  const uniqueN = Math.max(uniqueSources || 0, samples.length)
  if (uniqueN <= EXTERNAL_LOW_CARDINALITY) {
    return "external_narrow"
  }
  return "external_scanner"
}

export function classifyRule(
  rule: ClassifierRule,
  observationDays: number,
): RuleAction {
  if (
    (rule.direction === "outbound" || rule.direction === "egress") &&
    (rule.protocol || "").toLowerCase() === "all"
  ) {
    return "protected"
  }

  const hasTraffic = (rule.traffic?.connection_count ?? 0) > 0
  const sensitive = isSensitiveExposure(rule)
  const conf = rule.recommendation?.confidence ?? 0
  const isSgRef = rulePeer(rule).startsWith("sg-")
  const windowAdequate =
    (observationDays || 0) >= MIN_OBSERVATION_DAYS_FOR_IDLE_VERDICT
  const peer = rulePeer(rule)

  if (isSgRef && hasTraffic) return "protected"
  if (isSgRef && !hasTraffic && !windowAdequate) return "protected"
  if (isSgRef && !hasTraffic && windowAdequate) return "verify_first"

  // Source-aware sensitive handling (HAS_TRAFFIC bridge — 2026-06).
  if (sensitive) {
    if (hasTraffic) {
      if (!isPublicCidr(peer)) {
        return "protected"
      }
      const uniqueCount = trafficUniqueCount(rule.traffic)
      const samples = rule.traffic?.sample_sources || []
      const mode = classifySourceMode(samples, uniqueCount)
      if (mode === "internal_narrow") {
        return "protected"
      }
      return "investigate_first"
    }
    if (!isPublicCidr(peer) && windowAdequate) {
      return "verify_first"
    }
    return "investigate_first"
  }

  // Public internet CIDR + observed traffic (e.g. 443 with scanner volume).
  if (rule.is_public && hasTraffic && isPublicCidr(peer)) {
    const uniqueCount = trafficUniqueCount(rule.traffic)
    const samples = rule.traffic?.sample_sources || []
    const mode = classifySourceMode(samples, uniqueCount)
    if (mode === "internal_narrow") {
      return "protected"
    }
    return "investigate_first"
  }

  if (!hasTraffic && !windowAdequate) return "investigate_first"
  if (hasTraffic) return "verify_first"
  if (conf >= 85) return "safe_to_remove"
  if (conf >= 60) return "verify_first"
  return "investigate_first"
}
