"use client"

/**
 * S2 lifecycle: the uploaded Terraform states this person can see, for one account -- discover (the bounded list), read (what
 * each keeps) and revoke (one-way, behind an explicit confirmation). Contract: S2-UNUSED-BINDING-LIFECYCLE-PROPOSAL-2026-10-16.
 *
 * Said honestly:
 *  - "no reference found in your visible setups" is NEVER "unused": another person's setup may name it;
 *  - a list the read bound cut short is "not every upload could be listed", never its end;
 *  - a revoked state stays listed: records are kept, nothing is deleted from here or anywhere;
 *  - a revoke is sent only after the person confirms it, and never resent on its own (an unknown outcome offers the SAME
 *    request again, only when clicked).
 */
import { useCallback, useEffect, useRef, useState } from "react"
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

type Pending = { row: BindingListRow; requestId: string; problem: string | null; sending: boolean; unknown: boolean }

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
  const [pending, setPending] = useState<Pending | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])

  const read = useCallback(async (cursor: string | null) => {
    setBusy(true)
    const answer = await list(accountId, cursor)
    if (!alive.current) return
    setBusy(false)
    if (answer.kind === "OK") {
      setProblem(null)
      setRows((current) => (cursor === null ? answer.value.rows : [...current, ...answer.value.rows]))
      setPage({ complete: answer.value.complete, nextCursor: answer.value.nextCursor })
      return
    }
    setProblem(answer.kind === "SIGN_IN_AGAIN" ? "Your session ended: sign in again to see your uploaded states."
      : answer.kind === "REFUSED" && answer.code === "CURSOR_INVALID" ? "The list changed while you read it; start again (CURSOR_INVALID)."
        : `Your uploaded states could not be read (${answer.kind === "REFUSED" || answer.kind === "UNKNOWN" ? answer.code : "?"}).`)
  }, [accountId, list])

  useEffect(() => { void read(null) }, [read])

  const sendRevoke = async (p: Pending) => {
    setPending({ ...p, sending: true, problem: null })
    const answer = await revoke(p.row.bindingId, p.requestId, p.row.revision)
    if (!alive.current) return
    if (answer.kind === "OK") {
      setPending(null)
      setConfirmed(false)
      return void read(null)                              // read again from the start: the revoked state stays listed
    }
    if (answer.kind === "UNKNOWN") return setPending({ ...p, sending: false, unknown: true, problem: `Whether it was revoked is not known (${answer.code}).` })
    setPending({ ...p, sending: false, unknown: false, problem: answer.kind === "SIGN_IN_AGAIN" ? "Your session ended: sign in again; nothing was resent."
      : `Not revoked (${answer.code}).` })
  }

  return (
    <div className="mt-2 space-y-1 rounded border border-slate-200 p-2 text-xs" data-testid="terraform-bindings-panel">
      <p className="font-medium">Your uploaded Terraform states (account {accountId})</p>
      {problem ? (
        <p role="alert" className="text-amber-800">{problem} <Button type="button" size="sm" variant="ghost" onClick={() => void read(null)}>Start again</Button></p>
      ) : null}
      {page && page.complete && rows.length === 0 ? <p>No uploaded Terraform state of this account is visible to you.</p> : null}
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.bindingId} data-testid={`terraform-binding-${row.bindingId}`}>
            <span>{row.workspaceIdentity}</span>
            {" · "}uploaded {row.createdAt}{" · "}{row.instances} resource(s) kept{" · "}
            {row.status === "REVOKED" ? `revoked ${row.revokedAt}` : "active"}{" · "}
            {REFERENCE_WORDS[row.referenceInYourSetups ?? "unknown"]}
            <span className="block text-slate-500">binding {row.bindingId}</span>
            {row.status === "ACTIVE" && editable && pending?.row.bindingId !== row.bindingId ? (
              <Button type="button" size="sm" variant="outline" onClick={() => { setConfirmed(false); setPending({ row, requestId: requestId(), problem: null, sending: false, unknown: false }) }}>
                Revoke…
              </Button>
            ) : null}
            {pending?.row.bindingId === row.bindingId ? (
              <div className="mt-1 space-y-1 rounded border border-amber-300 p-2" data-testid="terraform-binding-revoke-confirm">
                <p>
                  Revoke &quot;{row.workspaceIdentity}&quot; (binding {row.bindingId})? It stays listed as a revoked record; any setup that
                  uses it is held (BINDING_REVOKED). This cannot be undone.
                </p>
                {pending.problem ? <p role="alert" className="text-amber-800">{pending.problem}</p> : null}
                {pending.unknown ? (
                  <Button type="button" size="sm" disabled={pending.sending} onClick={() => void sendRevoke(pending)}>Send the same revoke again</Button>
                ) : (
                  <>
                    <label className="block">
                      <input type="checkbox" checked={confirmed} disabled={pending.sending} aria-label="I confirm this revoke"
                        onChange={(e) => setConfirmed(e.target.checked)} />
                      <span className="ml-1">I understand: this binding is revoked for good.</span>
                    </label>
                    <Button type="button" size="sm" disabled={!confirmed || pending.sending} onClick={() => void sendRevoke(pending)}>
                      {pending.sending ? "Revoking…" : "Revoke"}
                    </Button>
                  </>
                )}
                <Button type="button" size="sm" variant="ghost" disabled={pending.sending} onClick={() => setPending(null)}>Cancel</Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
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
