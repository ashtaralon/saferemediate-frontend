/**
 * Saves whose outcome this browser has not yet seen (Phase 2 T18): the exact envelope of each -- never re-minted -- kept
 * from just before its first send until its outcome is known, so closing the tab, a reload, a second tab or a lost
 * response never loses or duplicates a declaration. Pure apart from the injected storage (browser localStorage by
 * default, every access guarded: a private window or blocked storage only means nothing is kept).
 *
 * An entry belongs to the person who started it (``actor``, the verified subject the backend names in
 * /authoring-grants/self) and to the account it was made from. It is shown and resent only to that person, from that
 * account; whether it committed is asked of the backend by its request id (``readRequest``), never inferred from a list.
 * An entry this version cannot read exactly (another version of the console wrote it) is set aside by name and never
 * resent.
 *
 * (PC1 S0-E, the setup store's S0 DR05 / S0-R02 / S0-R03 / S0-R06 design, lib/system-boundary-setup-pending.ts) One storage
 * record PER save, under its own key (PENDING_RECORD_PREFIX + its request id): keeping one writes only its record, so two tabs
 * never rewrite each other's saves -- storage has no cross-tab lock, and one shared list read in one tab and written back
 * from it loses what another tab added meanwhile. A save is SETTLED by its exact tuple (every field, keys sorted), never by
 * its request id alone, and ``put`` never writes over a record already at its request id. The list earlier releases kept
 * under PENDING_KEY is read as written and NEVER written here: a settled tuple in it is retired by a marker of its own
 * (PENDING_RETIRED_PREFIX + request id + the tuple's digest), and an unreadable value in it that the person discards is
 * retired by PENDING_DISCARDED_PREFIX + its digest. An earlier-release tab that still resends a retired tuple sends exactly
 * that envelope, which the backend answers by its request id (a replay, never a second save).
 */
import { sha256Bytes } from "@/lib/content-hash"
import type { CorrectionEnvelope, CreateEnvelope } from "@/lib/system-boundary-authoring"

/** The list releases before PC1 S0-E kept every save in (read; never written by this release). */
export const PENDING_KEY = "cyntro.systemBoundary.pending.v1"
/** Each save's own record: this prefix + its request id. */
export const PENDING_RECORD_PREFIX = `${PENDING_KEY}.rec.`
/** A settled earlier-release tuple's marker: this prefix + its request id + "." + the first 32 hex of its tuple's digest. */
export const PENDING_RETIRED_PREFIX = `${PENDING_KEY}.retired.`
/** A discarded unreadable earlier-release value's marker: this prefix + the first 32 hex of its digest. */
export const PENDING_DISCARDED_PREFIX = `${PENDING_KEY}.discarded.`

export interface PendingSave {
  version: 1
  actor: string
  accountId: string
  kind: "CREATE" | "CORRECT"
  envelope: CreateEnvelope | CorrectionEnvelope
  startedAt: string
}

export interface PendingRead {
  entries: PendingSave[]
  /** How many stored entries this version could not read (never resent). */
  unreadable: number
}

export interface PendingStore {
  read(): PendingRead
  /** Keep a NEW save in its own record; never writes over a record already at its request id. */
  put(entry: PendingSave): void
  /** Settle ``entry`` -- EXACTLY that tuple, wherever it is kept; any other tuple, even under its request id, stays. */
  remove(entry: PendingSave): void
  /** Drop the entries this version cannot read (its own unreadable records; earlier-release ones by marker). */
  clearUnreadable(): void
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Exactly a v1 entry, or null. */
function entryOf(value: unknown): PendingSave | null {
  if (!isRecord(value) || value.version !== 1 || typeof value.actor !== "string" || !value.actor
      || typeof value.accountId !== "string" || !/^[0-9]{12}$/.test(value.accountId)
      || (value.kind !== "CREATE" && value.kind !== "CORRECT") || typeof value.startedAt !== "string") return null
  const envelope = value.envelope
  if (!isRecord(envelope) || typeof envelope.request_id !== "string" || !UUID.test(envelope.request_id)
      || !Number.isInteger(envelope.base_revision)) return null
  if (value.kind === "CREATE" ? !isRecord(envelope.declaration) : !isRecord(envelope.correction)) return null
  return value as unknown as PendingSave
}

/** A value's exact identity -- every field, keys in sorted order -- so two copies of one tuple compare equal whichever tab or
 *  release serialized them, and any difference (base, body, person) is another tuple. */
function tuple(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(tuple).join(",")}]`
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${tuple(value[key])}`).join(",")}}`
  }
  return JSON.stringify(value) ?? "null"
}

const digest32 = (text: string): string => sha256Bytes(new TextEncoder().encode(text)).slice(0, 32)

function browserStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null
  } catch {
    return null
  }
}

export function pendingStore(storage: Storage | null = browserStorage()): PendingStore {
  const attempt = (write: (s: Storage) => void): void => {
    try {
      if (storage) write(storage)
    } catch {
      // Storage blocked or full: the save itself still proceeds; only its resume is lost.
    }
  }
  const get = (key: string): string | null => {
    try {
      return storage ? storage.getItem(key) : null
    } catch {
      return null
    }
  }
  const legacy = (): unknown[] => {
    try {
      const raw = get(PENDING_KEY)
      const parsed: unknown = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed) ? parsed : [parsed]
    } catch {
      return []
    }
  }
  /** Every key under this release's record prefix. */
  const recordKeys = (): string[] => {
    const keys: string[] = []
    try {
      for (let i = 0; storage && i < storage.length; i += 1) {
        const key = storage.key(i)
        if (key?.startsWith(PENDING_RECORD_PREFIX)) keys.push(key)
      }
    } catch {
      return []
    }
    return keys
  }
  /** The entry in ``key``'s record exactly -- and only when the key names its own request id -- or null. */
  const recordAt = (key: string): PendingSave | null => {
    try {
      const raw = get(key)
      const entry = raw ? entryOf(JSON.parse(raw)) : null
      return entry !== null && PENDING_RECORD_PREFIX + entry.envelope.request_id === key ? entry : null
    } catch {
      return null
    }
  }
  const retiredKey = (entry: PendingSave): string =>
    `${PENDING_RETIRED_PREFIX}${entry.envelope.request_id}.${digest32(tuple(entry))}`
  const discardedKey = (value: unknown): string => `${PENDING_DISCARDED_PREFIX}${digest32(tuple(value))}`
  /** The earlier release's list: every value no settlement or discard has retired, readable or not. */
  const unretired = (): unknown[] => legacy().filter((value) => {
    const entry = entryOf(value)
    return entry !== null ? get(retiredKey(entry)) !== tuple(entry) : get(discardedKey(value)) !== tuple(value)
  })
  return {
    read() {
      const kept = new Map<string, PendingSave>()
      let unreadable = 0
      for (const key of recordKeys()) {
        const entry = recordAt(key)
        if (entry === null) unreadable += 1
        else kept.set(entry.envelope.request_id, entry)
      }
      for (const value of unretired()) {
        const entry = entryOf(value)
        if (entry === null) unreadable += 1
        else if (!kept.has(entry.envelope.request_id)) kept.set(entry.envelope.request_id, entry)
      }
      return { entries: [...kept.values()], unreadable }
    },
    put(entry) {
      const key = PENDING_RECORD_PREFIX + entry.envelope.request_id
      if (get(key) === null) attempt((s) => s.setItem(key, JSON.stringify(entry)))   // never over another record at this id
    },
    remove(entry) {
      const exact = tuple(entry)
      const key = PENDING_RECORD_PREFIX + entry.envelope.request_id
      const own = recordAt(key)                                          // its own record, only while it holds THIS tuple
      if (own !== null && tuple(own) === exact) attempt((s) => s.removeItem(key))
      if (legacy().some((value) => { const earlier = entryOf(value); return earlier !== null && tuple(earlier) === exact })) {
        attempt((s) => s.setItem(retiredKey(entry), exact))              // an earlier release's tuple: its own marker, never the list
      }
    },
    clearUnreadable() {
      for (const key of recordKeys()) if (recordAt(key) === null) attempt((s) => s.removeItem(key))
      for (const value of unretired()) {
        if (entryOf(value) === null) attempt((s) => s.setItem(discardedKey(value), tuple(value)))
      }
    },
  }
}

/** The person's own entries made from this account, oldest first. */
export function pendingFor(read: PendingRead, actor: string, accountId: string): PendingSave[] {
  return read.entries.filter((e) => e.actor === actor && e.accountId === accountId)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
}
