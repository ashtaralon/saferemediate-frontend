import type {
  ConfidenceGroup,
  ConfidenceGroups,
  DependencyRef,
  IamGapAnalysis,
  IamGapAnalysisWire,
  PermissionAction,
  PermissionRow,
  PermissionRowWire,
} from "../types"

const ACTIONS = new Set<PermissionAction>([
  "safe_to_remove",
  "verify_first",
  "investigate_first",
  "warn_before_removing",
  "protected",
  "reserved",
])

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function boolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null
}

function record(value: unknown): Record<string, unknown> {
  return object(value)
}

function action(value: unknown): PermissionAction | null {
  return typeof value === "string" && ACTIONS.has(value as PermissionAction)
    ? (value as PermissionAction)
    : null
}

export function normalizePermissionRow(value: PermissionRowWire): PermissionRow | null {
  if (typeof value === "string") {
    const permission = value.trim()
    if (!permission) return null
    return {
      permission,
      status: null,
      risk_level: null,
      _action: null,
      protected: false,
      reserved: false,
      warn: false,
      service_prefix: null,
      execution_confidence: null,
      evidence_confidence: null,
      explanation: null,
    }
  }

  const row = object(value)
  const permission = text(row.permission)
  if (!permission) return null
  return {
    permission,
    status: text(row.status),
    risk_level: text(row.risk_level),
    _action: action(row._action),
    protected: boolean(row.protected) === true,
    reserved: boolean(row.reserved) === true,
    warn: boolean(row.warn) === true,
    service_prefix: text(row.service_prefix),
    execution_confidence: number(row.execution_confidence),
    evidence_confidence: number(row.evidence_confidence),
    explanation: text(row.explanation),
  }
}

function permissionRows(value: unknown): PermissionRow[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => normalizePermissionRow(item as PermissionRowWire))
    .filter((item): item is PermissionRow => item !== null)
}

function normalizeGroup(value: unknown, index: number): ConfidenceGroup {
  const group = object(value)
  const permissions = permissionRows(group.permissions)
  return {
    group_id: text(group.group_id) ?? `group-${index}`,
    label: text(group.label) ?? "Unlabelled group",
    action: action(group.action),
    confidence_score: number(group.confidence_score),
    evidence_confidence_score: number(group.evidence_confidence_score),
    permission_count: number(group.permission_count),
    permissions,
    protected: boolean(group.protected) === true,
    warn: boolean(group.warn) === true,
    auto_remediable: boolean(group.auto_remediable) === true,
    block_reason_code: text(group.block_reason_code),
    block_reason_human: text(group.block_reason_human),
    explanation: text(group.explanation),
    color: text(group.color),
  }
}

function normalizeGroups(value: unknown): ConfidenceGroups {
  const root = object(value)
  const summary = object(root.summary)
  return {
    groups: Array.isArray(root.groups)
      ? root.groups.map((group, index) => normalizeGroup(group, index))
      : [],
    overall_confidence: number(root.overall_confidence),
    evidence_overall_confidence: number(root.evidence_overall_confidence),
    summary: {
      safe_to_remove: number(summary.safe_to_remove),
      verify_first: number(summary.verify_first),
      investigate_first: number(summary.investigate_first),
      protected: number(summary.protected),
      warn_before_removing: number(summary.warn_before_removing),
      reserved: number(summary.reserved),
    },
    total_permissions: number(root.total_permissions),
    total_permissions_all: number(root.total_permissions_all),
  }
}

function normalizeDependencies(value: unknown): IamGapAnalysis["dependency_context"] {
  const context = object(value)
  const system = object(context.system)
  const dependencies = Array.isArray(context.dependencies)
    ? context.dependencies
        .map((item) => object(item))
        .filter((item) => Object.keys(item).length > 0)
        .map((item) => item as DependencyRef)
    : []

  return {
    status: text(context.status),
    system:
      Object.keys(system).length > 0
        ? {
            ...(text(system.name) ? { name: text(system.name)! } : {}),
            ...(text(system.criticality) ? { criticality: text(system.criticality)! } : {}),
          }
        : null,
    dependencies,
    has_critical_dependencies: boolean(context.has_critical_dependencies) === true,
  }
}

function normalizedReasonCode(wire: IamGapAnalysisWire): string | null {
  const explicit = text(wire.reason_code) ?? text(wire.reason)
  if (explicit) return explicit.trim().toLowerCase().replaceAll(" ", "_")

  // Current production responses still return these as human copy while
  // `reason` is null. Canonicalize only known fail-closed phrases at the wire
  // boundary; components and mutation gates consume stable codes.
  const human = text(wire.remediable_reason)?.toLowerCase() ?? ""
  if (human.includes("no attached policy")) return "no_policy_attached"
  if (
    human.includes("usage not computed") ||
    human.includes("usage has not been measured")
  ) {
    return "usage_not_computed"
  }
  return null
}

export function normalizeIamGapAnalysis(wire: IamGapAnalysisWire): IamGapAnalysis {
  const summary = object(wire.summary)
  const authority = wire.behavioral_authority
    ? object(wire.behavioral_authority)
    : null
  const reasonCode = normalizedReasonCode(wire)

  return {
    role_name: text(wire.role_name) ?? "",
    role_arn: text(wire.role_arn) ?? "",
    observation_days: number(wire.observation_days),
    data_source: text(wire.data_source),
    confidence_mode: text(wire.confidence_mode),
    summary: {
      total_permissions: number(summary.total_permissions),
      used_count: number(summary.used_count),
      unused_count: number(summary.unused_count),
      lp_score: number(summary.lp_score),
      overall_risk: text(summary.overall_risk),
      data_confidence: text(summary.data_confidence),
      cloudtrail_events: number(summary.cloudtrail_events),
      high_risk_unused_count: number(summary.high_risk_unused_count),
      api_relationships: number(summary.api_relationships),
      traffic_relationships: number(summary.traffic_relationships),
      total_evidence: number(summary.total_evidence),
    },
    behavioral_authority: authority
      ? {
          authoritative: boolean(authority.authoritative),
          coverage_state: text(authority.coverage_state),
          projection_generation: number(authority.projection_generation),
          parity_delta: number(authority.parity_delta),
          limitation: text(authority.limitation),
        }
      : null,
    permissions_analysis: permissionRows(wire.permissions_analysis),
    used_permissions: permissionRows(wire.used_permissions),
    unused_permissions: permissionRows(wire.unused_permissions),
    high_risk_unused: Array.isArray(wire.high_risk_unused)
      ? wire.high_risk_unused.map(text).filter((item): item is string => item !== null)
      : [],
    confidence: record(wire.confidence),
    confidence_groups: normalizeGroups(wire.confidence_groups),
    safety_vector: wire.safety_vector == null ? null : record(wire.safety_vector),
    evidence_breakdown: record(wire.evidence_breakdown),
    is_remediable: boolean(wire.is_remediable),
    remediable_reason: text(wire.remediable_reason),
    reason_code: reasonCode,
    dependency_context: normalizeDependencies(wire.dependency_context),
    service_role_analysis:
      wire.service_role_analysis == null ? null : record(wire.service_role_analysis),
    timestamp: text(wire.timestamp),
  }
}
