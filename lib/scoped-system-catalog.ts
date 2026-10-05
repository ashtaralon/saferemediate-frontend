"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useAccountScope } from "@/lib/account-scope-context"
import { withAccountScope, type ProductScope } from "@/lib/account-scope"

export function productScopeKey(
  scope: Pick<ProductScope, "customerId" | "groupId" | "accountId" | "region">,
): string {
  return [
    scope.customerId || "no-customer",
    scope.groupId || "all",
    scope.accountId || "all",
    scope.region || "all",
  ].map(encodeURIComponent).join("|")
}

export function scopedStorageKey(base: string, scopeKey: string): string {
  return `${base}:${scopeKey}`
}

function labelKey(value: string | null | undefined): string {
  return String(value || "").trim().toLocaleLowerCase()
}

/**
 * The requested system's catalogue name, or null. A label that two catalogue rows share (the same name in two accounts)
 * is not ONE system: it resolves to nothing here, never to whichever row came first (T10 S1).
 */
export function catalogSystemName(
  requested: string | null | undefined,
  available: readonly string[],
): string | null {
  const wanted = labelKey(requested)
  if (!wanted) return null
  const matches = available.filter((name) => labelKey(name) === wanted)
  return matches.length === 1 ? matches[0] : null
}

/** The labels exactly one catalogue row serves (case-insensitive), in input order. A label several accounts serve is never a
 *  default: opening it would pick one account's system silently (T10 S1). */
export function unrepeatedLabels(names: readonly string[]): string[] {
  const counts = new Map<string, number>()
  for (const name of names) counts.set(labelKey(name), (counts.get(labelKey(name)) ?? 0) + 1)
  return names.filter((name) => counts.get(labelKey(name)) === 1)
}

// ── T10 S1: the provisional catalogue identity (backend T10 S2, api/systems.py::_catalog_identity) ─────────────────────

/** One catalogue row's identity: the tenant, account and observed collection region its label was served from. It is a
 *  provisional browse key, never an authored System id. */
export type CatalogIdentity = {
  kind: "provisional"
  version: 1
  customer_id: string
  account_id: string
  region: string
  label: string
}

/**
 * IDENTIFIED: a valid identity for this scope. LEGACY: no identity at all (a backend that still merges by name -- name-only,
 * exactly as before). MALFORMED: an identity is present but cannot be trusted; such a row is never selectable or linked, and
 * never degrades to the legacy shape.
 */
export type CatalogEntry = {
  name: string
  status: "IDENTIFIED" | "LEGACY" | "MALFORMED"
  identity: CatalogIdentity | null
  /** The label is served by more than one row of this catalogue answer. */
  repeated: boolean
}

const ACCOUNT_ID = /^[0-9]{12}$/
const AWS_REGION = /^[a-z]{2}(-[a-z]+)+-[0-9]+$/

function validIdentity(raw: unknown, name: string, scopeCustomerId: string | null | undefined): CatalogIdentity | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const value = raw as Record<string, unknown>
  if (value.kind !== "provisional" || value.version !== 1) return null
  if (typeof value.account_id !== "string" || !ACCOUNT_ID.test(value.account_id)) return null
  if (typeof value.region !== "string" || !AWS_REGION.test(value.region)) return null
  if (typeof value.label !== "string" || value.label !== name) return null
  if (typeof value.customer_id !== "string" || !value.customer_id || !scopeCustomerId || value.customer_id !== scopeCustomerId) {
    return null
  }
  return {
    kind: "provisional", version: 1, customer_id: value.customer_id, account_id: value.account_id,
    region: value.region, label: value.label,
  }
}

/** The catalogue answer's rows as entries, judged against the scope's tenant. */
export function catalogEntries(body: unknown, scopeCustomerId: string | null | undefined): CatalogEntry[] {
  const rows = (body && typeof body === "object" ? (body as { systems?: unknown }).systems : null)
  if (!Array.isArray(rows)) return []
  const entries: CatalogEntry[] = []
  for (const row of rows) {
    if (!row || typeof row !== "object") continue
    const record = row as Record<string, unknown>
    const name = String(record.name || record.SystemName || "").trim()
    if (!name) continue
    const present = record.catalog_identity !== undefined && record.catalog_identity !== null
    const identity = present ? validIdentity(record.catalog_identity, name, scopeCustomerId) : null
    entries.push({ name, identity, status: !present ? "LEGACY" : identity ? "IDENTIFIED" : "MALFORMED", repeated: false })
  }
  const counts = new Map<string, number>()
  for (const entry of entries) counts.set(labelKey(entry.name), (counts.get(labelKey(entry.name)) ?? 0) + 1)
  return entries.map((entry) => ({ ...entry, repeated: (counts.get(labelKey(entry.name)) ?? 0) > 1 }))
}

export type CatalogSelection =
  | { kind: "SELECTED"; entry: CatalogEntry }
  | { kind: "AMBIGUOUS"; entries: CatalogEntry[] }
  | { kind: "IDENTITY_UNAVAILABLE"; entry: CatalogEntry }
  | { kind: "NOT_FOUND" }
  | { kind: "NONE" }

/** A narrowing value the URL actually carries ("all" and empty narrow nothing). */
function narrowing(value: string | null | undefined): string | null {
  const text = String(value || "").trim()
  return text && text !== "all" ? text : null
}

/**
 * The ONE selection rule (T10 S1). ``requested`` is what the URL asks for -- the label plus the account and region it was
 * linked under, never a value healed from storage, so a removed account resolves to NOT_FOUND or the chooser and never to
 * another account that now happens to be the only one with that label.
 * - nothing requested: the first entry whose label is not repeated (and is selectable), else NONE;
 * - one matching row: SELECTED, or IDENTITY_UNAVAILABLE when its identity is malformed;
 * - several: AMBIGUOUS -- the caller shows a chooser, never the first;
 * - none: NOT_FOUND.
 * A LEGACY row carries no account or region to compare: the catalogue request was already narrowed by the same scope.
 */
export function selectCatalogSystem(
  requested: { system?: string | null; accountId?: string | null; region?: string | null },
  entries: readonly CatalogEntry[],
): CatalogSelection {
  const wanted = labelKey(requested.system)
  if (!wanted) {
    const first = entries.find((entry) => !entry.repeated && entry.status !== "MALFORMED")
    return first ? { kind: "SELECTED", entry: first } : { kind: "NONE" }
  }
  const account = narrowing(requested.accountId)
  const region = narrowing(requested.region)
  const matches = entries.filter((entry) => {
    if (labelKey(entry.name) !== wanted) return false
    if (entry.status !== "IDENTIFIED") return true
    return (!account || entry.identity!.account_id === account) && (!region || entry.identity!.region === region)
  })
  if (matches.length === 0) return { kind: "NOT_FOUND" }
  if (matches.length > 1) return { kind: "AMBIGUOUS", entries: matches }
  const [only] = matches
  return only.status === "MALFORMED" ? { kind: "IDENTITY_UNAVAILABLE", entry: only } : { kind: "SELECTED", entry: only }
}

/**
 * A link to ``path`` for this entry, or null when it may not be linked. An IDENTIFIED entry carries its FULL tuple --
 * label, tenant, account and observed region -- so the page reconstructs exactly this row from the URL. A LEGACY entry is
 * name-only, as before. A MALFORMED entry has no link. ``param`` is the page's system parameter (``system`` by default);
 * ``keep`` carries the current page's other query parameters into the link.
 */
export function catalogEntryHref(
  path: string,
  entry: CatalogEntry,
  param = "system",
  keep?: URLSearchParams | null,
): string | null {
  if (entry.status === "MALFORMED") return null
  // The page's other parameters (a tab, a mode) are kept; the system tuple is always rewritten whole, so a stale account or
  // region from the current URL can never ride along with another row's label.
  const query = new URLSearchParams(keep ? keep.toString() : "")
  for (const name of [param, "customer_id", "account_id", "region"]) query.delete(name)
  query.set(param, entry.status === "IDENTIFIED" ? entry.identity!.label : entry.name)
  if (entry.status === "IDENTIFIED") {
    query.set("customer_id", entry.identity!.customer_id)
    query.set("account_id", entry.identity!.account_id)
    query.set("region", entry.identity!.region)
  }
  return `${path}?${query.toString()}`
}

/** The scope a with-families answer says it was computed for (its own ``scope`` block). */
export type FamilyResponseScope = { customer_id?: string | null; account_id?: string | null; region?: string | null }

/**
 * Whether a with-families row's graph metrics (resources, health, critical / high, family scores) may be shown for this
 * catalogue entry. Those values are a per-label graph aggregate: a unique catalogue match alone does not make them one
 * account's (another account can be unpublished or unavailable).
 * - LEGACY, not repeated: as before (a name-merged backend serves no identity to attribute against);
 * - IDENTIFIED, not repeated: only when the CURRENT scope is narrowed explicitly to the entry's tenant, account AND region,
 *   and the answer's own scope names exactly that tuple;
 * - anything else (repeated, malformed, no entry, a broader or different scope): withheld.
 */
export function familyMetricsAttributable(
  entry: CatalogEntry | null | undefined,
  scope: { customerId?: string | null; accountId?: string | null; region?: string | null },
  responseScope: FamilyResponseScope | null | undefined,
): boolean {
  if (!entry || entry.repeated) return false
  if (entry.status === "LEGACY") return true
  if (entry.status !== "IDENTIFIED") return false
  const identity = entry.identity!
  return (
    scope.customerId === identity.customer_id &&
    narrowing(scope.accountId) === identity.account_id &&
    narrowing(scope.region) === identity.region &&
    !!responseScope &&
    responseScope.customer_id === identity.customer_id &&
    responseScope.account_id === identity.account_id &&
    responseScope.region === identity.region
  )
}

/**
 * The only client-side entry point for the systems catalog.
 *
 * `ready=false` prevents an initial unscoped request while the organization
 * roster is still resolving. `available=false` is the honest empty-organization
 * state: callers must render no systems rather than falling back to an estate
 * reading without tenant scope.
 */
export function useScopedSystemCatalog(
  endpoint = "/api/proxy/systems",
): {
  url: string | null
  scopeKey: string
  ready: boolean
  available: boolean
  /** The scope's tenant: the one a catalogue identity must name (T10 S1). */
  customerId: string | null
} {
  const scope = useAccountScope()
  const scopeKey = useMemo(
    () => productScopeKey(scope),
    [scope.customerId, scope.groupId, scope.accountId, scope.region],
  )
  const ready = !scope.loading
  const available = ready && Boolean(scope.customerId)
  const url = useMemo(
    () => available ? withAccountScope(endpoint, scope) : null,
    [available, endpoint, scope.customerId, scope.groupId, scope.accountId, scope.region],
  )
  return { url, scopeKey, ready, available, customerId: scope.customerId || null }
}

export type CatalogReading = {
  /** loading: scope or catalogue not answered yet. unavailable: no tenant, or the catalogue could not be read. */
  state: "loading" | "unavailable" | "ready"
  entries: CatalogEntry[]
  scopeKey: string
  retry: () => void
}

/**
 * The scoped catalogue as entries, read FRESH for the current scope (never from browser storage: an identity decision must
 * not rest on an answer from before an account was removed). A response for a scope that has since changed is dropped.
 * Callers render nothing that depends on the selection until ``state`` is "ready" (T10 S1).
 */
export function useScopedSystemCatalogEntries(): CatalogReading {
  const scope = useAccountScope()
  const catalog = useScopedSystemCatalog()
  const [attempt, setAttempt] = useState(0)
  const [reading, setReading] = useState<{ url: string; entries: CatalogEntry[] } | { url: string; failed: true } | null>(null)

  useEffect(() => {
    if (!catalog.url) return
    const url = catalog.url
    let cancelled = false
    ;(async () => {
      try {
        const response = await fetch(url, { cache: "no-store" })
        if (!response.ok) throw new Error(String(response.status))
        const body = await response.json()
        if (!cancelled) setReading({ url, entries: catalogEntries(body, scope.customerId) })
      } catch {
        if (!cancelled) setReading({ url, failed: true })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [catalog.url, scope.customerId, attempt])

  const retry = () => {
    setReading(null)
    setAttempt((value) => value + 1)
  }
  if (!catalog.ready) return { state: "loading", entries: [], scopeKey: catalog.scopeKey, retry }
  if (!catalog.available || !catalog.url) return { state: "unavailable", entries: [], scopeKey: catalog.scopeKey, retry }
  if (!reading || reading.url !== catalog.url) return { state: "loading", entries: [], scopeKey: catalog.scopeKey, retry }
  if ("failed" in reading) return { state: "unavailable", entries: [], scopeKey: catalog.scopeKey, retry }
  return { state: "ready", entries: reading.entries, scopeKey: catalog.scopeKey, retry }
}

export type SystemRequest = { system: string | null; accountId: string | null; region: string | null }

/**
 * The system the URL asks for, with the account and region it was linked under PINNED for as long as the label stays the
 * same. The scope provider heals an account the live options no longer contain by DELETING account_id / region from the
 * URL; reading the URL afresh after that would re-resolve the old label against "all" and could open another account that
 * now serves it alone. Pinned, the old request stays NOT_FOUND (or a chooser). An explicit new account in the URL (the
 * operator chose one) replaces the pin; a new label starts a new request.
 */
export function usePinnedSystemRequest(): SystemRequest {
  const searchParams = useSearchParams()
  const system = searchParams?.get("system") ?? null
  const accountId = narrowing(searchParams?.get("account_id"))
  const region = narrowing(searchParams?.get("region"))
  const pin = useRef<SystemRequest | null>(null)
  const current = pin.current
  if (!current || labelKey(current.system) !== labelKey(system)) {
    pin.current = { system, accountId, region }
  } else if (accountId && accountId !== current.accountId) {
    pin.current = { system, accountId, region }
  } else if (accountId || region) {
    pin.current = { system, accountId: accountId ?? current.accountId, region: region ?? current.region }
  }
  return pin.current!
}
