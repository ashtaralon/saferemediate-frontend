"use client"

/**
 * S2 lifecycle: the Terraform states THIS person uploaded for one account -- discover (the bounded list of their own uploads),
 * read (what each keeps) and revoke (one-way, behind an explicit confirmation). Contract:
 * S2-UNUSED-BINDING-LIFECYCLE-PROPOSAL-2026-10-16 (section 5, design E).
 *
 * Said honestly:
 *  - "no reference found in your visible setups" is NEVER "unused": another person's setup may name it;
 *  - a list the read bound cut short is "not every upload could be listed", never its end; a page with no row but a cursor
 *    read only uploads the person may no longer see, and "Show more" reads further;
 *  - a revoked state stays listed: records are kept, nothing is deleted from here or anywhere;
 *  - states uploaded before this list existed are not shown here;
 *  - a revoke is sent only after the person confirms it, and never resent on its own (an unknown outcome offers the SAME
 *    request again, only when clicked).
 *
 * One revoke at a time (SW122 L1-F1): while a revoke is being sent or its outcome is unknown, no other revoke can start, so
 * an answer always belongs to the one operation on screen, and an unknown outcome keeps its exact retry until it is resolved
 * (sent again) or dismissed (the list is read again, showing what the server now holds). Current editability (SW122 L1-F2)
 * gates every control that sends -- the confirmation's Revoke and the unknown outcome's retry -- and the send itself; when it
 * is lost, the confirmation is unticked and nothing is sent, now or later, until the person confirms again.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  listTerraformBindings,
  revokeTerraformBinding,
  type BindingAnswer,
  type BindingList,
  type BindingListRow,
  type BindingRevoked,
} from "@/lib/terraform-binding"

const REFERENCE_WORDS = {
  found: "named by a setup you can see",
  none_found: "no reference found in your visible setups",
  unknown: "whether a setup names it is not known (too many setups to check)",
} as const

const RESTART = "The list changed while you read it; start again"

/** The one revoke on screen: its row and request id are frozen when it is opened, so a retry is the same request. */
type Revoke = { row: BindingListRow; requestId: string; problem: string | null; sending: boolean; unknown: boolean }

export function TerraformBindingsPanel({ accountId, editable, list = listTerraformBindings, revoke = revokeTerraformBinding,
                                         requestId = () => crypto.randomUUID() }: {
  accountId: string
  editable: boolean
  list?: (accountId: string | null, cursor?: string | null) => Promise<BindingAnswer<BindingList>>
  revoke?: (bindingId: string, requestId: string, baseRevision: number) => Promise<BindingAnswer<BindingRevoked>>
  requestId?: () => string
}) {
  const [rows, setRows] = useState<BindingListRow[]>([])
  const [page, setPage] = useState<{ complete: boolean; nextCursor: string | null } | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<Revoke | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const alive = useRef(true)
  const reads = useRef(0)                                     // the latest read: an older one's answer is never applied
  const inFlight = useRef<string | null>(null)                // the request id whose answer is awaited
  const editableNow = useRef(editable)
  const shownRows = useRef<BindingListRow[]>([])             // the rows on screen, for the next page to append to
  useEffect(() => () => { alive.current = false }, [])
  useLayoutEffect(() => { editableNow.current = editable }, [editable])
  useLayoutEffect(() => { shownRows.current = rows }, [rows])
  useEffect(() => { if (!editable) setConfirmed(false) }, [editable])

  const read = useCallback(async (cursor: string | null) => {
    const generation = ++reads.current
    setBusy(true)
    const answer = await list(accountId, cursor)
    if (!alive.current || generation !== reads.current) return
    setBusy(false)
    if (answer.kind === "OK") {
      const before = cursor === null ? [] : shownRows.current
      const shown = new Set(before.map((r) => r.bindingId))
      if (answer.value.rows.some((r) => shown.has(r.bindingId))) return setProblem(`${RESTART}.`)   // a row twice: not one list
      setProblem(null)
      setRows([...before, ...answer.value.rows])
      setPage({ complete: answer.value.complete, nextCursor: answer.value.nextCursor })
      return
    }
    setProblem(answer.kind === "SIGN_IN_AGAIN" ? "Your session ended: sign in again to see your uploaded states."
      : answer.kind === "REFUSED" && answer.code === "CURSOR_INVALID" ? `${RESTART} (CURSOR_INVALID).`
        : `Your uploaded states could not be read (${answer.kind === "REFUSED" || answer.kind === "UNKNOWN" ? answer.code : "?"}).`)
  }, [accountId, list])

  useEffect(() => { void read(null) }, [read])

  const unresolved = pending !== null && (pending.sending || pending.unknown)

  const sendRevoke = async (p: Revoke) => {
    // the send itself re-checks what its controls check: editable NOW, and no other revoke awaiting its answer
    if (!editableNow.current || inFlight.current !== null) return
    inFlight.current = p.requestId
    setPending({ ...p, sending: true, problem: null })
    let answer: BindingAnswer<BindingRevoked>
    try {
      answer = await revoke(p.row.bindingId, p.requestId, p.row.revision)
    } finally {
      inFlight.current = null
    }
    if (!alive.current) return
    // only THIS operation's state is settled (redundant while revokes are serialized; kept as the answer's identity fence)
    const settle = (next: Revoke | null) => setPending((current) => (current?.requestId === p.requestId ? next : current))
    if (answer.kind === "OK") {
      settle(null)
      setConfirmed(false)
      return void read(null)                              // read again from the start: the revoked state stays listed
    }
    if (answer.kind === "UNKNOWN") return settle({ ...p, sending: false, unknown: true, problem: `Whether it was revoked is not known (${answer.code}).` })
    settle({ ...p, sending: false, unknown: false, problem: answer.kind === "SIGN_IN_AGAIN" ? "Your session ended: sign in again; nothing was resent."
      : `Not revoked (${answer.code}).` })
  }

  const open = (row: BindingListRow) => {
    if (!editableNow.current || unresolved) return
    setConfirmed(false)
    setPending({ row, requestId: requestId(), problem: null, sending: false, unknown: false })
  }

  const dismiss = () => {
    setPending(null)
    setConfirmed(false)
    void read(null)                                       // what the server now holds: revoked or still active
  }

  return (
    <div className="mt-2 space-y-1 rounded border border-slate-200 p-2 text-xs" data-testid="terraform-bindings-panel">
      <p className="font-medium">Terraform states you uploaded (account {accountId})</p>
      <p className="text-slate-500">States uploaded before this list existed are not shown here.</p>
      {problem ? (
        <p role="alert" className="text-amber-800">{problem} <Button type="button" size="sm" variant="ghost" onClick={() => void read(null)}>Start again</Button></p>
      ) : null}
      {page && page.complete && rows.length === 0 ? <p>No Terraform state you uploaded for this account is visible to you.</p> : null}
      {page && !page.complete && page.nextCursor && rows.length === 0 ? (
        <p data-testid="terraform-bindings-none-yet">None of the uploads read so far is visible to you; Show more reads further.</p>
      ) : null}
      {unresolved ? (
        <p className="text-slate-600" data-testid="terraform-bindings-one-at-a-time">
          Another revoke can start once this one is answered or dismissed.
        </p>
      ) : null}
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.bindingId} data-testid={`terraform-binding-${row.bindingId}`}>
            <span>{row.workspaceIdentity}</span>
            {" · "}uploaded {row.createdAt}{" · "}{row.instances} resource(s) kept{" · "}
            {row.status === "REVOKED" ? `revoked ${row.revokedAt}` : "active"}{" · "}
            {REFERENCE_WORDS[row.referenceInYourSetups ?? "unknown"]}
            <span className="block text-slate-500">binding {row.bindingId}</span>
            {row.status === "ACTIVE" && editable && pending?.row.bindingId !== row.bindingId ? (
              <Button type="button" size="sm" variant="outline" disabled={unresolved} onClick={() => open(row)}>
                Revoke…
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {pending ? (
        <div className="mt-1 space-y-1 rounded border border-amber-300 p-2" data-testid="terraform-binding-revoke-confirm">
          <p>
            Revoke &quot;{pending.row.workspaceIdentity}&quot; (binding {pending.row.bindingId})? It stays listed as a revoked record;
            any setup that uses it is held (BINDING_REVOKED). This cannot be undone.
          </p>
          {pending.problem ? <p role="alert" className="text-amber-800">{pending.problem}</p> : null}
          {!editable && !pending.sending ? (
            <p className="text-amber-800" data-testid="terraform-binding-revoke-not-editable">
              This setup cannot be edited now, so nothing will be sent{pending.unknown ? "; the earlier revoke's outcome is still unknown" : ""}.
            </p>
          ) : null}
          {pending.unknown ? (
            <>
              <Button type="button" size="sm" disabled={!editable || pending.sending} onClick={() => void sendRevoke(pending)}>
                Send the same revoke again
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={pending.sending} onClick={dismiss}>
                Dismiss and read the list again
              </Button>
            </>
          ) : (
            <>
              <label className="block">
                <input type="checkbox" checked={confirmed} disabled={!editable || pending.sending} aria-label="I confirm this revoke"
                  onChange={(e) => setConfirmed(e.target.checked)} />
                <span className="ml-1">I understand: this binding is revoked for good.</span>
              </label>
              <Button type="button" size="sm" disabled={!editable || !confirmed || pending.sending} onClick={() => void sendRevoke(pending)}>
                {pending.sending ? "Revoking…" : "Revoke"}
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={pending.sending} onClick={() => setPending(null)}>Cancel</Button>
            </>
          )}
        </div>
      ) : null}
      {page?.nextCursor ? (
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void read(page.nextCursor)}>Show more</Button>
      ) : null}
      {page && !page.complete && !page.nextCursor ? (
        <p className="text-amber-800" data-testid="terraform-bindings-incomplete">
          Not every upload could be listed within the read bound; more may exist that this view cannot reach.
        </p>
      ) : null}
    </div>
  )
}
