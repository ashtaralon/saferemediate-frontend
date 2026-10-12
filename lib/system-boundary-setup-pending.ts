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
 */
import type { SetupIntent } from "@/lib/system-boundary-setup"

export const SETUP_PENDING_KEY = "cyntro.systemBoundary.setupPending.v1"

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
  const load = (): unknown[] => {
    try {
      const raw = storage?.getItem(SETUP_PENDING_KEY)
      const parsed: unknown = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed) ? parsed : [parsed]
    } catch {
      return []
    }
  }
  const save = (values: unknown[]): boolean => {
    try {
      if (!storage) return false
      if (values.length) storage.setItem(SETUP_PENDING_KEY, JSON.stringify(values))
      else storage.removeItem(SETUP_PENDING_KEY)
      return true
    } catch {
      return false                                   // blocked or full: kept in this page's memory only
    }
  }
  const stored = (requestId: string): PendingSetupOp | null =>
    load().map(opOf).find((op): op is PendingSetupOp => op !== null && op.requestId === requestId) ?? null
  return {
    read() {
      const kept = load().map(opOf).filter((op): op is PendingSetupOp => op !== null)
      const ids = new Set(kept.map((op) => op.requestId))
      return [...kept, ...[...memory.values()].filter((op) => !ids.has(op.requestId))]
    },
    put(op) {
      memory.set(op.requestId, op)
      if (op.actor === null) return "memory"            // an unverified person's operation never reaches storage
      save([...load().filter((v) => opOf(v)?.requestId !== op.requestId), op])
      // (G2-F19) durable only if THIS exact operation reads back from storage -- never inferred from a probe write.
      const back = stored(op.requestId)
      return back !== null && JSON.stringify(back) === JSON.stringify(op) ? "storage" : "memory"
    },
    remove(requestId) {
      memory.delete(requestId)
      save(load().filter((v) => opOf(v)?.requestId !== requestId))
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
