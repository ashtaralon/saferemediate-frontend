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
 */
import type { CorrectionEnvelope, CreateEnvelope } from "@/lib/system-boundary-authoring"

export const PENDING_KEY = "cyntro.systemBoundary.pending.v1"

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
  put(entry: PendingSave): void
  remove(requestId: string): void
  /** Drop the entries this version cannot read. */
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

function browserStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null
  } catch {
    return null
  }
}

export function pendingStore(storage: Storage | null = browserStorage()): PendingStore {
  const load = (): unknown[] => {
    try {
      const raw = storage?.getItem(PENDING_KEY)
      const parsed: unknown = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed) ? parsed : [parsed]
    } catch {
      return []
    }
  }
  const save = (values: unknown[]) => {
    try {
      if (values.length) storage?.setItem(PENDING_KEY, JSON.stringify(values))
      else storage?.removeItem(PENDING_KEY)
    } catch {
      // Storage blocked or full: the save itself still proceeds; only its resume is lost.
    }
  }
  return {
    read() {
      const values = load()
      const entries = values.map(entryOf).filter((e): e is PendingSave => e !== null)
      return { entries, unreadable: values.length - entries.length }
    },
    put(entry) {
      save([...load().filter((v) => entryOf(v)?.envelope.request_id !== entry.envelope.request_id), entry])
    },
    remove(requestId) {
      save(load().filter((v) => entryOf(v)?.envelope.request_id !== requestId))
    },
    clearUnreadable() {
      save(load().filter((v) => entryOf(v) !== null))
    },
  }
}

/** The person's own entries made from this account, oldest first. */
export function pendingFor(read: PendingRead, actor: string, accountId: string): PendingSave[] {
  return read.entries.filter((e) => e.actor === actor && e.accountId === accountId)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
}
