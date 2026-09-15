"use client"

import { useEffect, useRef, useState } from "react"
import { Link2, Loader2, PlugZap, RefreshCcw } from "lucide-react"
import {
  attachRole,
  createBinding,
  intentIdentity,
  listBindings,
  readInstallationPlan,
  submitOperation,
  type Binding,
  type InstallationPlan,
  type IntentIdentity,
} from "@/lib/account-onboarding"
import { OperationCard } from "@/components/settings/onboarding-operation-card"
import { BindingSummary, ExternalIdOnce, InstallationPlanView } from "@/components/settings/onboarding-plan"
import { errorText, useTrackedOperation } from "@/components/settings/use-tracked-operation"

const ROLE_ARN = /^arn:aws(?:-[a-z]+)*:iam::(\d{12}):role\/[A-Za-z0-9+=,.@_/-]{1,512}$/
const REGION = /^[a-z]{2}(?:-gov)?-[a-z]+-\d$/

export function parseRegions(value: string): string[] {
  return Array.from(new Set(value.split(",").map((item) => item.trim()).filter(Boolean)))
}

export function roleArnProblem(value: string, accountId: string): string | null {
  const match = ROLE_ARN.exec(value.trim())
  if (!match) return "Enter the IAM role ARN from the stack outputs (arn:aws:iam::<account>:role/<name>)."
  if (match[1] !== accountId) return `The role belongs to account ${match[1]}, not ${accountId}.`
  return null
}

export function SingleAccountOnboarding({
  customerId,
  canSubmit,
  onChanged,
}: {
  customerId: string
  canSubmit: boolean
  onChanged: () => void
}) {
  const [accountId, setAccountId] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [environment, setEnvironment] = useState("PRODUCTION")
  const [regions, setRegions] = useState("eu-west-1")
  const [binding, setBinding] = useState<Binding | null>(null)
  const [bindingLoaded, setBindingLoaded] = useState(false)
  const [externalId, setExternalId] = useState<string | null>(null)
  const [plan, setPlan] = useState<InstallationPlan | null>(null)
  const [roleArn, setRoleArn] = useState("")
  const [working, setWorking] = useState<"binding" | "role" | null>(null)
  const [confirmRotate, setConfirmRotate] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const identities = useRef<IntentIdentity | undefined>(undefined)
  const tracked = useTrackedOperation()

  const accountValid = /^\d{12}$/.test(accountId)
  const regionList = parseRegions(regions)
  const regionsValid = regionList.length > 0 && regionList.every((region) => REGION.test(region))
  const detailsValid = accountValid && displayName.trim().length > 0 && displayName.trim().length <= 120 && regionsValid

  useEffect(() => {
    setBinding(null)
    setBindingLoaded(false)
    setExternalId(null)
    setPlan(null)
    tracked.reset()
    if (!accountValid) return
    let cancelled = false
    listBindings(customerId).then((bindings) => {
      if (cancelled) return
      setBinding(bindings.find((item) => item.account_id === accountId && item.purpose === "MEMBER_READ") || null)
      setBindingLoaded(true)
    }, (reason) => {
      if (!cancelled) setLocalError(errorText(reason))
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, customerId, accountValid])

  async function generateBinding() {
    setWorking("binding")
    setLocalError(null)
    setConfirmRotate(false)
    try {
      const created = await createBinding({ customerId, accountId, purpose: "MEMBER_READ" })
      setBinding(created.binding)
      setExternalId(created.externalIdOnce)
      setPlan(await readInstallationPlan({ customerId, accountId, mode: "single_account", regions: regionList }))
      onChanged()
    } catch (reason) {
      setLocalError(errorText(reason))
    } finally {
      setWorking(null)
    }
  }

  async function showPlan() {
    try {
      setPlan(await readInstallationPlan({ customerId, accountId, mode: "single_account", regions: regionList }))
    } catch (reason) {
      setLocalError(errorText(reason))
    }
  }

  async function saveRole() {
    const problem = roleArnProblem(roleArn, accountId)
    if (problem) {
      setLocalError(problem)
      return
    }
    setWorking("role")
    setLocalError(null)
    try {
      setBinding(await attachRole({ customerId, accountId, purpose: "MEMBER_READ", roleArn: roleArn.trim() }))
      setRoleArn("")
      onChanged()
    } catch (reason) {
      setLocalError(errorText(reason))
    } finally {
      setWorking(null)
    }
  }

  async function connect() {
    const command = { display_name: displayName.trim(), environment, regions: regionList }
    const signature = JSON.stringify({ customerId, accountId, command, bindingVersion: binding?.binding_version })
    identities.current = intentIdentity(identities.current, signature, "CONNECT_ACCOUNT")
    const identity = identities.current
    const finished = await tracked.start(() => submitOperation({ customerId, accountId, operationType: "CONNECT_ACCOUNT", command, identity }))
    if (finished) onChanged()
  }

  const roleReady = Boolean(binding?.role_configured) && binding?.status !== "REVOKED"
  const error = localError || tracked.error

  return (
    <div className="space-y-5" data-testid="single-account-onboarding">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Account name
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Payments production" className="mt-2 w-full rounded-lg border border-slate-200 p-3 font-normal outline-none focus:border-teal-500" />
        </label>
        <label className="text-sm font-semibold text-slate-700">AWS account ID
          <input value={accountId} inputMode="numeric" onChange={(event) => setAccountId(event.target.value.replace(/\D/g, "").slice(0, 12))} placeholder="123456789012" className="mt-2 w-full rounded-lg border border-slate-200 p-3 font-mono font-normal outline-none focus:border-teal-500" />
        </label>
        <label className="text-sm font-semibold text-slate-700">Environment
          <select value={environment} onChange={(event) => setEnvironment(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 bg-white p-3 font-normal outline-none focus:border-teal-500">
            <option>PRODUCTION</option><option>STAGING</option><option>DEVELOPMENT</option><option>SHARED_SERVICES</option>
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Regions
          <input value={regions} onChange={(event) => setRegions(event.target.value)} placeholder="eu-west-1, us-east-1" className="mt-2 w-full rounded-lg border border-slate-200 p-3 font-normal outline-none focus:border-teal-500" />
          {!regionsValid && regions ? <span className="mt-1 block text-xs font-normal text-red-600">Use AWS region codes such as eu-west-1.</span> : null}
        </label>
      </section>

      {accountValid ? (
        <section className="space-y-3 rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold">1. Access binding</h3>
          {!bindingLoaded ? (
            <p className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-3 w-3 animate-spin" /> Checking existing access for {accountId}</p>
          ) : (
            <>
              <BindingSummary binding={binding} title="Read access binding" />
              {externalId ? <ExternalIdOnce label="ExternalId" value={externalId} onStored={() => setExternalId(null)} /> : null}
              {!binding ? (
                <button type="button" disabled={!canSubmit || !detailsValid || working !== null} onClick={() => void generateBinding()} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">
                  {working === "binding" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />} Create access binding
                </button>
              ) : !externalId ? (
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <button type="button" onClick={() => void showPlan()} className="font-semibold text-teal-700">Show installation plan</button>
                  {confirmRotate ? (
                    <span className="inline-flex flex-wrap items-center gap-2 text-amber-900">
                      A new ExternalId invalidates the one in your installed stack.
                      <button type="button" disabled={!canSubmit || working !== null} onClick={() => void generateBinding()} className="rounded-lg bg-amber-600 px-2 py-1 font-semibold text-white disabled:opacity-40">Generate new ExternalId</button>
                      <button type="button" onClick={() => setConfirmRotate(false)} className="font-semibold">Keep current</button>
                    </span>
                  ) : (
                    <button type="button" disabled={!canSubmit} onClick={() => setConfirmRotate(true)} className="inline-flex items-center gap-1 font-semibold text-slate-600 disabled:opacity-40"><RefreshCcw className="h-3 w-3" /> Generate a new ExternalId</button>
                  )}
                </div>
              ) : null}
              {plan ? <InstallationPlanView plan={plan} /> : null}
            </>
          )}
        </section>
      ) : null}

      {binding ? (
        <section className="space-y-3 rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold">2. Read role</h3>
          <p className="text-xs text-slate-500">After your team deploys the stack, paste its ReadRoleArn output. The ARN is stored encrypted and never shown again.</p>
          <div className="flex flex-wrap gap-2">
            <input value={roleArn} onChange={(event) => setRoleArn(event.target.value)} placeholder={`arn:aws:iam::${accountId}:role/CyntroRead-${customerId}`} className="min-w-0 flex-1 rounded-lg border border-slate-200 p-2.5 font-mono text-xs outline-none focus:border-teal-500" />
            <button type="button" disabled={!canSubmit || !roleArn || working !== null} onClick={() => void saveRole()} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">
              {working === "role" ? <Loader2 className="h-3 w-3 animate-spin" /> : null} {binding.role_configured ? "Replace role" : "Attach role"}
            </button>
          </div>
        </section>
      ) : null}

      {roleReady ? (
        <section className="space-y-3 rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold">3. Connect</h3>
          <p className="text-xs text-slate-500">Cyntro assumes the role with the ExternalId, confirms the account, checks read access, and only then starts inventory. Nothing is marked connected before that succeeds.</p>
          {tracked.operation ? (
            <OperationCard operation={tracked.operation} events={tracked.events} canSubmit={canSubmit} busy={tracked.busy} onCancel={(op) => void tracked.cancel(op)} onRetry={(op) => void tracked.retry(op)} />
          ) : (
            <button type="button" disabled={!canSubmit || !detailsValid || tracked.busy} onClick={() => void connect()} className="inline-flex items-center gap-2 rounded-lg bg-[#008f7d] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
              {tracked.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />} Connect account
            </button>
          )}
        </section>
      ) : null}

      {error ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
    </div>
  )
}
