/**
 * Observation coverage: what time range Cyntro has VERIFIED evidence for, per
 * account and source, and the window a given response actually covers.
 *
 * Owner ruling (2026-10-01): READY means the installation is operational, never
 * that every source has complete history. A map, inventory or recommendation is
 * supported only for the exact range its sources cover. Activity before the
 * earliest verified coverage is UNKNOWN, and "not observed during this window"
 * never means the thing is absent.
 *
 * This module is the ONLY place that knows the backend's field names for:
 *  - `GET /api/coverage/sources` (via `/api/proxy/coverage/sources`)
 *  - the `observation` block on inventory / systems / map responses
 *  - the dependency map's effective (clamped) window
 * Every component reads the normalized shapes below, so a renamed wire field is
 * a one-line change here.
 */

// ── wire contract ────────────────────────────────────────────────────────

export const SOURCE_COVERAGE_PROXY_PATH = "/api/proxy/coverage/sources"

/** The settings page that renders the per-source coverage panel. */
export const COVERAGE_PAGE_PATH = "/settings/coverage"

export type CoverageStatus = "VERIFIED" | "PARTIAL" | "NOT_STARTED"

export interface CoverageWindow {
  from: string
  to: string
}

export interface CoverageGap {
  from: string
  to: string
  reason: string | null
}

export interface SourceCoverage {
  source: string
  region: string | null
  scope: string | null
  earliestVerifiedAt: string | null
  earliestVerifiedBasis: string | null
  /** Only when the backend recorded it; never inferred. */
  sourceBeganAt: string | null
  sourceBeganBasis: string | null
  firstVerifiedCollectionAt: string | null
  verifiedThrough: string | null
  completedWindows: CoverageWindow[]
  gaps: CoverageGap[]
  /** VERIFIED | PARTIAL | NOT_STARTED, whatever else the backend sent, or UNKNOWN when it sent none. */
  status: string
}

export interface AccountCoverage {
  accountId: string
  sources: SourceCoverage[]
}

export interface SourceCoverageReport {
  tenantId: string | null
  generatedAt: string | null
  readModelGeneration: string | null
  status: "PUBLISHED" | "NOT_RECORDED"
  accounts: AccountCoverage[]
}

export type SourceCoverageResult =
  | { kind: "PUBLISHED"; report: SourceCoverageReport }
  | { kind: "NOT_RECORDED"; report: SourceCoverageReport }
  | { kind: "ERROR"; status: number | null; message: string }

export interface ObservationSource {
  source: string
  accountId: string | null
  region: string | null
  earliestVerifiedAt: string | null
  verifiedThrough: string | null
  gaps: CoverageGap[]
}

/** The range a response's data covers. `null` everywhere it is not recorded. */
export interface Observation {
  from: string
  to: string
  sources: ObservationSource[]
}

export type ObservationWindowPreset = "1d" | "7d" | "30d"

export type ObservationWindowRequest =
  | { preset: ObservationWindowPreset }
  | { preset: "custom"; from: string; to: string }

export const OBSERVATION_WINDOW_PRESETS: ReadonlyArray<{ value: ObservationWindowPreset; label: string; long: string }> = [
  { value: "1d", label: "1d", long: "1 day" },
  { value: "7d", label: "7d", long: "7 days" },
  { value: "30d", label: "30d", long: "30 days" },
]

/** The dependency map's default purpose window (owner ruling: e.g. 7 days for a dependency map). */
export const DEFAULT_DEPENDENCY_WINDOW: ObservationWindowRequest = { preset: "7d" }

/** The window the backend actually served, clamped to available coverage. */
export interface EffectiveWindow {
  from: string
  to: string
  /** What was asked for, as the backend echoed it (null when it did not). */
  requested: string | null
  /** True only when the backend says it narrowed the request. */
  clamped: boolean
  reason: string | null
}

// ── copy ─────────────────────────────────────────────────────────────────

export const HISTORY_BEFORE_UNKNOWN = "Earlier activity is unknown, not absent."
export const NOT_OBSERVED_IN_RECORDED_WINDOW = "Not observed in the recorded window"
export const OBSERVATION_NOT_RECORDED = "Observation not recorded yet"
export const COVERAGE_NOT_RECORDED = "Coverage not recorded yet"
export const READY_MEANS_OPERATIONAL =
  "Connected / READY means the platform is operational for this account. It does not mean every evidence source has complete history; each source's verified range is listed under Evidence coverage."
export const DIGEST_BASIS_NOTE =
  "A first signed CloudTrail digest can also mean logging or integrity validation restarted at that point, so activity before it is unknown."

// ── formatting ───────────────────────────────────────────────────────────

/** "2026-10-01 14:05 UTC". Always UTC and always labelled, never the browser's zone. */
export function formatCoverageInstant(value: string | null | undefined): string {
  if (!value) return "not recorded"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return `${parsed.toISOString().slice(0, 16).replace("T", " ")} UTC`
}

export function formatCoverageRange(from: string | null | undefined, to: string | null | undefined): string {
  return `${formatCoverageInstant(from)} → ${formatCoverageInstant(to)}`
}

export function observedRangeLabel(observation: Pick<Observation, "from" | "to">): string {
  return `Observed ${formatCoverageRange(observation.from, observation.to)}`
}

/** Absent-in-window copy. Uses the real window when known; never claims non-use or absence. */
export function notObservedCopy(window?: { from: string | null; to: string | null } | null): string {
  if (window?.from && window?.to) {
    return `Not observed between ${formatCoverageInstant(window.from)} and ${formatCoverageInstant(window.to)}`
  }
  return NOT_OBSERVED_IN_RECORDED_WINDOW
}

/**
 * Absent-use copy (owner wording): "Not observed in use between <from> and <to>"
 * when the window is known, else "Not observed in the recorded window". LP and
 * remediation views append "removal candidate"; nothing says "unused" as fact.
 */
export function notObservedInUseCopy(window?: { from: string | null; to: string | null } | null): string {
  if (window?.from && window?.to) {
    return `Not observed in use between ${formatCoverageInstant(window.from)} and ${formatCoverageInstant(window.to)}`
  }
  return NOT_OBSERVED_IN_RECORDED_WINDOW
}

/** notObservedInUseCopy for use mid-sentence ("3 rules not observed in the recorded window"). */
export function notObservedInUsePhrase(window?: { from: string | null; to: string | null } | null): string {
  const copy = notObservedInUseCopy(window)
  return copy.charAt(0).toLowerCase() + copy.slice(1)
}

export const REMOVAL_CANDIDATE = "removal candidate"

/**
 * LP / remediation surfaces carry an analysis length in days from their own
 * evidence (e.g. `observation_days`). Keep that number, but state absence as
 * absence in the window, never as non-use.
 */
export function notObservedInDaysCopy(days: number | null | undefined): string {
  if (typeof days === "number" && Number.isFinite(days) && days > 0) {
    return `Not observed in the ${days}-day analysis window`
  }
  return NOT_OBSERVED_IN_RECORDED_WINDOW
}

const SOURCE_LABELS: Record<string, string> = {
  cloudtrail: "CloudTrail",
  cloudtrail_management: "CloudTrail management events",
  cloudtrail_data: "CloudTrail data events",
  vpc_flow_logs: "VPC Flow Logs",
  flow_logs: "VPC Flow Logs",
  flowlogs: "VPC Flow Logs",
  aws_config: "AWS Config",
  config: "AWS Config",
  s3_access_logs: "S3 server access logs",
  xray: "AWS X-Ray",
  eks_audit: "EKS audit logs",
  k8s_audit: "Kubernetes audit logs",
  iam_access_advisor: "IAM Access Advisor",
  inventory: "Inventory",
}

export function sourceLabel(source: string): string {
  const key = source.trim().toLowerCase().replace(/[\s-]+/g, "_")
  return SOURCE_LABELS[key] ?? source.replace(/_/g, " ")
}

export function coverageStatusLabel(status: string): string {
  if (status === "VERIFIED") return "Verified"
  if (status === "PARTIAL") return "Partial"
  if (status === "NOT_STARTED") return "Not started"
  if (status === "UNKNOWN") return "Status not recorded"
  return status.replace(/_/g, " ")
}

export function basisLabel(basis: string | null | undefined): string | null {
  if (!basis) return null
  return basis.replace(/_/g, " ").toLowerCase()
}

/** True when a basis rests on a signed digest (CloudTrail integrity validation). */
export function isDigestBasis(basis: string | null | undefined): boolean {
  return typeof basis === "string" && /digest/i.test(basis)
}

// ── normalizers (the only readers of wire field names) ───────────────────

type Wire = Record<string, unknown>

function record(value: unknown): Wire | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Wire) : null
}

function text(value: unknown): string | null {
  if (typeof value === "string") return value.trim() ? value : null
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return null
}

function windows(value: unknown): CoverageWindow[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const row = record(item)
    const from = text(row?.from)
    const to = text(row?.to)
    return from && to ? [{ from, to }] : []
  })
}

function gaps(value: unknown): CoverageGap[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const row = record(item)
    const from = text(row?.from)
    const to = text(row?.to)
    return from && to ? [{ from, to, reason: text(row?.reason) }] : []
  })
}

function sourceCoverage(value: unknown): SourceCoverage | null {
  const row = record(value)
  const source = text(row?.source)
  if (!row || !source) return null
  return {
    source,
    region: text(row.region),
    scope: text(row.scope),
    earliestVerifiedAt: text(row.earliest_verified_at),
    earliestVerifiedBasis: text(row.earliest_verified_basis),
    sourceBeganAt: text(row.source_began_at),
    sourceBeganBasis: text(row.source_began_basis),
    firstVerifiedCollectionAt: text(row.first_verified_collection_at),
    verifiedThrough: text(row.verified_through),
    completedWindows: windows(row.completed_windows),
    gaps: gaps(row.gaps),
    // A row without a status is shown as "status not recorded", never as a guessed state.
    status: text(row.status) ?? "UNKNOWN",
  }
}

/** `GET /api/coverage/sources` body → report, or null when the shape is not recognized. */
export function normalizeSourceCoverage(payload: unknown): SourceCoverageReport | null {
  const body = record(payload)
  if (!body) return null
  const status = text(body.status)
  if (status !== "PUBLISHED" && status !== "NOT_RECORDED") return null
  const accounts = Array.isArray(body.accounts)
    ? body.accounts.flatMap((item) => {
        const row = record(item)
        const accountId = text(row?.account_id)
        if (!row || !accountId) return []
        const sources = Array.isArray(row.sources)
          ? row.sources.map(sourceCoverage).filter((source): source is SourceCoverage => source !== null)
          : []
        return [{ accountId, sources }]
      })
    : []
  return {
    tenantId: text(body.tenant_id),
    generatedAt: text(body.generated_at),
    readModelGeneration: text(body.read_model_generation),
    status,
    accounts,
  }
}

/**
 * The `observation` block an inventory / systems / map response carries.
 * Absent, null, or without both ends of the range → null ("not recorded yet").
 */
export function readObservation(payload: unknown): Observation | null {
  const block = record(record(payload)?.observation)
  const from = text(block?.from)
  const to = text(block?.to)
  if (!block || !from || !to) return null
  const sources = Array.isArray(block.sources)
    ? block.sources.flatMap((item) => {
        const row = record(item)
        const source = text(row?.source)
        if (!row || !source) return []
        return [{
          source,
          accountId: text(row.account_id),
          region: text(row.region),
          earliestVerifiedAt: text(row.earliest_verified_at),
          verifiedThrough: text(row.verified_through),
          gaps: gaps(row.gaps),
        }]
      })
    : []
  return { from, to, sources }
}

/**
 * The dependency map's effective window: `effective_window` when the backend
 * sends it, else a `window` object, else the response's `observation` range.
 * `clamped` is true only when the backend says so; it is never inferred.
 */
export function readEffectiveWindow(payload: unknown): EffectiveWindow | null {
  const body = record(payload)
  if (!body) return null
  const block = record(body.effective_window) ?? record(body.window)
  if (block) {
    const from = text(block.from)
    const to = text(block.to)
    if (from && to) {
      return {
        from,
        to,
        requested: text(block.requested_window) ?? text(block.requested) ?? text(body.requested_window),
        clamped: block.clamped === true,
        reason: text(block.clamp_reason) ?? text(block.reason),
      }
    }
  }
  const observation = readObservation(body)
  if (observation) {
    return { from: observation.from, to: observation.to, requested: text(body.requested_window), clamped: false, reason: null }
  }
  return null
}

// ── requests ─────────────────────────────────────────────────────────────

export function sourceCoverageUrl(accountId?: string | null): string {
  if (!accountId) return SOURCE_COVERAGE_PROXY_PATH
  return `${SOURCE_COVERAGE_PROXY_PATH}?${new URLSearchParams({ account_id: accountId }).toString()}`
}

export function coveragePageHref(accountId?: string | null): string {
  if (!accountId) return COVERAGE_PAGE_PATH
  return `${COVERAGE_PAGE_PATH}?${new URLSearchParams({ account_id: accountId }).toString()}`
}

/** Query parameters for a windowed request: `window` always, `from`/`to` for a custom range. */
export function observationWindowParams(request: ObservationWindowRequest): Record<string, string> {
  if (request.preset === "custom") return { window: "custom", from: request.from, to: request.to }
  return { window: request.preset }
}

export function requestedWindowLabel(request: ObservationWindowRequest): string {
  if (request.preset === "custom") return formatCoverageRange(request.from, request.to)
  return OBSERVATION_WINDOW_PRESETS.find((preset) => preset.value === request.preset)?.long ?? request.preset
}

function backendMessage(payload: unknown, status: number): string {
  const body = record(payload)
  const detail = body?.detail
  const detailText = text(detail) ?? text(record(detail)?.message)
  const message = detailText ?? text(body?.message) ?? text(body?.error)
  return message ? `Coverage request failed (HTTP ${status}): ${message}` : `Coverage request returned HTTP ${status}`
}

/** Read the per-source coverage record. NOT_RECORDED is a normal answer, not an error. */
export async function fetchSourceCoverage(
  accountId?: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<SourceCoverageResult> {
  let response: Response
  try {
    response = await fetchImpl(sourceCoverageUrl(accountId), { cache: "no-store" })
  } catch (reason) {
    return { kind: "ERROR", status: null, message: reason instanceof Error ? reason.message : String(reason) }
  }
  const payload = await response.json().catch(() => null)
  if (!response.ok) return { kind: "ERROR", status: response.status, message: backendMessage(payload, response.status) }
  const report = normalizeSourceCoverage(payload)
  if (!report) return { kind: "ERROR", status: response.status, message: "The coverage response was not in a recognized shape." }
  return report.status === "PUBLISHED" ? { kind: "PUBLISHED", report } : { kind: "NOT_RECORDED", report }
}
