/**
 * Setup writes whose outcome this browser has not yet seen (onboarding G2-F16), on the pattern of
 * lib/system-boundary-pending.ts: each operation is FROZEN before its first send -- its kind, the verified person who started
 * it, the account and setup it belongs to, its request id, the state version it was based on and its exact body -- and kept
 * until a definite answer (saved, or refused by name) arrives. While it is unresolved the wizard resends exactly it; later
 * typing is staged separately and never replaces it.
 *
 * Where it is kept. With a verified person (the subject /authoring-grants/self names) the operation is kept in this browser's
 * storage, every access guarded, so Close and a reload keep it. Without one, or when storage does not keep the exact operation
 * (blocked, full -- judged by reading it back, never by a probe write), it is kept in this page's memory only: Close keeps it,
 * a reload does not, and the wizard says so. An operation is only ever offered to the
 * person who started it (an unknown person matches only an operation an unknown person started in this page), never
 * resent automatically, and an entry this version cannot read exactly is never resent.
 *
 * (S0 DR05) One storage record PER operation, under its own key (SETUP_PENDING_RECORD_PREFIX + its request id): keeping one
 * writes only its record and settling one removes only its record, so two tabs never rewrite each other's operations (storage
 * has no cross-tab lock; one shared list read in one tab and written back from it loses what another tab added meanwhile).
 * The list earlier releases kept under SETUP_PENDING_KEY is still read as written; it is rewritten only to retire one of its
 * own operations, every other entry -- one this version cannot read included -- kept. A record this version cannot read, or
 * one whose key does not name its own request id, is never resent and never removed.
 */
import type { SetupIntent } from "@/lib/system-boundary-setup"

/** The list releases before S0 kept every operation in (read, retired from; never added to). */
export const SETUP_PENDING_KEY = "cyntro.systemBoundary.setupPending.v1"
/** Each operation's own record: this prefix + its request id. */
export const SETUP_PENDING_RECORD_PREFIX = `${SETUP_PENDING_KEY}.op.`

interface Common {
  version: 1
  /** The verified person who started it; null: not known (kept in this page's memory only). */
  actor: string | null
  accountId: string
  requestId: string
  startedAt: string
}

export type PendingSetupOp =
  | (Common & { kind: "create" })
  | (Common & { kind: "update"; setupId: string; base: number; steps: SetupIntent })
  | (Common & { kind: "finish"; setupId: string; base: number })

/** Where an operation is actually kept: browser storage (survives a reload) or this page's memory only. */
export type Kept = "storage" | "memory"

export interface SetupPendingStore {
  /** Every readable operation (storage and this page's memory). */
  read(): PendingSetupOp[]
  /** Keep ``op``; answers where it was ACTUALLY kept -- "storage" only when the exact operation was written and read back. */
  put(op: PendingSetupOp): Kept
  remove(requestId: string): void
  /** Where the operation with ``requestId`` is kept NOW (storage read back, else page memory), or null. */
  where(requestId: string): Kept | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Exactly a v1 operation, or null (never resent). */
export function opOf(value: unknown): PendingSetupOp | null {
  if (!isRecord(value) || value.version !== 1 || (value.actor !== null && (typeof value.actor !== "string" || !value.actor))
      || typeof value.accountId !== "string" || !/^[0-9]{12}$/.test(value.accountId)
      || typeof value.requestId !== "string" || !UUID.test(value.requestId) || typeof value.startedAt !== "string") return null
  if (value.kind === "create") return value as unknown as PendingSetupOp
  if (typeof value.setupId !== "string" || !UUID.test(value.setupId) || !Number.isInteger(value.base)) return null
  if (value.kind === "finish") return value as unknown as PendingSetupOp
  if (value.kind === "update" && isRecord(value.steps) && Array.isArray(value.steps.dispositions)
      && typeof value.steps.resume_step === "string") return value as unknown as PendingSetupOp
  return null
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
  }
  return value
}

/** A NEW operation, frozen: a copy of its body that later edits can never change. */
export function freezeOp(op: PendingSetupOp): PendingSetupOp {
  return deepFreeze(structuredClone(op))
}

function browserStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null
  } catch {
    return null
  }
}

/** This page's memory: kept across Close (an unmount), never across a reload. */
const PAGE_MEMORY = new Map<string, PendingSetupOp>()

export function setupPendingStore(storage: Storage | null = browserStorage(),
                                  memory: Map<string, PendingSetupOp> = PAGE_MEMORY): SetupPendingStore {
  const legacy = (): unknown[] => {
    try {
      const raw = storage?.getItem(SETUP_PENDING_KEY)
      const parsed: unknown = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed) ? parsed : [parsed]
    } catch {
      return []
    }
  }
  /** The operation in ``requestId``'s own record, exactly, or null. */
  const record = (requestId: string): PendingSetupOp | null => {
    try {
      const raw = storage?.getItem(SETUP_PENDING_RECORD_PREFIX + requestId)
      const op = raw ? opOf(JSON.parse(raw)) : null
      return op !== null && op.requestId === requestId ? op : null
    } catch {
      return null
    }
  }
  const records = (): PendingSetupOp[] => {
    const ids: string[] = []
    try {
      for (let i = 0; storage && i < storage.length; i += 1) {
        const key = storage.key(i)
        if (key?.startsWith(SETUP_PENDING_RECORD_PREFIX)) ids.push(key.slice(SETUP_PENDING_RECORD_PREFIX.length))
      }
    } catch {
      return []
    }
    return ids.map(record).filter((op): op is PendingSetupOp => op !== null)
  }
  const stored = (requestId: string): PendingSetupOp | null =>
    record(requestId) ?? legacy().map(opOf).find((op): op is PendingSetupOp => op !== null && op.requestId === requestId) ?? null
  const attempt = (write: (s: Storage) => void): void => {
    try {
      if (storage) write(storage)
    } catch {
      // blocked or full: an operation is then kept in this page's memory only (put reads its record back to say so)
    }
  }
  return {
    read() {
      const kept = new Map<string, PendingSetupOp>()
      for (const op of [...records(), ...legacy().map(opOf)]) if (op !== null && !kept.has(op.requestId)) kept.set(op.requestId, op)
      return [...kept.values(), ...[...memory.values()].filter((op) => !kept.has(op.requestId))]
    },
    put(op) {
      memory.set(op.requestId, op)
      if (op.actor === null) return "memory"            // an unverified person's operation never reaches storage
      attempt((s) => s.setItem(SETUP_PENDING_RECORD_PREFIX + op.requestId, JSON.stringify(op)))
      // (G2-F19) durable only if THIS exact operation reads back from storage -- never inferred from a probe write.
      const back = record(op.requestId)
      return back !== null && JSON.stringify(back) === JSON.stringify(op) ? "storage" : "memory"
    },
    remove(requestId) {
      memory.delete(requestId)
      attempt((s) => s.removeItem(SETUP_PENDING_RECORD_PREFIX + requestId))
      const old = legacy()
      if (old.some((v) => opOf(v)?.requestId === requestId)) {       // an earlier release's entry: retire it alone
        const rest = old.filter((v) => opOf(v)?.requestId !== requestId)
        attempt((s) => (rest.length ? s.setItem(SETUP_PENDING_KEY, JSON.stringify(rest)) : s.removeItem(SETUP_PENDING_KEY)))
      }
    },
    where(requestId) {
      if (stored(requestId) !== null) return "storage"
      return memory.has(requestId) ? "memory" : null
    },
  }
}

/** Every unresolved operation on THIS setup from THIS account that another identity started (or one started before the
 *  person was verified): held, never offered or resent to the current person. */
export function othersForSetup(ops: PendingSetupOp[], actor: string | null, accountId: string, setupId: string): PendingSetupOp[] {
  return ops.filter((op) => op.kind !== "create" && op.actor !== actor && op.accountId === accountId && op.setupId === setupId)
}

/** The unresolved operation of THIS person on THIS setup (at most one is ever created), or null. */
export function pendingForSetup(ops: PendingSetupOp[], actor: string | null, accountId: string,
                                setupId: string): PendingSetupOp | null {
  return ops.filter((op) => op.kind !== "create" && op.actor === actor && op.accountId === accountId && op.setupId === setupId)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))[0] ?? null
}

/** Every unresolved start from THIS account that another identity made (or one made before the person was verified): held,
 *  never offered or resent to the current person. */
export function othersCreate(ops: PendingSetupOp[], actor: string | null, accountId: string): PendingSetupOp[] {
  return ops.filter((op) => op.kind === "create" && op.actor !== actor && op.accountId === accountId)
}

/** The unresolved start of THIS person from THIS account, or null. */
export function pendingCreate(ops: PendingSetupOp[], actor: string | null, accountId: string): PendingSetupOp | null {
  return ops.filter((op) => op.kind === "create" && op.actor === actor && op.accountId === accountId)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))[0] ?? null
}
