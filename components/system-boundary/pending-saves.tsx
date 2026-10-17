"use client"

/**
 * The person's saves from this account whose outcome this browser has not seen yet (Phase 2 T18), each asked of the
 * backend by its own request id:
 *  - committed            -> "Saved as revision N", dropped from the browser's list;
 *  - committed, withheld   -> saved, but the person's current scope no longer shows it (RECEIPT_WITHHELD), dropped;
 *  - not found            -> not saved yet: resend the SAME request (safe: it can never save twice) or discard it;
 *  - anything else        -> could not be checked now; kept, and can be checked again.
 * A resend that is refused is a definite answer (nothing was saved) and is dropped with its reason. Nothing here mints a
 * request or changes an envelope. Entries an earlier version of the console wrote are named and never resent.
 */
import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  readRequest,
  saveCorrection,
  saveDeclaration,
  type CorrectionEnvelope,
  type CreateEnvelope,
  type ReadResult,
  type RequestReceipt,
  type SaveResult,
} from "@/lib/system-boundary-authoring"
import { describeResult } from "@/lib/system-boundary-declaration"
import { pendingFor, type PendingSave, type PendingStore } from "@/lib/system-boundary-pending"

type Status =
  | { kind: "checking" }
  | { kind: "saved"; revision: number; message: string }
  | { kind: "withheld"; revision: number | null }
  | { kind: "not_saved" }
  | { kind: "unchecked"; code: string }
  | { kind: "refused"; message: string; code: string }
  | { kind: "unconfirmed" }

export interface PendingSavesProps {
  accountId: string
  actor: string
  store: PendingStore
  /** Injectable for tests; defaults to the authoring proxy. */
  readReceipt?: (requestId: string) => Promise<ReadResult<RequestReceipt>>
  resend?: (entry: PendingSave) => Promise<SaveResult>
}

function defaultResend(entry: PendingSave): Promise<SaveResult> {
  return entry.kind === "CREATE" ? saveDeclaration(entry.envelope as CreateEnvelope) : saveCorrection(entry.envelope as CorrectionEnvelope)
}

export function PendingSaves({ accountId, actor, store, readReceipt = readRequest, resend = defaultResend }: PendingSavesProps) {
  const [entries, setEntries] = useState<PendingSave[]>([])
  const [unreadable, setUnreadable] = useState(0)
  const [status, setStatus] = useState<Record<string, Status>>({})

  const set = (id: string, next: Status) => setStatus((current) => ({ ...current, [id]: next }))

  const check = useCallback(async (entry: PendingSave) => {
    const id = entry.envelope.request_id
    set(id, { kind: "checking" })
    const found = await readReceipt(id)
    if (found.kind === "OK") {
      store.remove(entry)
      set(id, { kind: "saved", revision: found.value.revision,
                message: `Saved as revision ${found.value.revision}. Cyntro is preparing this system's membership; nothing is applied yet.` })
    } else if (found.kind === "REFUSED" && found.code === "RECEIPT_WITHHELD") {
      store.remove(entry)
      set(id, { kind: "withheld", revision: Number.isInteger(found.detail.revision) ? (found.detail.revision as number) : null })
    } else if (found.kind === "REFUSED" && found.code === "REQUEST_NOT_FOUND") {
      set(id, { kind: "not_saved" })
    } else {
      set(id, { kind: "unchecked", code: found.code })
    }
  }, [readReceipt, store])

  useEffect(() => {
    const read = store.read()
    const mine = pendingFor(read, actor, accountId)
    setEntries(mine)
    setUnreadable(read.unreadable)
    for (const entry of mine) void check(entry)
  }, [store, actor, accountId, check])

  const resendSame = async (entry: PendingSave) => {
    const id = entry.envelope.request_id
    set(id, { kind: "checking" })
    const outcome = describeResult(await resend(entry))
    if (outcome.kind === "saved") {
      store.remove(entry)
      set(id, { kind: "saved", revision: outcome.revision, message: outcome.message })
    } else if (outcome.kind === "refused") {
      store.remove(entry)                                          // a definite answer: this request saved nothing
      set(id, { kind: "refused", message: outcome.message, code: outcome.code })
    } else {
      set(id, { kind: "unconfirmed" })
    }
  }

  const discard = (entry: PendingSave) => {
    store.remove(entry)
    setEntries((current) => current.filter((e) => e.envelope.request_id !== entry.envelope.request_id))
  }

  if (entries.length === 0 && unreadable === 0) return null
  return (
    <section aria-label="Saves in progress" className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm"
      data-testid="pending-saves">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Saves in progress</h3>
      {unreadable ? (
        <p className="text-xs text-amber-800">
          {unreadable} {unreadable === 1 ? "save was" : "saves were"} started by an earlier version of this console and could not be
          read; {unreadable === 1 ? "it was" : "they were"} not resent.{" "}
          <button type="button" className="underline" onClick={() => { store.clearUnreadable(); setUnreadable(0) }}>Discard</button>
        </p>
      ) : null}
      <ul className="space-y-2">
        {entries.map((entry) => {
          const id = entry.envelope.request_id
          const state = status[id] ?? { kind: "checking" }
          const what = entry.kind === "CREATE" ? "A system declaration" : "A correction"
          return (
            <li key={id} data-testid={`pending-${id}`} className="space-y-1">
              <p>
                {what} started {entry.startedAt}
                {state.kind === "checking" ? ": checking…" : null}
                {state.kind === "saved" ? `: ${state.message}` : null}
                {state.kind === "withheld" ? `: saved${state.revision ? ` as revision ${state.revision}` : ""}; your current access no longer shows its details.` : null}
                {state.kind === "not_saved" ? ": not saved yet." : null}
                {state.kind === "unchecked" ? `: could not be checked right now (${state.code}).` : null}
                {state.kind === "refused" ? `: ${state.message} (${state.code})` : null}
                {state.kind === "unconfirmed" ? ": the resend could not be confirmed either." : null}
              </p>
              {state.kind === "not_saved" || state.kind === "unconfirmed" ? (
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={() => void resendSame(entry)}>Resend the same request</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => discard(entry)}>Discard</Button>
                </div>
              ) : null}
              {state.kind === "unchecked" ? (
                <Button type="button" size="sm" variant="outline" onClick={() => void check(entry)}>Check again</Button>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
