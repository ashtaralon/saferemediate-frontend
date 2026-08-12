/**
 * All Services inventory honesty helpers (Resource Dossier §0).
 *
 * Absent source values become UNKNOWN / NOT_APPLICABLE — never a fabricated
 * substantive value (`active`, `eu-west-1`, verified-false encryption).
 * Fetch failures are typed failures, never empty success lists.
 */

export const UNKNOWN = "UNKNOWN" as const
export const NOT_APPLICABLE = "NOT_APPLICABLE" as const

export type InventoryStatus = string // observed runtime string, or UNKNOWN

export type EncryptionState =
  | "ENCRYPTED"
  | "NOT_ENCRYPTED"
  | typeof UNKNOWN
  | typeof NOT_APPLICABLE

export type RegionValue = string | typeof UNKNOWN

export type FetchResult<T> =
  | { ok: true; items: T[] }
  | { ok: false; error: string }

/** Resource types for which encryption is not a meaningful fitness fact. */
export const ENCRYPTION_NOT_APPLICABLE_TYPES = new Set([
  "IAMRole",
  "IAMUser",
  "IAMGroup",
  "IAMPolicy",
  "SecurityGroup",
  "NetworkACL",
  "Subnet",
  "VPC",
  "InternetGateway",
  "NATGateway",
  "VPCEndpoint",
  "RouteTable",
  "HostedZone",
  "Domain",
])

export function mapStatus(
  ...candidates: Array<string | null | undefined>
): InventoryStatus {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim() !== "") {
      return c.trim()
    }
  }
  return UNKNOWN
}

export function mapRegion(
  ...candidates: Array<string | null | undefined>
): RegionValue {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim() !== "") {
      return c.trim()
    }
  }
  return UNKNOWN
}

export function mapEncryption(input: {
  type?: string | null
  encrypted?: unknown
  sse_enabled?: unknown
  kms_key_id?: unknown
  /** True only when a successful read established encryption presence/absence. */
  encryption_read_ok?: boolean
}): EncryptionState {
  const type = input.type || ""
  if (ENCRYPTION_NOT_APPLICABLE_TYPES.has(type)) {
    return NOT_APPLICABLE
  }

  if (input.encrypted === true || input.sse_enabled === true) {
    return "ENCRYPTED"
  }
  if (typeof input.kms_key_id === "string" && input.kms_key_id.trim() !== "") {
    return "ENCRYPTED"
  }

  // Verified negative only when the caller affirms a successful read that
  // proved absence (explicit false), not when fields are merely missing.
  if (
    input.encryption_read_ok === true &&
    (input.encrypted === false || input.sse_enabled === false)
  ) {
    return "NOT_ENCRYPTED"
  }

  return UNKNOWN
}

export function formatEncryptionLabel(state: EncryptionState): string {
  switch (state) {
    case "ENCRYPTED":
      return "Encrypted"
    case "NOT_ENCRYPTED":
      return "Not encrypted"
    case NOT_APPLICABLE:
      return "Not applicable"
    default:
      return UNKNOWN
  }
}

export function formatRegionLabel(region: RegionValue): string {
  return region === UNKNOWN ? UNKNOWN : region
}

export function formatStatusLabel(status: InventoryStatus): string {
  return status
}

export function isActiveLikeStatus(status: InventoryStatus): boolean {
  if (status === UNKNOWN) return false
  const s = status.toLowerCase()
  return (
    s === "active" ||
    s === "running" ||
    s === "available" ||
    s === "enabled"
  )
}

export function failedGroupMessage(alias: string, error: string): string {
  return `${alias} inventory unavailable: ${error}`
}

/**
 * Pick the freshest backend evidence timestamp. Never invents client time.
 * Returns UNKNOWN when no evidence stamp is present.
 */
export function mapLastSyncEvidence(
  ...candidates: Array<string | number | null | undefined>
): string | typeof UNKNOWN {
  let bestMs = -1
  let bestIso: string | null = null
  for (const c of candidates) {
    if (c == null || c === "") continue
    const ms = typeof c === "number" ? c : Date.parse(String(c))
    if (!Number.isFinite(ms)) continue
    if (ms > bestMs) {
      bestMs = ms
      bestIso = new Date(ms).toISOString()
    }
  }
  return bestIso ?? UNKNOWN
}

export function formatLastSyncLabel(
  evidence: string | typeof UNKNOWN | null
): string {
  if (!evidence || evidence === UNKNOWN) return UNKNOWN
  const d = new Date(evidence)
  if (Number.isNaN(d.getTime())) return UNKNOWN
  return d.toLocaleString()
}

/** Build ?regions= query from tenant/topology config; omit when empty. */
export function regionsQueryParam(
  regions: Array<string | null | undefined> | null | undefined
): string {
  const cleaned = (regions || [])
    .map((r) => (typeof r === "string" ? r.trim() : ""))
    .filter((r) => r && r !== UNKNOWN)
  if (cleaned.length === 0) return ""
  return `?regions=${encodeURIComponent([...new Set(cleaned)].join(","))}`
}
