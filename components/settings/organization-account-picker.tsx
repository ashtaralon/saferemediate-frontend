"use client"

/**
 * Settings > Accounts, Add an AWS account > "Choose from your organization" (optional).
 *
 * Renders only what GET /api/admin/accounts/organization answers (backend cyntro_data/accounts/org_discovery.py):
 * its state, its reason, its listed accounts, and -- while the discovery role still has to be set up -- the exact
 * setup parameters the backend returns. Nothing here registers an account: "Find accounts" asks the account connector
 * to list the organization (a verified operator's request), and choosing an account only fills the Add form, which
 * still goes through Review and the explicit Add account step.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import {
  accountAdminFailure,
  formatUtcInstantExact,
  organizationAccountSelectable,
  organizationUnavailableText,
  organizationWhyNotText,
  type AccountIdCheck,
  type OrganizationAccount,
  type OrganizationDiscovery,
  type OrganizationReadState,
} from "@/lib/account-admin"
import { CopyButton } from "@/components/settings/connect-account-panel"

const DISCOVERY_POLL_MS = 4000
/** Consecutive failed reads after which reading stops on its own; "Read again" then reads once more (never re-asks). */
const MAX_FAILED_READS = 5

/** The organization answer for one customer, as read so far (GET only). */
export interface OrganizationReader extends OrganizationReadState {
  /** No read has finished yet. */
  loading: boolean
  /** What failed, said in words first; the backend's own detail (status, refusal) stays visible beneath it. */
  error: { title: string; detail: string } | null
  /** Re-reads every few seconds while the connector is listing. */
  polling: boolean
  /** One more read -- a read, never a new request. */
  reload: () => Promise<void>
}

interface ReaderState extends OrganizationReadState {
  customerId: string | null
  error: { title: string; detail: string } | null
  loaded: boolean
  reads: number
  failedReads: number
}

const unread = (customerId: string | null): ReaderState =>
  ({ customerId, answer: null, reading: false, failed: false, error: null, loaded: false, reads: 0, failedReads: 0 })

/**
 * The one organization reader of the Add dialog (and of a picker used on its own): GET on mount, again while the
 * connector is listing, and on Try again / Read again. It never asks for a new listing. Its state belongs to one
 * customer: an answer that arrives after the customer changed, or that names another customer, is never kept.
 */
export function useOrganizationDiscovery(customerId: string | null): OrganizationReader {
  const [stored, setStored] = useState<ReaderState>(() => unread(customerId))
  // Kept per customer: whatever was read for another customer -- even an answer that lands after the customer
  // changed -- is never this customer's state.
  const state = stored.customerId === customerId ? stored : unread(customerId)
  // Only the latest read may answer: an older one that answers late is dropped.
  const latestRead = useRef(0)

  const load = useCallback(async () => {
    if (!customerId) return
    const read = ++latestRead.current
    const requested = customerId
    const current = () => read === latestRead.current
    const update = (change: (base: ReaderState) => Partial<ReaderState>) =>
      setStored((previous) => {
        const base = previous.customerId === requested ? previous : unread(requested)
        return { ...base, ...change(base) }
      })
    update(() => ({ reading: true }))
    try {
      const response = await fetch(`/api/proxy/admin/accounts/organization?customer_id=${encodeURIComponent(requested)}`, {
        cache: "no-store",
      })
      if (!response.ok) throw await accountAdminFailure(response, "Organization accounts")
      const answer = (await response.json()) as OrganizationDiscovery
      if (!current()) return
      if (answer && typeof answer.customer_id === "string" && answer.customer_id !== requested) {
        throw new Error(`Organization accounts answered for another customer (${answer.customer_id}), so the answer is not used.`)
      }
      update(() => ({ answer, failed: false, error: null, failedReads: 0 }))
    } catch (reason) {
      if (!current()) return
      update((base) => ({
        failed: true,
        error: {
          title: "Cyntro could not read your organization's accounts.",
          detail: reason instanceof Error ? reason.message : String(reason),
        },
        failedReads: base.failedReads + 1,
      }))
    } finally {
      // Every completed read, answered or failed, advances `reads`: the poll below is scheduled from it, so a failed
      // read is followed by another one.
      if (current()) update((base) => ({ reading: false, loaded: true, reads: base.reads + 1 }))
    }
  }, [customerId])

  useEffect(() => {
    void load()
  }, [load])

  // The connector answers within seconds; while it works, read again -- after each read, answered or not, until it
  // is not RUNNING or reads keep failing.
  const polling = state.answer?.state === "RUNNING" && state.failedReads < MAX_FAILED_READS
  useEffect(() => {
    if (!polling) return
    const timer = window.setTimeout(() => void load(), DISCOVERY_POLL_MS)
    return () => window.clearTimeout(timer)
  }, [polling, state.reads, load])

  return {
    answer: state.answer,
    reading: state.reading,
    failed: state.failed,
    loading: !state.loaded,
    error: state.error,
    polling,
    reload: load,
  }
}

export function OrganizationAccountPicker({
  customerId,
  onChoose,
  onEnterManually,
  reader,
  checkAccount,
}: {
  customerId: string | null
  onChoose: (account: { accountId: string; name: string }) => void
  onEnterManually: () => void
  /** The Add dialog's reader, so both ways of adding hold an ID to the same answer. Without it the picker reads on
   *  its own. */
  reader?: OrganizationReader
  /** The Add dialog's own account ID check (lib/account-admin.ts checkAccountId): an account is offered only when that
   *  check finds it in the current list with nothing ruling it out. */
  checkAccount?: (accountId: string) => AccountIdCheck
}) {
  const own = useOrganizationDiscovery(reader ? null : customerId)
  const { answer: discovery, loading, error, polling, reload: load } = reader ?? own
  const [asking, setAsking] = useState(false)
  // A refused Find accounts, said where the read errors are.
  const [askError, setAskError] = useState<{ title: string; detail: string } | null>(null)
  // The account picked in the dropdown; "Use this account" fills the Add form with it.
  const [selected, setSelected] = useState("")
  const selectId = useId()

  async function findAccounts() {
    if (!customerId) return
    setAsking(true)
    setAskError(null)
    try {
      const response = await fetch(
        `/api/proxy/admin/accounts/organization/discover?customer_id=${encodeURIComponent(customerId)}`,
        { method: "POST" },
      )
      if (!response.ok) throw await accountAdminFailure(response, "Finding accounts")
      await load()
    } catch (reason) {
      setAskError({
        title: "Cyntro could not ask for your organization's accounts.",
        detail: reason instanceof Error ? reason.message : String(reason),
      })
    } finally {
      setAsking(false)
    }
  }

  const findButton = (label: string) => (
    <button
      type="button"
      onClick={() => void findAccounts()}
      disabled={asking || !customerId}
      className="inline-flex items-center gap-2 rounded-lg border border-teal-700 px-3 py-1.5 text-sm font-semibold text-teal-700 disabled:opacity-40"
    >
      {asking ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
      {label}
    </button>
  )
  const manualButton = (
    <button type="button" onClick={onEnterManually} className="text-sm font-semibold text-slate-600 underline">
      Enter an account ID instead
    </button>
  )

  if (loading && !discovery && !error) {
    return <p className="flex items-center gap-2 p-6 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking your organization…</p>
  }

  const state = discovery?.state
  // Rows are rendered only in the AVAILABLE block below; that is the one place they can appear.
  const listed = discovery?.accounts
  const accounts: OrganizationAccount[] = Array.isArray(listed) ? listed : []
  // Offered: the backend offers it AND the Add dialog's check finds it in the current list with nothing ruling it out
  // (the same gate a typed ID goes through).
  const refusal = (account: OrganizationAccount): string | null => {
    if (!organizationAccountSelectable(account)) return organizationWhyNotText(account)
    if (!checkAccount) return null
    const known = checkAccount(account.account_id)
    return known.state === "LISTED" ? null : "short" in known ? known.short : "Cannot be verified"
  }
  const picked = accounts.find((account) => account.account_id === selected && refusal(account) === null)

  return (
    <div data-testid="organization-picker" className="space-y-4 p-6 text-sm text-slate-700">
      <p className="text-xs text-slate-500">
        Cyntro lists your organization&apos;s account IDs, names and states. Nothing is added: choosing an account fills in the form, and you still review and add it.
      </p>
      {askError || error ? (
        <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">{(askError || error)?.title}</p>
          <p className="mt-1 text-xs text-amber-800">{(askError || error)?.detail}</p>
        </div>
      ) : null}
      {error && !discovery ? (
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-teal-700 px-3 py-1.5 text-sm font-semibold text-teal-700"
          >
            Try again
          </button>
          {manualButton}
        </div>
      ) : null}

      {state === "NOT_RUN" ? (
        <div className="space-y-3">
          <p>Your organization&apos;s accounts have not been listed for this installation yet.</p>
          <div className="flex items-center gap-4">{findButton("Find accounts")}{manualButton}</div>
        </div>
      ) : null}

      {state === "RUNNING" && !polling ? (
        <div className="space-y-3">
          <p>Cyntro could not read the listing&apos;s progress. It may still be listing your organization&apos;s accounts.</p>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-lg border border-teal-700 px-3 py-1.5 text-sm font-semibold text-teal-700"
            >
              Read again
            </button>
            {manualButton}
          </div>
        </div>
      ) : state === "RUNNING" ? (
        <p className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Listing your organization&apos;s accounts…</p>
      ) : null}

      {state === "EXPIRED" ? (
        <div className="space-y-3">
          <p>The last list is more than 24 hours old, so it is not offered.</p>
          <OrganizationSource discovery={discovery} />
          <div className="flex items-center gap-4">{findButton("Find accounts")}{manualButton}</div>
        </div>
      ) : null}

      {state === "UNAVAILABLE" ? (
        <div className="space-y-3" data-testid="organization-unavailable">
          <p className="font-semibold text-slate-900">{organizationUnavailableText(discovery?.reason)}</p>
          <OrganizationSource discovery={discovery} />
          {discovery?.setup ? <DiscoverySetup setup={discovery.setup} /> : null}
          {!discovery?.setup && (discovery?.reason === "NOT_CONFIGURED" || discovery?.reason === "ROLE_NOT_USABLE") ? (
            <p className="text-xs text-slate-500">The values to set it up are not available from this installation yet; see INSTALL.md, section 8.</p>
          ) : null}
          <div className="flex items-center gap-4">{findButton("Check again")}{manualButton}</div>
        </div>
      ) : null}

      {state === "AVAILABLE" ? (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Organization {discovery?.organization_id || "(not reported)"}
            {discovery?.discovered_at ? `, listed ${formatUtcInstantExact(discovery.discovered_at)}` : ""}.
          </p>
          {discovery?.management_account_id ? (
            <p data-testid="organization-management" className="text-xs text-slate-500">
              Management account, as AWS Organizations reported it:{" "}
              <span className="font-mono text-slate-700">{discovery.management_account_id}</span>
            </p>
          ) : null}
          <OrganizationSource discovery={discovery} />
          {discovery?.truncated ? (
            <p className="text-xs text-amber-700">The list was cut short at {accounts.length} accounts; enter the ID of any account not shown.</p>
          ) : null}
          {accounts.length ? (
            <div className="flex items-end gap-3">
              <div className="min-w-0 flex-1">
                <label htmlFor={selectId} className="text-sm font-semibold text-slate-700">AWS account</label>
                <select
                  id={selectId}
                  value={selected}
                  onChange={(event) => setSelected(event.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2 font-normal outline-none focus:border-teal-500"
                >
                  <option value="">Choose an account</option>
                  {accounts.map((account) => {
                    const why = refusal(account)
                    const offered = why === null
                    return (
                      <option
                        key={account.account_id}
                        value={account.account_id}
                        disabled={!offered}
                        data-testid={`organization-account-${account.account_id}`}
                      >
                        {`${account.name || account.account_id} — ${account.account_id}`}
                        {offered ? "" : ` (${why})`}
                      </option>
                    )
                  })}
                </select>
              </div>
              <button
                type="button"
                disabled={!picked}
                onClick={() => picked && onChoose({ accountId: picked.account_id, name: picked.name || picked.account_id })}
                className="shrink-0 rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
              >
                Use this account
              </button>
            </div>
          ) : (
            <p>No accounts were listed.</p>
          )}
          <p className="text-xs text-slate-500">
            Choosing an account only fills in its ID. The listing grants Cyntro no access to any account: Cyntro reads an
            account only after the connection stack is deployed in it.
          </p>
          <div className="flex items-center gap-4">{findButton("Find accounts again")}{manualButton}</div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * The role the LAST discovery recorded, and that role's own account (backend org_discovery._source). It is history,
 * not a read of this installation's current configuration: absent before the first discovery, and stale once the
 * installer's discovery role changes. It never says what the management account is -- that is shown on its own, only
 * as AWS Organizations reported it.
 */
function OrganizationSource({ discovery }: { discovery: OrganizationDiscovery | null }) {
  const source = discovery?.source
  if (!source?.role_arn || !source.account_id) return null
  return (
    <p data-testid="organization-source" className="text-xs text-slate-500">
      Last discovery source: <span className="break-all font-mono text-slate-700">{source.role_arn}</span>, in account{" "}
      <span className="font-mono text-slate-700">{source.account_id}</span>. This is what the last discovery recorded,
      not a fresh read of this installation&apos;s current configuration.
    </p>
  )
}

/** The discovery role's parameters, exactly as the backend returned them (setup_parameters); never filled in here. */
function DiscoverySetup({ setup }: { setup: { template: string; parameters: Record<string, string> } }) {
  const parameters = Object.entries(setup.parameters || {})
  return (
    <div data-testid="organization-setup" className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
      <p>
        To set it up, deploy <span className="font-mono">{setup.template}</span> (in this installation&apos;s bundle) in your
        organization&apos;s management account, or an account delegated AWS Organizations read, with:
      </p>
      <dl className="space-y-1">
        {parameters.map(([name, value]) => (
          <div key={name} className="flex items-center gap-2">
            <dt className="w-48 shrink-0 font-semibold text-slate-600">{name}</dt>
            <dd className="min-w-0 flex-1 truncate font-mono text-slate-800">{value}</dd>
            <CopyButton value={value} label={`Copy ${name}`} />
          </div>
        ))}
      </dl>
      <p>
        Then set the stack&apos;s OrgDiscoveryRoleArn output as ORG_DISCOVERY_ROLE_ARN in this installation&apos;s install.env and
        re-run the installer. The role can only list account IDs, names and states.
      </p>
    </div>
  )
}
