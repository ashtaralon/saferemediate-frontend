import { classifyInventoryResult } from "@/components/copilot/inventory-answer"

/**
 * The frontend's reading of the backend Decision operation `identity.data_access`
 * (`GET /api/identity-data-access`), decided before anything is rendered.
 *
 * The producer is `unified/decision/operations/identity_data_access.py` (backend candidate b9a79653),
 * whose result models are closed (`extra="forbid"`) and strict. This reader holds a ready answer to the
 * same contract and WITHHOLDS it -- showing nothing from it -- when any field is unknown, missing,
 * malformed or contradicts another:
 *
 *   scope       resolved by the server, one tenant, one 12-digit account
 *   identity    an IAM role, exactly the ARN asked about, in the scoped account
 *   provenance  evidence source exactly "Neptune Serving Graph"; the serving generation, last sync, age
 *               and fresh|stale status stated identically in the answer and in the envelope; stale is
 *               never shown as fresh
 *   parts       a reason code exactly when not COMPUTED; COMPUTED has no missing proof and no truncation;
 *               NOT_COMPUTED carries no rows; table access is never COMPUTED and, when PARTIAL, is
 *               INFERRED_FLOW_LOG_CORRELATION on the part and on every row
 *   stores      S3 buckets only; allowed_operations exactly null with its NOT_COMPUTED status; at least
 *               one pinned evidence entry, each fully formed; observed operations = the evidence actions
 *
 * Each part carries its own state:
 *   COMPUTED      rows are the whole answer; an empty list is a genuine empty
 *   PARTIAL       rows are real but the list may be incomplete; an empty list is NOT established
 *   NOT_COMPUTED  no rows, and nothing is known
 * Allowed operations are not computed, so nothing derived from them is shown, and no action is offered
 * from this answer: it observes access, it authorizes nothing.
 *
 * Codes the frontend itself names, when it has no registered backend code to show:
 *   IDENTITY_ARN_REQUIRED, IDENTITY_ARN_NAME_MISMATCH   the request could not be asked
 *   IDENTITY_DATA_ACCESS_UNAVAILABLE                     transport or backend failure
 *   IDENTITY_DATA_ACCESS_UNAUTHENTICATED                 an untyped 401 from the auth boundary
 *   IDENTITY_DATA_ACCESS_*  (WITHHELD below)             an answer this reader refuses to show
 */

export const CANONICAL_EVIDENCE_SOURCE = "Neptune Serving Graph"
export const INFERRED_FLOW_LOG_CORRELATION = "INFERRED_FLOW_LOG_CORRELATION"
export const ALLOWED_OPERATIONS_UNSUPPORTED = "DECISION_IDENTITY_DATA_ACCESS_ALLOWED_OPERATIONS_UNSUPPORTED"

export const WITHHELD = {
  INVALID_RESPONSE: "IDENTITY_DATA_ACCESS_INVALID_RESPONSE",
  SCOPE_UNPROVEN: "IDENTITY_DATA_ACCESS_SCOPE_UNPROVEN",
  IDENTITY_MISMATCH: "IDENTITY_DATA_ACCESS_IDENTITY_MISMATCH",
  PROVENANCE_UNVERIFIED: "IDENTITY_DATA_ACCESS_PROVENANCE_UNVERIFIED",
  PART_INVALID: "IDENTITY_DATA_ACCESS_PART_INVALID",
  STORE_ROW_INVALID: "IDENTITY_DATA_ACCESS_STORE_ROW_INVALID",
  TABLE_ROW_INVALID: "IDENTITY_DATA_ACCESS_TABLE_ROW_INVALID",
} as const

export type PartState = "COMPUTED" | "PARTIAL" | "NOT_COMPUTED"

export interface PartStatus {
  /** Rows from this part may be shown (COMPUTED or PARTIAL of a ready answer). */
  available: boolean
  /** Null when there is no ready answer to take a state from. */
  state: PartState | null
  reasonCode: string | null
  servicesCovered: string[]
  missingProofs: string[]
  observationWindow: { start: string; end: string } | null
  linkBasis: string | null
  truncated: boolean
}

export interface ObservedEvidence {
  actionType: string
  actions: string[]
  hitCount: number
  firstSeen: string
  lastSeen: string
  sourceTypes: string[]
  s3AccessGeneration: number
  evidenceObjectKey: string
  evidenceVersionId: string
  evidenceDigest: string
}

export interface DataStoreAccess {
  name: string
  type: "S3"
  resourceType: "s3:bucket"
  arn: string
  stableId: string
  region: string
  granularity: "resource"
  /** The bucket, verified against the row's own ARN. Data only: no action is offered from this answer. */
  resourceName: string
  allowedOperations: null
  allowedOperationsStatus: { state: "NOT_COMPUTED"; reasonCode: typeof ALLOWED_OPERATIONS_UNSUPPORTED }
  observedOperations: string[]
  observedEvidence: ObservedEvidence[]
}

export interface TableAccess {
  tableName: string
  database: string | null
  rdsInstance: string
  schema: string | null
  operations: string[]
  accessCount: number | null
  lastSeen: string | null
  dailyAvg: number | null
  viaDbUser: string | null
  linkBasis: typeof INFERRED_FLOW_LOG_CORRELATION
}

export type AnswerStatus = "ready" | "refused" | "abstained" | "unavailable" | "not_ready" | "withheld" | "failed"

export interface IdentityDataAccessBody {
  answer: { status: AnswerStatus; reasonCode: string | null; reasonCategory: string | null }
  identity: { arn: string; name: string; kind: "iam_role" } | null
  scope: { tenantId: string; accountId: string } | null
  freshness: {
    source: typeof CANONICAL_EVIDENCE_SOURCE
    generation: number
    lastSync: string
    status: "fresh" | "stale"
    ageSeconds: number
    maxAgeSeconds: number
  } | null
  dataStores: DataStoreAccess[]
  dataStoresStatus: PartStatus
  tableAccess: TableAccess[]
  tableAccessStatus: PartStatus
  summary: {
    /** Null unless the stores part was computed or has rows: a count of an unestablished list reads as a finding. */
    totalDataStores: number | null
    totalObservedOps: number | null
    /** The counts are lower bounds: the stores part is PARTIAL or truncated. */
    countsAreLowerBounds: boolean
    servicesAccessed: string[]
    /** Not computed: allowed operations are not served. Kept as keys so no reader mistakes absence for zero. */
    totalAllowedOps: null
    hasDestructiveAccess: null
  }
  /** No longer served: it was derived from service-wide allowed actions, never from a scoped answer. */
  servicePermissions: null
}

// ── the producer's contract, as data ────────────────────────────────────────

const TYPED_CODE = /^[A-Z][A-Z0-9_]{2,127}$/
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/
const DIGEST = /^(sha256:)?[0-9a-f]{64}$/
const IAM_IDENTITY_ARN = /^arn:aws[a-z-]*:iam::(\d{12}):(role|user)\/(?:[\x21-\x7e]*\/)?([\w+=,.@-]{1,64})$/
const S3_BUCKET_ARN = /^arn:aws[a-z-]*:s3:::([a-z0-9][a-z0-9.-]{1,61}[a-z0-9])$/

const S3_AUTHORITY_SOURCES = ["cloudtrail_data_events", "s3_access_logs"]
const TABLE_EVIDENCE_SOURCE = "rds_query_logs"
// unified.decision.operations.identity_data_access: action_type is OperationFamily(...).value.lower().
const ACTION_FAMILIES = new Set(["read", "write", "delete", "admin", "list"])
const PART_UNAVAILABLE = "DECISION_IDENTITY_DATA_ACCESS_PART_UNAVAILABLE"

interface PartContract {
  services: string[]
  proofs: string[]
  reasons: { PARTIAL: string[]; NOT_COMPUTED: string[] }
  computable: boolean
}
const STORES: PartContract = {
  services: ["S3"],
  proofs: S3_AUTHORITY_SOURCES,
  reasons: {
    PARTIAL: ["DECISION_IDENTITY_DATA_ACCESS_S3_COVERAGE_INCOMPLETE", "DECISION_IDENTITY_DATA_ACCESS_ROW_LIMIT_INCOMPLETE"],
    NOT_COMPUTED: [PART_UNAVAILABLE],
  },
  computable: true,
}
const TABLES: PartContract = {
  services: ["RDS"],
  proofs: [TABLE_EVIDENCE_SOURCE],
  reasons: {
    PARTIAL: ["DECISION_IDENTITY_DATA_ACCESS_TABLE_ATTRIBUTION_INCOMPLETE"],
    NOT_COMPUTED: [PART_UNAVAILABLE, "DECISION_IDENTITY_DATA_ACCESS_TABLE_COVERAGE_INCOMPLETE"],
  },
  // The role link is inferred from flow logs, so absence can never be established.
  computable: false,
}

const RESULT_KEYS = ["status", "serve_state", "scope", "identity", "serving_generation", "data_stores_status",
  "data_stores", "table_access_status", "table_access", "sections"]
const SCOPE_KEYS = ["resolved_by", "tenant_id", "account_id"]
const IDENTITY_KEYS = ["kind", "arn", "name", "role_id"]
const GENERATION_KEYS = ["generation", "last_sync", "freshness_status", "age_seconds", "max_age_seconds"]
const PART_KEYS = ["state", "reason_code", "services_covered", "missing_proofs", "observation_window", "link_basis", "truncated"]
const STORE_KEYS = ["stable_id", "arn", "name", "resource_type", "region", "allowed_operations",
  "allowed_operations_status", "observed_operations", "observed_evidence"]
const EVIDENCE_KEYS = ["action_type", "actions", "hit_count", "first_seen", "last_seen", "source_types",
  "s3_access_generation", "evidence_object_key", "evidence_version_id", "evidence_digest"]
const TABLE_KEYS = ["table", "database", "rds_instance", "schema", "operations", "access_count", "last_seen",
  "daily_avg", "via_db_user", "link_basis"]
const SECTION_NAMES = new Set(["identity", "serving_generation", "data_stores", "table_access"])

// ── validation primitives ───────────────────────────────────────────────────

class Withhold extends Error {
  constructor(readonly code: string) {
    super(code)
  }
}
function need(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Withhold(code)
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}
/** Exactly these keys: an unknown field is not silently dropped, and a missing one is not defaulted. */
function hasExactly(value: unknown, keys: string[]): value is Record<string, unknown> {
  if (!isRecord(value)) return false
  const present = Object.keys(value)
  return present.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
}
function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}
function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string"
}
function isInt(value: unknown, min: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min
}
function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && ISO_WITH_ZONE.test(value) && !Number.isNaN(Date.parse(value))
}
/** A list of distinct non-empty strings in sorted order, as the producer emits every such list. */
function sortedDistinct(value: unknown): value is string[] {
  if (!Array.isArray(value) || !value.every(nonEmpty)) return false
  const sorted = [...new Set(value as string[])].sort()
  return sorted.length === value.length && sorted.every((item, i) => item === value[i])
}
function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((item, i) => item === b[i])
}
function typedCode(value: unknown): string | null {
  return typeof value === "string" && TYPED_CODE.test(value) ? value : null
}

/** The account, kind and final name segment of an IAM role or user ARN, or null for anything else. */
export function iamIdentityArnParts(arn: string): { accountId: string; kind: "role" | "user"; name: string } | null {
  const match = IAM_IDENTITY_ARN.exec(arn)
  return match ? { accountId: match[1], kind: match[2] as "role" | "user", name: match[3] } : null
}

// ── bodies ──────────────────────────────────────────────────────────────────

function noPart(reasonCode: string | null): PartStatus {
  return {
    available: false, state: null, reasonCode, servicesCovered: [], missingProofs: [],
    observationWindow: null, linkBasis: null, truncated: false,
  }
}

/** A body with no answer in it: a failure, a refusal, or an answer withheld here. Never an empty profile. */
export function identityDataAccessNotGiven(
  status: Exclude<AnswerStatus, "ready">,
  reasonCode: string | null,
  reasonCategory: string | null = null,
): IdentityDataAccessBody {
  return {
    answer: { status, reasonCode, reasonCategory },
    identity: null,
    scope: null,
    freshness: null,
    dataStores: [],
    dataStoresStatus: noPart(reasonCode),
    tableAccess: [],
    tableAccessStatus: noPart(reasonCode),
    summary: {
      totalDataStores: null, totalObservedOps: null, countsAreLowerBounds: false, servicesAccessed: [],
      totalAllowedOps: null, hasDestructiveAccess: null,
    },
    servicePermissions: null,
  }
}

function readPartStatus(raw: unknown, contract: PartContract, sectionState: unknown): PartStatus {
  const bad = WITHHELD.PART_INVALID
  need(hasExactly(raw, PART_KEYS), bad)
  const state = raw.state
  need(state === "COMPUTED" || state === "PARTIAL" || state === "NOT_COMPUTED", bad)
  need(state !== "COMPUTED" || contract.computable, bad)
  // A reason code exactly when not COMPUTED, and only one this part registers for that state.
  if (state === "COMPUTED") need(raw.reason_code === null, bad)
  else need(nonEmpty(raw.reason_code) && contract.reasons[state].includes(raw.reason_code), bad)
  need(Array.isArray(raw.services_covered) && sameList(raw.services_covered as string[], contract.services), bad)
  need(sortedDistinct(raw.missing_proofs) && raw.missing_proofs.every((p) => contract.proofs.includes(p)), bad)
  const missing = raw.missing_proofs as string[]
  need(typeof raw.truncated === "boolean", bad)
  if (state === "COMPUTED") need(missing.length === 0 && raw.truncated === false, bad)
  if (state === "NOT_COMPUTED") need(sameList(missing, contract.proofs) && raw.truncated === false, bad)
  // A part whose section was not read is NOT_COMPUTED for exactly that reason.
  if (sectionState !== "READY") need(state === "NOT_COMPUTED" && raw.reason_code === PART_UNAVAILABLE, bad)

  let window: PartStatus["observationWindow"] = null
  if (raw.observation_window !== null) {
    // Only a COMPUTED S3 part states the window every bucket was covered for.
    need(state === "COMPUTED" && hasExactly(raw.observation_window, ["start", "end"]), bad)
    const { start, end } = raw.observation_window as Record<string, unknown>
    need(isTimestamp(start) && isTimestamp(end) && Date.parse(start) <= Date.parse(end), bad)
    window = { start, end }
  }

  if (contract.computable) {
    need(raw.link_basis === null, bad)
  } else {
    need(raw.link_basis === (state === "PARTIAL" ? INFERRED_FLOW_LOG_CORRELATION : null), bad)
  }
  return {
    available: state !== "NOT_COMPUTED",
    state,
    reasonCode: (raw.reason_code as string | null) ?? null,
    servicesCovered: [...contract.services],
    missingProofs: missing,
    observationWindow: window,
    linkBasis: raw.link_basis as string | null,
    truncated: raw.truncated as boolean,
  }
}

function readEvidence(raw: unknown): ObservedEvidence {
  const bad = WITHHELD.STORE_ROW_INVALID
  need(hasExactly(raw, EVIDENCE_KEYS), bad)
  need(nonEmpty(raw.action_type) && ACTION_FAMILIES.has(raw.action_type), bad)
  need(sortedDistinct(raw.actions) && raw.actions.length > 0, bad)
  need(isInt(raw.hit_count, 0), bad)
  need(isTimestamp(raw.first_seen) && isTimestamp(raw.last_seen) && Date.parse(raw.first_seen) <= Date.parse(raw.last_seen), bad)
  need(sortedDistinct(raw.source_types) && raw.source_types.length > 0 && raw.source_types.every((s) => S3_AUTHORITY_SOURCES.includes(s)), bad)
  need(isInt(raw.s3_access_generation, 1), bad)
  need(nonEmpty(raw.evidence_object_key) && nonEmpty(raw.evidence_version_id), bad)
  need(typeof raw.evidence_digest === "string" && DIGEST.test(raw.evidence_digest), bad)
  return {
    actionType: raw.action_type,
    actions: raw.actions as string[],
    hitCount: raw.hit_count as number,
    firstSeen: raw.first_seen as string,
    lastSeen: raw.last_seen as string,
    sourceTypes: raw.source_types as string[],
    s3AccessGeneration: raw.s3_access_generation as number,
    evidenceObjectKey: raw.evidence_object_key,
    evidenceVersionId: raw.evidence_version_id,
    evidenceDigest: raw.evidence_digest,
  }
}

function readStore(raw: unknown): DataStoreAccess {
  const bad = WITHHELD.STORE_ROW_INVALID
  need(hasExactly(raw, STORE_KEYS), bad)
  need(nonEmpty(raw.stable_id) && raw.stable_id.length <= 512, bad)
  need(raw.resource_type === "s3:bucket", bad)
  need(nonEmpty(raw.arn) && nonEmpty(raw.name), bad)
  // The row's own ARN must be the bucket it names.
  need(S3_BUCKET_ARN.exec(raw.arn)?.[1] === raw.name, bad)
  need(nonEmpty(raw.region), bad)
  // Allowed operations are deliberately unknown: exactly null, with exactly the status that says why.
  need(raw.allowed_operations === null, bad)
  need(
    hasExactly(raw.allowed_operations_status, ["state", "reason_code"]) &&
      raw.allowed_operations_status.state === "NOT_COMPUTED" &&
      raw.allowed_operations_status.reason_code === ALLOWED_OPERATIONS_UNSUPPORTED,
    bad,
  )
  need(Array.isArray(raw.observed_evidence) && raw.observed_evidence.length > 0, bad)
  const evidence = (raw.observed_evidence as unknown[]).map(readEvidence)
  // Observed operations are the evidence's actions, exactly: nothing asserted without a pinned observation.
  const fromEvidence = [...new Set(evidence.flatMap((e) => e.actions))].sort()
  need(sortedDistinct(raw.observed_operations) && sameList(raw.observed_operations, fromEvidence), bad)
  return {
    name: raw.name,
    type: "S3",
    resourceType: "s3:bucket",
    arn: raw.arn,
    stableId: raw.stable_id,
    region: raw.region,
    granularity: "resource",
    resourceName: raw.name,
    allowedOperations: null,
    allowedOperationsStatus: { state: "NOT_COMPUTED", reasonCode: ALLOWED_OPERATIONS_UNSUPPORTED },
    observedOperations: fromEvidence,
    observedEvidence: evidence,
  }
}

function readTable(raw: unknown): TableAccess {
  const bad = WITHHELD.TABLE_ROW_INVALID
  need(hasExactly(raw, TABLE_KEYS), bad)
  // Never authoritative: every row states the inferred link.
  need(raw.link_basis === INFERRED_FLOW_LOG_CORRELATION, bad)
  need(nonEmpty(raw.table) && nonEmpty(raw.rds_instance), bad)
  need(nullableString(raw.database) && nullableString(raw.schema) && nullableString(raw.via_db_user), bad)
  need(sortedDistinct(raw.operations), bad)
  need(raw.access_count === null || isInt(raw.access_count, 0), bad)
  need(raw.last_seen === null || isTimestamp(raw.last_seen), bad)
  need(raw.daily_avg === null || (typeof raw.daily_avg === "number" && Number.isFinite(raw.daily_avg) && raw.daily_avg >= 0), bad)
  return {
    tableName: raw.table,
    database: raw.database as string | null,
    rdsInstance: raw.rds_instance,
    schema: raw.schema as string | null,
    operations: raw.operations as string[],
    accessCount: raw.access_count as number | null,
    lastSeen: raw.last_seen as string | null,
    dailyAvg: raw.daily_avg as number | null,
    viaDbUser: raw.via_db_user as string | null,
    linkBasis: INFERRED_FLOW_LOG_CORRELATION,
  }
}

function readReady(envelope: Record<string, unknown>, result: Record<string, unknown>, requestedArn: string): IdentityDataAccessBody {
  need(hasExactly(result, RESULT_KEYS), WITHHELD.INVALID_RESPONSE)

  // Scope: the server's, one tenant, one account.
  const scope = result.scope
  need(
    hasExactly(scope, SCOPE_KEYS) && scope.resolved_by === "server" && nonEmpty(scope.tenant_id) &&
      typeof scope.account_id === "string" && /^\d{12}$/.test(scope.account_id),
    WITHHELD.SCOPE_UNPROVEN,
  )
  const tenantId = scope.tenant_id as string
  const accountId = scope.account_id as string

  // Identity: the role asked about, in that account.
  const identity = result.identity
  need(hasExactly(identity, IDENTITY_KEYS) && identity.kind === "iam_role" && nullableString(identity.role_id), WITHHELD.INVALID_RESPONSE)
  const parts = nonEmpty(identity.arn) ? iamIdentityArnParts(identity.arn) : null
  need(
    identity.arn === requestedArn && parts?.kind === "role" && parts.accountId === accountId && parts.name === identity.name,
    WITHHELD.IDENTITY_MISMATCH,
  )

  // Provenance: stated twice by the producer, and the two statements must agree exactly.
  const bad = WITHHELD.PROVENANCE_UNVERIFIED
  const generation = result.serving_generation
  need(hasExactly(generation, GENERATION_KEYS), bad)
  need(isInt(generation.generation, 1) && isTimestamp(generation.last_sync), bad)
  need(isInt(generation.age_seconds, 0) && isInt(generation.max_age_seconds, 1), bad)
  need(generation.freshness_status === "fresh" || generation.freshness_status === "stale", bad)
  // Fresh means within the contract's age; a status that disagrees with its own age is not believed.
  need((generation.freshness_status === "fresh") === ((generation.age_seconds as number) <= (generation.max_age_seconds as number)), bad)
  const provenance = envelope.provenance
  need(isRecord(provenance), bad)
  need(Array.isArray(provenance.evidence_sources) && sameList(provenance.evidence_sources as string[], [CANONICAL_EVIDENCE_SOURCE]), bad)
  const servingGraph = isRecord(provenance.freshness) ? provenance.freshness.serving_graph : null
  need(isRecord(servingGraph), bad)
  need(
    servingGraph.generation === generation.generation && servingGraph.last_sync === generation.last_sync &&
      servingGraph.age_seconds === generation.age_seconds && servingGraph.status === generation.freshness_status,
    bad,
  )
  need(isRecord(provenance.scope) && provenance.scope.resource_id === identity.arn && provenance.scope.resource_type === "iam:role", bad)

  const sections = result.sections
  need(isRecord(sections) && Object.keys(sections).every((name) => SECTION_NAMES.has(name)), WITHHELD.INVALID_RESPONSE)
  need(sections.identity === "READY" && sections.serving_generation === "READY", WITHHELD.INVALID_RESPONSE)

  const storesStatus = readPartStatus(result.data_stores_status, STORES, sections.data_stores)
  const tablesStatus = readPartStatus(result.table_access_status, TABLES, sections.table_access)
  need(Array.isArray(result.data_stores) && Array.isArray(result.table_access), WITHHELD.INVALID_RESPONSE)
  need(storesStatus.state !== "NOT_COMPUTED" || result.data_stores.length === 0, WITHHELD.PART_INVALID)
  need(tablesStatus.state === "PARTIAL" || result.table_access.length === 0, WITHHELD.PART_INVALID)
  const stores = (result.data_stores as unknown[]).map(readStore)
  const tables = (result.table_access as unknown[]).map(readTable)

  // The envelope's completeness and serve state are derived from the parts; they must say the same thing.
  const complete = storesStatus.state === "COMPUTED" && tablesStatus.state === "COMPUTED"
  const fresh = generation.freshness_status === "fresh"
  need(result.serve_state === (complete && fresh ? "ACTIVE" : "PARTIAL"), WITHHELD.INVALID_RESPONSE)
  const completeness = provenance.completeness
  need(
    isRecord(completeness) && completeness.status === (complete ? "complete" : "partial") &&
      Array.isArray(completeness.missing_sources) &&
      sameList(completeness.missing_sources as string[], [...new Set([...storesStatus.missingProofs, ...tablesStatus.missingProofs])].sort()),
    bad,
  )

  const storesReading = readPart(storesStatus, stores.length)
  const counted = storesReading.kind === "rows" || storesReading.kind === "empty"
  return {
    answer: { status: "ready", reasonCode: null, reasonCategory: null },
    identity: { arn: identity.arn as string, name: identity.name as string, kind: "iam_role" },
    scope: { tenantId, accountId },
    freshness: {
      source: CANONICAL_EVIDENCE_SOURCE,
      generation: generation.generation as number,
      lastSync: generation.last_sync as string,
      status: fresh ? "fresh" : "stale",
      ageSeconds: generation.age_seconds as number,
      maxAgeSeconds: generation.max_age_seconds as number,
    },
    dataStores: stores,
    dataStoresStatus: storesStatus,
    tableAccess: tables,
    tableAccessStatus: tablesStatus,
    summary: {
      totalDataStores: counted ? stores.length : null,
      totalObservedOps: counted ? stores.reduce((n, s) => n + s.observedOperations.length, 0) : null,
      countsAreLowerBounds: storesReading.kind === "rows" && storesReading.partial,
      servicesAccessed: stores.length > 0 ? ["S3"] : [],
      totalAllowedOps: null,
      hasDestructiveAccess: null,
    },
    servicePermissions: null,
  }
}

/**
 * Map the backend envelope `{result, provenance}` for `requestedArn` into the frontend body.
 * A registered refusal keeps its code; a ready answer this reader cannot verify is withheld whole.
 */
export function identityDataAccessFromEnvelope(envelope: unknown, requestedArn: string): IdentityDataAccessBody {
  try {
    need(isRecord(envelope) && isRecord(envelope.result), WITHHELD.INVALID_RESPONSE)
    const result = envelope.result as Record<string, unknown>
    if (result.status === "ready") return readReady(envelope as Record<string, unknown>, result, requestedArn)
    // One refusal reading for every Decision answer: the inventory classifier's.
    const answer = classifyInventoryResult(result)
    need(answer.kind === "not_answered" && result.serve_state === "NOT_READY", WITHHELD.INVALID_RESPONSE)
    return identityDataAccessNotGiven(answer.status, answer.reasonCode ?? typedCode(result.reason_code), answer.reasonCategory)
  } catch (error) {
    return identityDataAccessNotGiven("withheld", error instanceof Withhold ? error.code : WITHHELD.INVALID_RESPONSE)
  }
}

/** What one part says, for display. */
export type PartReading =
  | { kind: "rows"; partial: boolean }
  | { kind: "empty" }
  | { kind: "not_established" }
  | { kind: "not_computed" }

export function readPart(status: PartStatus, rowCount: number): PartReading {
  if (!status.available || status.state === "NOT_COMPUTED" || status.state === null) return { kind: "not_computed" }
  if (rowCount > 0) return { kind: "rows", partial: status.state === "PARTIAL" || status.truncated }
  // An empty list is a finding only when the part was fully computed and not truncated.
  return status.state === "COMPUTED" && !status.truncated ? { kind: "empty" } : { kind: "not_established" }
}

function isBody(value: unknown): value is IdentityDataAccessBody {
  return isRecord(value) && isRecord(value.answer) && typeof value.answer.status === "string" &&
    Array.isArray(value.dataStores) && isRecord(value.dataStoresStatus) &&
    Array.isArray(value.tableAccess) && isRecord(value.tableAccessStatus)
}

/**
 * Ask the product proxy for one identity. Without its ARN nothing is asked: a bare name is not
 * unique across accounts.
 */
export async function fetchIdentityDataAccess(name: string, arn: string | null | undefined): Promise<IdentityDataAccessBody> {
  if (!arn) return identityDataAccessNotGiven("failed", "IDENTITY_ARN_REQUIRED")
  let res: Response
  try {
    res = await fetch(
      `/api/proxy/identities/data-access/${encodeURIComponent(name)}?arn=${encodeURIComponent(arn)}`,
      { cache: "no-store" },
    )
  } catch {
    return identityDataAccessNotGiven("failed", "IDENTITY_DATA_ACCESS_UNAVAILABLE")
  }
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  if (isBody(body)) return body
  return identityDataAccessNotGiven("failed", res.ok ? WITHHELD.INVALID_RESPONSE : "IDENTITY_DATA_ACCESS_UNAVAILABLE")
}
