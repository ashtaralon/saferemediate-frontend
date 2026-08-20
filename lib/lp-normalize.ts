/**
 * Honest Resource Risk / LP payload normalization (P0 authority).
 *
 * Rules:
 *   - Backend is the only authority for scores, lists, severity, evidence,
 *     remediation receipts, and summary counts.
 *   - Missing facts stay null/absent — never 0, "now", IAMRole, or invented
 *     identity / rollback capability.
 *   - Integrity fields are copied literally so deriveLPIntegrity can veto.
 *   - Post-apply VERIFYING is client UI state only; it never invents scores
 *     and is not preserved over a successful backend read without receipt.
 */

import { normalizeLPSeverity } from '@/lib/lp-severity'
import { customerSafeError, IAM_INVENTORY_REFRESH_REQUIRED } from '@/lib/customer-error'
import type { LPIntegrityFields } from '@/lib/lp-integrity'
import type { DecisionOutcomeCanonical } from '@/lib/types'

export type LPSeverityBucket = 'critical' | 'high' | 'medium' | 'low'

const SEVERITY_BUCKETS: ReadonlySet<LPSeverityBucket> = new Set([
  'critical',
  'high',
  'medium',
  'low',
])

const CONFIDENCE_LEVELS = new Set(['HIGH', 'MEDIUM', 'LOW'] as const)
const CATEGORIES = new Set(['removable', 'coverage', 'audit'] as const)

/** Max time a local APPLIED · VERIFYING badge may linger without backend receipt. */
export const LP_VERIFYING_TTL_MS = 90_000

export type LPCategory = 'removable' | 'coverage' | 'audit'
export type LPEvidenceConfidence = 'HIGH' | 'MEDIUM' | 'LOW'
export type LPVerificationState = 'applied_verifying' | 'verify_failed' | null
export type LPCoverageState = 'COMPLETE' | 'PARTIAL' | 'MISSING' | 'UNKNOWN'

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
  findingId?: string
  /** Absent/unknown when backend omitted type — never defaulted to IAMRole. */
  resourceType: 'IAMRole' | 'SecurityGroup' | 'S3Bucket' | 'NetworkACL' | 'RDSInstance' | string
  resourceName: string
  resourceArn: string
  accountId?: string
  account_id?: string
  systemName?: string
  isRemediable?: boolean
  remediableReason?: string
  isServiceLinkedRole?: boolean
  /** Backend remediation receipt only — never a browser clock. */
  remediatedAt?: string | null
  remediatedBy?: string | null
  snapshotId?: string | null
  eventId?: string | null
  /** Backend-declared capability only — never inferred from snapshotId. */
  rollbackAvailable?: boolean
  /** Optimistic post-apply UI state. Never invents clean scores. */
  verificationState?: LPVerificationState
  /**
   * Client-only clock for VERIFYING TTL. Must never be rendered as
   * mutation evidence / remediatedAt.
   */
  clientAppliedAt?: string | null
  isOrphan?: boolean
  attachmentCount?: number
  lpScore: number | null
  allowedCount: number | null
  usedCount: number | null
  gapCount: number | null
  gapPercent: number | null
  blastRadius?: unknown
  networkExposure?: {
    score: number | null
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | null
    totalRules: number | null
    internetExposedRules: number | null
    highRiskPorts: number[]
    details: {
      totalIngressRules: number | null
      totalEgressRules: number | null
      findingsCount: number | null
      criticalFindings: number | null
      highFindings: number | null
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
  confidence: number | null
  observationDays: number | null
  title: string
  description: string
  remediation: string
  region?: string | null
  category?: LPCategory
  countsTowardSummary?: boolean
  decisionCanonical?: DecisionOutcomeCanonical | null
  decisionReason?: string
  coverageState?: LPCoverageState
  usageMeasured?: boolean
  usageNotComputedReason?: string | null
}

export interface NormalizedLPSummary {
  totalResources: number
  totalExcessPermissions: number | null
  avgLPScore: number | null
  iamIssuesCount: number | null
  networkIssuesCount: number | null
  s3IssuesCount: number | null
  criticalCount: number | null
  highCount: number | null
  mediumCount: number | null
  lowCount: number | null
  confidenceLevel: number | null
  observationDays: number | null
  attackSurfaceReduction: number | null
  openRiskCount: number | null
  evidenceBlockedCount: number | null
  manualReviewCount: number | null
  safetyReviewPendingCount: number | null
}

export type ResourceRiskCapability = {
  resource_type: string
  display_name: string
  family: string
  analyzers: string[]
  required_evidence: string[]
  preview_supported: boolean
  apply_supported: boolean
  rollback_supported: boolean
}

export interface NormalizedLPResponse extends LPIntegrityFields {
  summary: NormalizedLPSummary
  resources: NormalizedGapResource[]
  /** Null when backend omitted — never browser "now". */
  timestamp: string | null
  fromCache?: boolean
  cacheAge?: number
  fromStaleCache?: boolean
  staleReason?: string
  /** Snake_case alias — copied literally when present on the wire. */
  failed_analyzers?: string[]
  capabilities: ResourceRiskCapability[]
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
  if (normalizeLPSeverity(raw) && typeof raw === 'string') {
    return raw.trim()
  }
  return null
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Missing summary counts stay null — never invent 0. */
function summaryCount(
  summary: Record<string, unknown> | undefined,
  ...keys: string[]
): number | null {
  if (!summary) return null
  for (const key of keys) {
    const value = summary[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return null
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

const CANONICAL_DECISIONS = new Set<DecisionOutcomeCanonical>([
  'AUTO_EXECUTE',
  'REQUIRE_APPROVAL',
  'MANUAL_REVIEW',
  'BLOCK',
  'CANARY_FIRST',
  'EXCLUDE',
])

function normalizeDecision(raw: unknown): DecisionOutcomeCanonical | null | undefined {
  if (raw === null) return null
  if (typeof raw !== 'string') return undefined
  return CANONICAL_DECISIONS.has(raw as DecisionOutcomeCanonical)
    ? (raw as DecisionOutcomeCanonical)
    : undefined
}

function normalizeCoverageState(raw: unknown): LPCoverageState | undefined {
  if (raw === 'COMPLETE' || raw === 'PARTIAL' || raw === 'MISSING' || raw === 'UNKNOWN') {
    return raw
  }
  return undefined
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
    score: asFiniteNumber(ne.score),
    severity,
    totalRules: asFiniteNumber(ne.totalRules) ?? asFiniteNumber(ne.total_rules),
    internetExposedRules:
      asFiniteNumber(ne.internetExposedRules) ??
      asFiniteNumber(ne.internet_exposed_rules),
    highRiskPorts: Array.isArray(ne.highRiskPorts)
      ? (ne.highRiskPorts as number[])
      : Array.isArray(ne.high_risk_ports)
        ? (ne.high_risk_ports as number[])
        : [],
    details: {
      totalIngressRules:
        asFiniteNumber(detailsRaw?.totalIngressRules) ??
        asFiniteNumber(ne.totalRules),
      totalEgressRules: asFiniteNumber(detailsRaw?.totalEgressRules),
      findingsCount: asFiniteNumber(detailsRaw?.findingsCount),
      criticalFindings: asFiniteNumber(detailsRaw?.criticalFindings),
      highFindings: asFiniteNumber(detailsRaw?.highFindings),
    },
  }
}

function isServiceLinkedRole(raw: Record<string, unknown>): boolean {
  return raw.isServiceLinkedRole === true || raw.is_service_linked_role === true
}

function normalizeResourceType(raw: Record<string, unknown>): string {
  if (typeof raw.resourceType === 'string' && raw.resourceType.trim()) {
    return raw.resourceType.trim()
  }
  if (typeof raw.resource_type === 'string' && raw.resource_type.trim()) {
    return raw.resource_type.trim()
  }
  // Absent — never invent IAMRole.
  return ''
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
    findingId:
      typeof r.findingId === 'string'
        ? r.findingId
        : typeof r.finding_id === 'string'
          ? (r.finding_id as string)
          : undefined,
    resourceType: normalizeResourceType(r),
    resourceName,
    resourceArn: typeof r.resourceArn === 'string'
      ? r.resourceArn
      : typeof r.resource_arn === 'string'
        ? (r.resource_arn as string)
        : '',
    accountId:
      typeof r.accountId === 'string'
        ? r.accountId
        : typeof r.account_id === 'string'
          ? (r.account_id as string)
          : undefined,
    systemName: typeof r.systemName === 'string' ? r.systemName : undefined,
    category: normalizeCategory(r.category),
    decisionCanonical: normalizeDecision(r.decision_canonical ?? r.decisionCanonical),
    decisionReason:
      typeof r.decisionReason === 'string'
        ? r.decisionReason
        : typeof r.decision_reason === 'string'
          ? (r.decision_reason as string)
          : undefined,
    coverageState: normalizeCoverageState(r.coverageState ?? r.coverage_state),
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
    usageNotComputedReason: (() => {
      const raw = r.usageNotComputedReason ?? r.usage_not_computed_reason
      if (typeof raw !== 'string' || !raw.trim()) return null
      return customerSafeError(raw, IAM_INVENTORY_REFRESH_REQUIRED)
    })(),
    lpScore,
    allowedCount: asFiniteNumber(r.allowedCount) ?? asFiniteNumber(r.allowed_count),
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
    confidence: asFiniteNumber(r.confidence),
    observationDays: resourceObsDays,
    title,
    description: typeof r.description === 'string'
      ? customerSafeError(r.description, IAM_INVENTORY_REFRESH_REQUIRED)
      : '',
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
    clientAppliedAt:
      typeof r.clientAppliedAt === 'string' ? r.clientAppliedAt : undefined,
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

  // Missing measured rows → null (unknown), never invent 0% reduction.
  const attackSurfaceReduction =
    measured.length === 0
      ? null
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
      confidenceLevel: asFiniteNumber(summaryIn?.confidenceLevel),
      observationDays,
      attackSurfaceReduction,
      openRiskCount: summaryCount(summaryIn, 'openRiskCount'),
      evidenceBlockedCount: summaryCount(summaryIn, 'evidenceBlockedCount'),
      manualReviewCount: summaryCount(summaryIn, 'manualReviewCount'),
      safetyReviewPendingCount: summaryCount(summaryIn, 'safetyReviewPendingCount'),
    },
    resources,
    capabilities: Array.isArray(input.capabilities)
      ? (input.capabilities as ResourceRiskCapability[])
      : [],
    timestamp: typeof input.timestamp === 'string' ? input.timestamp : null,
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

/**
 * Backend-supplied receipt fields only. Callers must not invent
 * remediatedAt / remediatedBy / rollbackAvailable.
 */
export type VerifyingMetadata = {
  remediatedAt?: string | null
  remediatedBy?: string | null
  snapshotId?: string | null
  eventId?: string | null
  rollbackAvailable?: boolean
}

/**
 * Marks a resource as applied and awaiting backend confirmation.
 * Sets verification + clientAppliedAt only — never mutates scores/lists/severity
 * and never invents remediatedAt / identity / rollback capability.
 */
export function markResourceVerifying<T extends NormalizedGapResource>(
  resource: T,
  metadata: VerifyingMetadata = {},
  nowIso: string = new Date().toISOString(),
): T {
  return {
    ...resource,
    verificationState: 'applied_verifying',
    clientAppliedAt: nowIso,
    // Carry receipt fields only when the caller supplied backend values.
    ...(metadata.remediatedAt !== undefined
      ? { remediatedAt: metadata.remediatedAt }
      : {}),
    ...(metadata.remediatedBy !== undefined
      ? { remediatedBy: metadata.remediatedBy }
      : {}),
    ...(metadata.snapshotId !== undefined
      ? { snapshotId: metadata.snapshotId }
      : {}),
    ...(metadata.eventId !== undefined ? { eventId: metadata.eventId } : {}),
    ...(typeof metadata.rollbackAvailable === 'boolean'
      ? { rollbackAvailable: metadata.rollbackAvailable }
      : {}),
  }
}

/**
 * Merge after a refetch.
 *
 * Does NOT overlay gapCount / gapPercent / lpScore / severity / unusedList /
 * highRiskUnused / networkExposure scores from prev.
 *
 * VERIFYING is NOT preserved across a successful backend read that lacks
 * remediatedAt (that was the forever-VERIFYING bug). Bounded TTL marks
 * verify_failed when a stale verifying row is still present in prev with no
 * backend confirmation (e.g. resource dropped from payload).
 */
export function mergeLpResourcesAfterFetch(
  prev: NormalizedGapResource[] | null | undefined,
  transformed: NormalizedGapResource[],
  nowMs: number = Date.now(),
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

    // Backend remediation receipt wins entirely.
    if (backend.remediatedAt) return backend

    if (prior.verificationState === 'applied_verifying') {
      const appliedMs = prior.clientAppliedAt
        ? Date.parse(prior.clientAppliedAt)
        : NaN
      const expired =
        !Number.isFinite(appliedMs) || nowMs - appliedMs > LP_VERIFYING_TTL_MS

      if (expired) {
        return {
          ...backend,
          verificationState: 'verify_failed' as const,
          clientAppliedAt: prior.clientAppliedAt ?? null,
        }
      }

      // Successful backend response without remediatedAt contradicts the
      // optimistic "applied" claim — drop VERIFYING; do not preserve forever.
      return backend
    }

    return backend
  })
}
