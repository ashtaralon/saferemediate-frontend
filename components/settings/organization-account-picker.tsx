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
import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import {
  accountAdminFailure,
  formatUtcInstantExact,
  organizationAccountSelectable,
  organizationUnavailableText,
  organizationWhyNotText,
  type OrganizationAccount,
  type OrganizationDiscovery,
} from "@/lib/account-admin"
import { CopyButton } from "@/components/settings/connect-account-panel"

const DISCOVERY_POLL_MS = 4000
/** Consecutive failed reads after which reading stops on its own; "Read again" then reads once more (never re-asks). */
const MAX_FAILED_READS = 5

export function OrganizationAccountPicker({
  customerId,
  onChoose,
  onEnterManually,
}: {
  customerId: string | null
  onChoose: (account: { accountId: string; name: string }) => void
  onEnterManually: () => void
}) {
  const [discovery, setDiscovery] = useState<OrganizationDiscovery | null>(null)
  const [loading, setLoading] = useState(true)
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  // Every completed read, answered or failed, advances `reads`: the poll below is scheduled from it, so a failed read
  // is followed by another one (a failure leaves `discovery` as it was and would otherwise stop the poll for good).
  const [reads, setReads] = useState(0)
  const [failedReads, setFailedReads] = useState(0)
  // Only the latest read may answer: an older one that answers late is dropped. (After the picker closes React ignores
  // a late answer, and the poll's timer is cleared below.)
  const latestRead = useRef(0)

  const load = useCallback(async () => {
    if (!customerId) return
    const read = ++latestRead.current
    const current = () => read === latestRead.current
    try {
      const response = await fetch(`/api/proxy/admin/accounts/organization?customer_id=${encodeURIComponent(customerId)}`, {
        cache: "no-store",
      })
      if (!response.ok) throw await accountAdminFailure(response, "Organization accounts")
      const answer = (await response.json()) as OrganizationDiscovery
      if (!current()) return
      setDiscovery(answer)
      setError(null)
      setFailedReads(0)
    } catch (reason) {
      if (!current()) return
      setError(reason instanceof Error ? reason.message : String(reason))
      setFailedReads((count) => count + 1)
    } finally {
      if (current()) {
        setLoading(false)
        setReads((count) => count + 1)
      }
    }
  }, [customerId])

  useEffect(() => {
    void load()
  }, [load])

  // The connector answers within seconds; while it works, read again -- after each read, answered or not, until it
  // is not RUNNING or reads keep failing.
  const polling = discovery?.state === "RUNNING" && failedReads < MAX_FAILED_READS
  useEffect(() => {
    if (!polling) return
    const timer = window.setTimeout(() => void load(), DISCOVERY_POLL_MS)
    return () => window.clearTimeout(timer)
  }, [polling, reads, load])

  async function findAccounts() {
    if (!customerId) return
    setAsking(true)
    setError(null)
    try {
      const response = await fetch(
        `/api/proxy/admin/accounts/organization/discover?customer_id=${encodeURIComponent(customerId)}`,
        { method: "POST" },
      )
      if (!response.ok) throw await accountAdminFailure(response, "Finding accounts")
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
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
  const query = search.trim().toLowerCase()
  const shown = query
    ? accounts.filter((account) => account.account_id.includes(query) || String(account.name || "").toLowerCase().includes(query))
    : accounts

  return (
    <div data-testid="organization-picker" className="space-y-4 p-6 text-sm text-slate-700">
      <p className="text-xs text-slate-500">
        Cyntro lists your organization&apos;s account IDs, names and states. Nothing is added: choosing an account fills in the form, and you still review and add it.
      </p>
      {error ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {error && !discovery ? <div>{manualButton}</div> : null}

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
          <div className="flex items-center gap-4">{findButton("Find accounts")}{manualButton}</div>
        </div>
      ) : null}

      {state === "UNAVAILABLE" ? (
        <div className="space-y-3" data-testid="organization-unavailable">
          <p className="font-semibold text-slate-900">{organizationUnavailableText(discovery?.reason)}</p>
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
          {discovery?.truncated ? (
            <p className="text-xs text-amber-700">The list was cut short at {accounts.length} accounts; enter the ID of any account not shown.</p>
          ) : null}
          {accounts.length ? (
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or account ID"
              aria-label="Search accounts"
              className="w-full rounded-lg border border-slate-200 p-2 outline-none focus:border-teal-500"
            />
          ) : (
            <p>No accounts were listed.</p>
          )}
          <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {shown.map((account) => (
              <li key={account.account_id} data-testid={`organization-account-${account.account_id}`} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{account.name || account.account_id}</p>
                  <p className="font-mono text-xs text-slate-500">{account.account_id} · {account.state}</p>
                </div>
                {organizationAccountSelectable(account) ? (
                  <button
                    type="button"
                    onClick={() => onChoose({ accountId: account.account_id, name: account.name || account.account_id })}
                    aria-label={`Use ${account.name || account.account_id} (${account.account_id})`}
                    className="shrink-0 rounded-lg bg-teal-700 px-3 py-1 text-xs font-semibold text-white"
                  >
                    Use this account
                  </button>
                ) : (
                  <span className="shrink-0 text-xs text-slate-500">{organizationWhyNotText(account)}</span>
                )}
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-4">{findButton("Find accounts again")}{manualButton}</div>
        </div>
      ) : null}
    </div>
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
