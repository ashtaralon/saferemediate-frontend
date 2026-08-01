/**
 * Honest Resource Risk / LP payload normalization (P0 authority).
 *
 * Replaces the dishonest transform historically inlined in LeastPrivilegeTab:
 * inventing Identity Graph / us-east-1 / 90-day windows, synthesizing
 * highRiskUnused from unusedList, defaulting severity to 'low' / network
 * severity to MEDIUM, and dropping analyzer-integrity fields.
 *
 * Rules:
 *   - Backend is the only authority for scores, lists, severity, evidence.
 *   - Missing evidence stays null/empty — never a fabricated "complete" story.
 *   - Integrity fields are copied literally so deriveLPIntegrity can veto.
 *   - Optimistic merge may keep receipt metadata while verifying; never scores.
 */

import { normalizeLPSeverity } from '@/lib/lp-severity'
import type { LPIntegrityFields } from '@/lib/lp-integrity'

export type LPSeverityBucket = 'critical' | 'high' | 'medium' | 'low'

const SEVERITY_BUCKETS: ReadonlySet<LPSeverityBucket> = new Set([
  'critical',
  'high',
  'medium',
  'low',
])

const CONFIDENCE_LEVELS = new Set(['HIGH', 'MEDIUM', 'LOW'] as const)
const CATEGORIES = new Set(['removable', 'coverage', 'audit'] as const)

export type LPCategory = 'removable' | 'coverage' | 'audit'
export type LPEvidenceConfidence = 'HIGH' | 'MEDIUM' | 'LOW'
export type LPVerificationState = 'applied_verifying' | 'verify_failed' | null

export type HighRiskUnusedItem = {
  permission: string
  riskLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM'
  reason: string
}

/**
 * GapResource-compatible shape with nullable evidence.
 * Kept local so LeastPrivilegeTab can adopt without a circular import.
 */
export interface NormalizedGapResource {
  id: string
  resourceType: 'IAMRole' | 'SecurityGroup' | 'S3Bucket' | 'NetworkACL' | 'RDSInstance' | string
  resourceName: string
  resourceArn: string
  systemName?: string
  isRemediable?: boolean
  remediableReason?: string
  isServiceLinkedRole?: boolean
  remediatedAt?: string | null
  remediatedBy?: string | null
  snapshotId?: string | null
  eventId?: string | null
  rollbackAvailable?: boolean
  /** Optimistic post-apply state. Never invents clean scores. */
  verificationState?: LPVerificationState
  isOrphan?: boolean
  attachmentCount?: number
  lpScore: number | null
  allowedCount: number
  usedCount: number | null
  gapCount: number | null
  gapPercent: number | null
  blastRadius?: unknown
  networkExposure?: {
    score: number
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | null
    totalRules: number
    internetExposedRules: number
    highRiskPorts: number[]
    details: {
      totalIngressRules: number
      totalEgressRules: number
      findingsCount: number
      criticalFindings: number
      highFindings: number
    }
  }
  allowedList: string[]
  usedList: string[]
  unusedList: string[]
  highRiskUnused: HighRiskUnusedItem[]
  accessorCount?: number
  totalHits?: number
  principals?: string[]
  findingClass?: 'permission_gap' | 'posture' | 'rule_gap' | string
  evidence: {
    dataSources: string[]
    observationDays: number | null
    confidence: LPEvidenceConfidence | null
    lastUsed?: string
    coverage: {
      regions: string[]
      complete: boolean | null
    }
    rule_states?: unknown
    flowlogs?: unknown
    resourcePolicies?: unknown
    confidence_breakdown?: unknown
    violatedRules?: unknown
  }
  /** Bucket lowercase, known raw (e.g. INFO), or null when unknown. */
  severity: string | null
  confidence: number
  observationDays: number | null
  title: string
  description: string
  remediation: string
  region?: string | null
  category?: LPCategory
  countsTowardSummary?: boolean
  usageMeasured?: boolean
  usageNotComputedReason?: string | null
}

export interface NormalizedLPSummary {
  totalResources: number
  totalExcessPermissions: number | null
  avgLPScore: number | null
  iamIssuesCount: number
  networkIssuesCount: number
  s3IssuesCount: number
  criticalCount: number
  highCount: number
  mediumCount: number
  lowCount: number
  confidenceLevel: number
  observationDays: number | null
  attackSurfaceReduction: number
}

export interface NormalizedLPResponse extends LPIntegrityFields {
  summary: NormalizedLPSummary
  resources: NormalizedGapResource[]
  timestamp: string
  fromCache?: boolean
  cacheAge?: number
  fromStaleCache?: boolean
  staleReason?: string
  /** Snake_case alias — copied literally when present on the wire. */
  failed_analyzers?: string[]
}

/**
 * Returns lowercase critical|high|medium|low, or null.
 * Never invents 'low' for missing/unknown. INFO is known to
 * normalizeLPSeverity but is not a count bucket → null.
 */
export function normalizeLPSeverityBucket(severity: unknown): LPSeverityBucket | null {
  const known = normalizeLPSeverity(severity)
  if (!known) return null
  const lower = known.toLowerCase()
  return SEVERITY_BUCKETS.has(lower as LPSeverityBucket)
    ? (lower as LPSeverityBucket)
    : null
}

function normalizeSeverityField(raw: unknown): string | null {
  const bucket = normalizeLPSeverityBucket(raw)
  if (bucket) return bucket
  // Known but non-bucket (INFO) — keep the backend string, not invent a bucket.
  if (normalizeLPSeverity(raw) && typeof raw === 'string') {
    return raw.trim()
  }
  return null
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function summaryCount(summary: Record<string, unknown> | undefined, ...keys: string[]): number {
  if (!summary) return 0
  for (const key of keys) {
    const value = summary[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return 0
}

function normalizeEvidenceConfidence(raw: unknown): LPEvidenceConfidence | null {
  if (typeof raw !== 'string') return null
  const upper = raw.trim().toUpperCase()
  return CONFIDENCE_LEVELS.has(upper as LPEvidenceConfidence)
    ? (upper as LPEvidenceConfidence)
    : null
}

function normalizeCategory(raw: unknown): LPCategory | undefined {
  if (typeof raw !== 'string') return undefined
  return CATEGORIES.has(raw as LPCategory) ? (raw as LPCategory) : undefined
}

/**
 * Backend highRiskUnused only when it is a structured array whose items
 * carry riskLevel. Never synthesize from unusedList / permission-name heuristics.
 */
function normalizeHighRiskUnused(raw: unknown): HighRiskUnusedItem[] {
  if (!Array.isArray(raw) || raw.length === 0) return []
  const out: HighRiskUnusedItem[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const riskRaw = row.riskLevel ?? row.risk_level
    if (typeof riskRaw !== 'string') continue
    const riskUpper = riskRaw.trim().toUpperCase()
    if (riskUpper !== 'CRITICAL' && riskUpper !== 'HIGH' && riskUpper !== 'MEDIUM') continue
    const perm =
      typeof row.permission === 'string'
        ? row.permission
        : typeof row.item === 'string'
          ? row.item
          : null
    if (!perm) continue
    out.push({
      permission: perm,
      riskLevel: riskUpper as HighRiskUnusedItem['riskLevel'],
      reason: typeof row.reason === 'string' ? row.reason : '',
    })
  }
  return out
}

function normalizeNetworkExposure(
  raw: unknown,
): NormalizedGapResource['networkExposure'] | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const ne = raw as Record<string, unknown>
  const severityRaw = ne.severity
  let severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | null = null
  if (typeof severityRaw === 'string') {
    const upper = severityRaw.trim().toUpperCase()
    if (upper === 'CRITICAL' || upper === 'HIGH' || upper === 'MEDIUM' || upper === 'LOW') {
      severity = upper
    }
  }

  const detailsRaw =
    ne.details && typeof ne.details === 'object'
      ? (ne.details as Record<string, unknown>)
      : null

  return {
    score: asFiniteNumber(ne.score) ?? 0,
    severity,
    totalRules: asFiniteNumber(ne.totalRules) ?? asFiniteNumber(ne.total_rules) ?? 0,
    internetExposedRules:
      asFiniteNumber(ne.internetExposedRules) ??
      asFiniteNumber(ne.internet_exposed_rules) ??
      0,
    highRiskPorts: Array.isArray(ne.highRiskPorts)
      ? (ne.highRiskPorts as number[])
      : Array.isArray(ne.high_risk_ports)
        ? (ne.high_risk_ports as number[])
        : [],
    details: {
      totalIngressRules:
        asFiniteNumber(detailsRaw?.totalIngressRules) ??
        asFiniteNumber(ne.totalRules) ??
        0,
      totalEgressRules: asFiniteNumber(detailsRaw?.totalEgressRules) ?? 0,
      findingsCount: asFiniteNumber(detailsRaw?.findingsCount) ?? 0,
      criticalFindings: asFiniteNumber(detailsRaw?.criticalFindings) ?? 0,
      highFindings: asFiniteNumber(detailsRaw?.highFindings) ?? 0,
    },
  }
}

function isServiceLinkedRole(raw: Record<string, unknown>): boolean {
  return raw.isServiceLinkedRole === true || raw.is_service_linked_role === true
}

export function normalizeGapResource(raw: any): NormalizedGapResource {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const evidenceIn =
    r.evidence && typeof r.evidence === 'object'
      ? (r.evidence as Record<string, unknown>)
      : {}

  const dataSourcesRaw = evidenceIn.dataSources ?? evidenceIn.data_sources
  const dataSources =
    Array.isArray(dataSourcesRaw) && dataSourcesRaw.length > 0
      ? (dataSourcesRaw as string[])
      : []

  const evidenceObsDays = asFiniteNumber(evidenceIn.observationDays)
  const resourceObsDays = asFiniteNumber(r.observationDays)

  const coverageIn =
    evidenceIn.coverage && typeof evidenceIn.coverage === 'object'
      ? (evidenceIn.coverage as Record<string, unknown>)
      : null
  const regionsRaw = coverageIn?.regions
  const regions = Array.isArray(regionsRaw) ? (regionsRaw as string[]) : []
  const complete =
    typeof coverageIn?.complete === 'boolean' ? coverageIn.complete : null

  const resourceName =
    typeof r.resourceName === 'string'
      ? r.resourceName
      : typeof r.resource_name === 'string'
        ? (r.resource_name as string)
        : ''

  const gapPercent = asFiniteNumber(r.gapPercent) ?? asFiniteNumber(r.gap_percent)
  const lpScoreDirect = asFiniteNumber(r.lpScore) ?? asFiniteNumber(r.lp_score)
  const lpScore =
    lpScoreDirect !== null
      ? lpScoreDirect
      : gapPercent !== null
        ? 100 - gapPercent
        : null

  const title =
    typeof r.title === 'string' && r.title.trim()
      ? r.title
      : resourceName

  return {
    id: typeof r.id === 'string' ? r.id : String(r.id ?? resourceName ?? ''),
    resourceType: (r.resourceType ?? r.resource_type ?? 'IAMRole') as NormalizedGapResource['resourceType'],
    resourceName,
    resourceArn: typeof r.resourceArn === 'string'
      ? r.resourceArn
      : typeof r.resource_arn === 'string'
        ? (r.resource_arn as string)
        : '',
    systemName: typeof r.systemName === 'string' ? r.systemName : undefined,
    category: normalizeCategory(r.category),
    findingClass: (r.findingClass ?? r.finding_class) as NormalizedGapResource['findingClass'],
    countsTowardSummary:
      typeof r.countsTowardSummary === 'boolean'
        ? r.countsTowardSummary
        : typeof r.counts_toward_summary === 'boolean'
          ? (r.counts_toward_summary as boolean)
          : undefined,
    // Fail-closed: absent stays undefined, never true.
    usageMeasured:
      typeof r.usageMeasured === 'boolean'
        ? r.usageMeasured
        : typeof r.usage_measured === 'boolean'
          ? (r.usage_measured as boolean)
          : undefined,
    usageNotComputedReason:
      (r.usageNotComputedReason ?? r.usage_not_computed_reason ?? null) as string | null,
    lpScore,
    allowedCount: asFiniteNumber(r.allowedCount) ?? asFiniteNumber(r.allowed_count) ?? 0,
    usedCount: asFiniteNumber(r.usedCount) ?? asFiniteNumber(r.used_count),
    gapCount: asFiniteNumber(r.gapCount) ?? asFiniteNumber(r.gap_count),
    gapPercent,
    blastRadius: r.blastRadius ?? r.blast_radius ?? undefined,
    networkExposure: normalizeNetworkExposure(r.networkExposure ?? r.network_exposure),
    allowedList: Array.isArray(r.allowedList) ? (r.allowedList as string[]) : [],
    usedList: Array.isArray(r.usedList) ? (r.usedList as string[]) : [],
    unusedList: Array.isArray(r.unusedList) ? (r.unusedList as string[]) : [],
    // Backend structured array only — never synthesize from unusedList.
    highRiskUnused: normalizeHighRiskUnused(r.highRiskUnused ?? r.high_risk_unused),
    evidence: {
      dataSources,
      observationDays: evidenceObsDays,
      confidence: normalizeEvidenceConfidence(evidenceIn.confidence),
      lastUsed:
        typeof evidenceIn.lastUsed === 'string'
          ? evidenceIn.lastUsed
          : typeof r.lastUsed === 'string'
            ? r.lastUsed
            : undefined,
      coverage: {
        regions,
        complete,
      },
      flowlogs: evidenceIn.flowlogs ?? null,
      resourcePolicies: evidenceIn.resourcePolicies ?? null,
      confidence_breakdown: evidenceIn.confidence_breakdown ?? null,
      rule_states: evidenceIn.rule_states ?? null,
      violatedRules: evidenceIn.violatedRules ?? undefined,
    },
    severity: normalizeSeverityField(r.severity),
    confidence: asFiniteNumber(r.confidence) ?? 0,
    observationDays: resourceObsDays,
    title,
    description: typeof r.description === 'string' ? r.description : '',
    remediation: typeof r.remediation === 'string' ? r.remediation : '',
    region:
      typeof r.region === 'string'
        ? r.region
        : Array.isArray(regions) && typeof regions[0] === 'string'
          ? regions[0]
          : null,
    isRemediable:
      typeof r.isRemediable === 'boolean'
        ? r.isRemediable
        : typeof r.is_remediable === 'boolean'
          ? (r.is_remediable as boolean)
          : typeof r.remediable === 'boolean'
            ? (r.remediable as boolean)
            : undefined,
    remediableReason:
      typeof r.remediableReason === 'string'
        ? r.remediableReason
        : typeof r.remediable_reason === 'string'
          ? (r.remediable_reason as string)
          : undefined,
    isServiceLinkedRole: isServiceLinkedRole(r),
    remediatedAt: (r.remediatedAt ?? r.remediated_at ?? null) as string | null,
    remediatedBy: (r.remediatedBy ?? r.remediated_by ?? null) as string | null,
    snapshotId: (r.snapshotId ?? r.snapshot_id ?? null) as string | null,
    eventId: (r.eventId ?? r.event_id ?? null) as string | null,
    rollbackAvailable:
      typeof r.rollbackAvailable === 'boolean'
        ? r.rollbackAvailable
        : typeof r.rollback_available === 'boolean'
          ? (r.rollback_available as boolean)
          : undefined,
    verificationState:
      r.verificationState === 'applied_verifying' ||
      r.verificationState === 'verify_failed'
        ? r.verificationState
        : r.verificationState === null
          ? null
          : undefined,
    isOrphan:
      typeof r.isOrphan === 'boolean'
        ? r.isOrphan
        : typeof r.is_orphan === 'boolean'
          ? (r.is_orphan as boolean)
          : undefined,
    attachmentCount:
      asFiniteNumber(r.attachmentCount) ?? asFiniteNumber(r.attachment_count) ?? undefined,
    accessorCount:
      asFiniteNumber(r.accessorCount) ?? asFiniteNumber(r.accessor_count) ?? undefined,
    totalHits: asFiniteNumber(r.totalHits) ?? asFiniteNumber(r.total_hits) ?? undefined,
    principals: Array.isArray(r.principals) ? (r.principals as string[]) : undefined,
  }
}

export function normalizeLPResponse(result: any): NormalizedLPResponse {
  const input = result && typeof result === 'object' ? result : {}
  const summaryIn =
    input.summary && typeof input.summary === 'object'
      ? (input.summary as Record<string, unknown>)
      : undefined

  const rawResources: unknown[] = Array.isArray(input.resources) ? input.resources : []
  const resources = rawResources
    .map((r) => normalizeGapResource(r))
    .filter((r) => !r.isServiceLinkedRole)

  const measured = rawResources.filter((row) => {
    const r = row as Record<string, unknown>
    return typeof r.gapPercent === 'number' || typeof r.gap_percent === 'number'
  })

  const avgLPScore =
    measured.length === 0
      ? null
      : (measured.reduce((acc: number, row) => {
          const r = row as Record<string, unknown>
          const gp =
            typeof r.gapPercent === 'number'
              ? r.gapPercent
              : (r.gap_percent as number)
          return acc + (100 - gp)
        }, 0) as number) / measured.length

  const attackSurfaceReduction =
    measured.length === 0
      ? 0
      : (measured.reduce((acc: number, row) => {
          const r = row as Record<string, unknown>
          const gp =
            typeof r.gapPercent === 'number'
              ? r.gapPercent
              : (r.gap_percent as number)
          return acc + gp
        }, 0) as number) / measured.length

  const observationDays =
    asFiniteNumber(input.observationDays) ??
    asFiniteNumber(summaryIn?.observationDays) ??
    null

  const totalExcess =
    typeof summaryIn?.totalExcessPermissions === 'number' &&
    Number.isFinite(summaryIn.totalExcessPermissions)
      ? (summaryIn.totalExcessPermissions as number)
      : null

  const normalized: NormalizedLPResponse = {
    summary: {
      totalResources: resources.length,
      totalExcessPermissions: totalExcess,
      avgLPScore,
      iamIssuesCount: summaryCount(summaryIn, 'iamIssuesCount', 'iamCount'),
      networkIssuesCount: summaryCount(summaryIn, 'networkIssuesCount', 'sgCount'),
      s3IssuesCount: summaryCount(summaryIn, 's3IssuesCount', 's3Count'),
      criticalCount: summaryCount(summaryIn, 'criticalCount', 'critical'),
      highCount: summaryCount(summaryIn, 'highCount', 'high'),
      mediumCount: summaryCount(summaryIn, 'mediumCount', 'medium'),
      lowCount: summaryCount(summaryIn, 'lowCount', 'low'),
      confidenceLevel:
        typeof summaryIn?.confidenceLevel === 'number' ? summaryIn.confidenceLevel : 0,
      observationDays,
      attackSurfaceReduction,
    },
    resources,
    timestamp:
      typeof input.timestamp === 'string' ? input.timestamp : new Date().toISOString(),
    fromCache: !!input.fromCache,
    cacheAge: asFiniteNumber(input.cacheAge) ?? undefined,
    fromStaleCache: !!input.fromStaleCache,
    staleReason:
      typeof input.staleReason === 'string' ? input.staleReason : undefined,
  }

  // Copy integrity fields LITERALLY — do not drop / rename / invent.
  if ('serve_state' in input) normalized.serve_state = input.serve_state
  if ('analysis_complete' in input) normalized.analysis_complete = input.analysis_complete
  if ('failedAnalyzers' in input) normalized.failedAnalyzers = input.failedAnalyzers
  if ('failed_analyzers' in input) normalized.failed_analyzers = input.failed_analyzers
  if ('integrityReason' in input) normalized.integrityReason = input.integrityReason
  if ('counts_are_partial' in input) normalized.counts_are_partial = input.counts_are_partial

  return normalized
}

export type VerifyingMetadata = {
  remediatedAt?: string
  remediatedBy?: string
  snapshotId?: string | null
  eventId?: string | null
  rollbackAvailable?: boolean
}

/**
 * Marks a resource as applied and awaiting backend confirmation.
 * Sets verification + receipt metadata only — never mutates scores/lists/severity.
 */
export function markResourceVerifying<T extends NormalizedGapResource>(
  resource: T,
  metadata: VerifyingMetadata = {},
): T {
  return {
    ...resource,
    verificationState: 'applied_verifying',
    remediatedAt: metadata.remediatedAt ?? resource.remediatedAt ?? new Date().toISOString(),
    remediatedBy: metadata.remediatedBy ?? resource.remediatedBy ?? undefined,
    snapshotId:
      metadata.snapshotId !== undefined ? metadata.snapshotId : resource.snapshotId ?? null,
    eventId: metadata.eventId !== undefined ? metadata.eventId : resource.eventId ?? null,
    rollbackAvailable:
      metadata.rollbackAvailable !== undefined
        ? metadata.rollbackAvailable
        : resource.rollbackAvailable,
  }
}

/**
 * Merge after a refetch.
 *
 * Does NOT overlay gapCount / gapPercent / lpScore / severity / unusedList /
 * highRiskUnused / networkExposure scores from prev.
 *
 * MAY keep verificationState + receipt metadata while prev is
 * `applied_verifying` and the backend row still lacks remediatedAt.
 * Contradictory backend remediation state wins (drop optimistic overlay).
 */
export function mergeLpResourcesAfterFetch(
  prev: NormalizedGapResource[] | null | undefined,
  transformed: NormalizedGapResource[],
): NormalizedGapResource[] {
  if (!prev || prev.length === 0) return transformed

  const prevByKey = new Map<string, NormalizedGapResource>()
  for (const r of prev) {
    const key = r.id || r.resourceName
    if (key) prevByKey.set(key, r)
  }

  return transformed.map((backend) => {
    const key = backend.id || backend.resourceName
    const prior = key ? prevByKey.get(key) : undefined
    if (!prior) return backend

    // Backend already has remediation receipt — prefer backend entirely.
    if (backend.remediatedAt) return backend

    // Only preserve verifying receipt metadata; never invented clean scores.
    if (prior.verificationState === 'applied_verifying' && !backend.remediatedAt) {
      return {
        ...backend,
        verificationState: prior.verificationState,
        remediatedAt: prior.remediatedAt ?? backend.remediatedAt,
        remediatedBy: prior.remediatedBy ?? backend.remediatedBy,
        snapshotId: prior.snapshotId ?? backend.snapshotId,
        eventId: prior.eventId ?? backend.eventId,
        rollbackAvailable: prior.rollbackAvailable ?? backend.rollbackAvailable,
      }
    }

    return backend
  })
}
