"use client"

import { useEffect, useRef, useState } from "react"
import { AlertTriangle, Check, KeyRound, Loader2, ShieldCheck, X } from "lucide-react"
import {
  AccountOnboardingRequestError,
  isOnboardingPending,
  operationFailureText,
  reuseOnboardingIntentIdentity,
  submitAndTrackOnboarding,
  type AccountOnboardingOperation,
  type SavedOnboardingIntentIdentity,
} from "@/lib/account-onboarding"

function OperationStatusCard({ operation }: { operation: AccountOnboardingOperation }) {
  const pending = isOnboardingPending(operation.status)
  const positive = operation.status === "SUCCEEDED"
  const label = operation.operation_type === "REGISTER_METADATA" ? "Metadata registration" : "Access validation"
  return (
    <div
      aria-live="polite"
      className={`rounded-xl border p-4 ${
        positive ? "border-emerald-200 bg-emerald-50" : pending ? "border-blue-200 bg-blue-50" : "border-amber-200 bg-amber-50"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          positive ? "bg-emerald-100 text-emerald-700" : pending ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-800"
        }`}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : positive ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
        </div>
        <div className="min-w-0">
          <p className="font-semibold">{label}: {operation.status.toLowerCase()}</p>
          <p className="mt-1 text-sm text-slate-600">
            {pending
              ? operation.status === "QUEUED" ? "The request is saved and waiting for the onboarding worker." : "The onboarding worker is processing this request."
              : positive ? operation.steps.at(-1)?.detail || "The operation completed successfully."
              : operationFailureText(operation)}
          </p>
          <p className="mt-2 truncate font-mono text-[10px] text-slate-500">{operation.operation_id}</p>
        </div>
      </div>
    </div>
  )
}

export function AddAccountDialog({ customerId, onClose, onCreated }: { customerId: string | null; onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [setupUnavailable, setSetupUnavailable] = useState(false)
  const [operation, setOperation] = useState<AccountOnboardingOperation | null>(null)
  const [metadataRegistered, setMetadataRegistered] = useState(false)
  const [accountId, setAccountId] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [environment, setEnvironment] = useState("PRODUCTION")
  const [regions, setRegions] = useState("eu-west-1")
  const abortRef = useRef<AbortController | null>(null)
  const intentIdentities = useRef(new Map<"REGISTER_METADATA" | "VALIDATE_ACCESS", SavedOnboardingIntentIdentity>())

  useEffect(() => () => abortRef.current?.abort(), [])

  async function run(operationType: "REGISTER_METADATA" | "VALIDATE_ACCESS") {
    if (!customerId) return
    const controller = new AbortController()
    abortRef.current?.abort()
    abortRef.current = controller
    setSubmitting(true)
    setError(null)
    setSetupUnavailable(false)
    setOperation(null)
    setStep(3)
    try {
      const command = operationType === "REGISTER_METADATA" ? {
        display_name: displayName,
        environment,
        regions: regions.split(",").map((value) => value.trim()).filter(Boolean),
        install_method: "STACKSET",
        collection_mode: "ORGANIZATION_TRAIL",
        read_enabled: false,
        verification_enabled: false,
        mutation_enabled: false,
      } : {}
      const signature = JSON.stringify({ customerId, accountId, operationType, command })
      const identity = reuseOnboardingIntentIdentity(intentIdentities.current.get(operationType), signature, operationType)
      intentIdentities.current.set(operationType, identity)
      const completed = await submitAndTrackOnboarding({
        customerId,
        accountId,
        operationType,
        command,
        requestId: identity.requestId,
        idempotencyKey: identity.idempotencyKey,
      }, setOperation, { signal: controller.signal })
      if (!isOnboardingPending(completed.status)) {
        intentIdentities.current.delete(operationType)
      }
      if (operationType === "REGISTER_METADATA" && completed.status === "SUCCEEDED") {
        setMetadataRegistered(true)
      }
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return
      if (reason instanceof AccountOnboardingRequestError && reason.operation) {
        setOperation(reason.operation)
        if (!isOnboardingPending(reason.operation.status)) {
          intentIdentities.current.delete(operationType)
        }
      }
      if (reason instanceof AccountOnboardingRequestError && reason.kind === "SETUP_UNAVAILABLE") {
        setSetupUnavailable(true)
      } else if (reason instanceof AccountOnboardingRequestError && reason.kind === "QUEUE_UNAVAILABLE") {
        setError("The request was recorded as failed because the onboarding queue is unavailable.")
      } else {
        setError(reason instanceof Error ? reason.message : String(reason))
      }
    } finally {
      if (!controller.signal.aborted) setSubmitting(false)
    }
  }

  const pending = submitting
  const registrationSucceeded = metadataRegistered && operation?.operation_type === "REGISTER_METADATA"
  const validationSucceeded = operation?.operation_type === "VALIDATE_ACCESS" && operation.status === "SUCCEEDED"

  function finish() {
    if (metadataRegistered) onCreated()
    else onClose()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-sm sm:p-6">
      <div role="dialog" aria-modal="true" aria-labelledby="add-account-title" className="max-h-[calc(100vh-1.5rem)] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl sm:max-h-[calc(100vh-3rem)]">
        <div className="flex items-start justify-between border-b border-slate-200 p-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-700">Account onboarding</p>
            <h2 id="add-account-title" className="mt-1 text-xl font-semibold">Add an AWS account</h2>
            <p className="mt-1 text-sm text-slate-500">Register metadata first, then verify access as a separate tracked operation.</p>
          </div>
          <button aria-label="Close account onboarding" onClick={finish} disabled={pending} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex border-b border-slate-200 px-6">
          {["Account", "Access", "Status"].map((label, index) => (
            <div key={label} className={`flex-1 border-b-2 py-3 text-center text-xs font-bold uppercase tracking-wider ${step === index + 1 ? "border-teal-600 text-teal-700" : "border-transparent text-slate-400"}`}>{index + 1}. {label}</div>
          ))}
        </div>
        <div className="min-h-80 p-4 sm:p-6">
          {step === 1 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Account name<input autoFocus value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Payments production" className="mt-2 w-full rounded-lg border border-slate-200 p-3 font-normal outline-none focus:border-teal-500" /></label>
              <label className="text-sm font-semibold text-slate-700">AWS account ID<input value={accountId} onChange={(event) => setAccountId(event.target.value.replace(/\D/g, "").slice(0, 12))} placeholder="123456789012" className="mt-2 w-full rounded-lg border border-slate-200 p-3 font-mono font-normal outline-none focus:border-teal-500" /></label>
              <label className="text-sm font-semibold text-slate-700">Environment<select value={environment} onChange={(event) => setEnvironment(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 bg-white p-3 font-normal outline-none focus:border-teal-500"><option>PRODUCTION</option><option>STAGING</option><option>DEVELOPMENT</option><option>SHARED_SERVICES</option></select></label>
              <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Regions<input value={regions} onChange={(event) => setRegions(event.target.value)} placeholder="eu-west-1, us-east-1" className="mt-2 w-full rounded-lg border border-slate-200 p-3 font-normal outline-none focus:border-teal-500" /></label>
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 sm:col-span-2"><strong>Safe default:</strong> registration saves metadata only. Read, verification, and mutation access remain disabled.</div>
            </div>
          ) : null}
          {step === 2 ? (
            <div className="space-y-5">
              <div>
                <h3 className="font-semibold">Review account access</h3>
                <p className="mt-1 text-sm text-slate-500">This request records account metadata. It cannot install AWS access or turn on a permission.</p>
              </div>
              <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-semibold">Automated StackSet installation is unavailable</p>
                <p className="mt-1 text-amber-800">Cyntro will not show the account as connected until installation exists and a separate access validation succeeds.</p>
              </div>
              <div className="mt-5 space-y-3">
                {[
                  ["Read access", "Disabled until verified AWS evidence supports it"],
                  ["Verification access", "Disabled until a validation operation succeeds"],
                  ["Mutation access", "Disabled; requires a later, separate approval"],
                ].map(([title, note]) => (
                  <div key={title} aria-disabled="true" className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-500"><KeyRound className="h-3.5 w-3.5" /></div><div><div className="flex items-center gap-2"><p className="text-sm font-semibold">{title}</p><span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">OFF</span></div><p className="mt-0.5 text-xs text-slate-500">{note}</p></div></div>
                ))}
              </div>
            </div>
          ) : null}
          {step === 3 ? (
            <div className="space-y-4">
              {setupUnavailable ? (
                <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
                  <p className="font-semibold">Account setup is unavailable</p>
                  <p className="mt-1 text-sm">The backend cannot store or run onboarding commands in this release. Nothing was marked successful.</p>
                </div>
              ) : null}
              {operation ? <OperationStatusCard operation={operation} /> : pending ? (
                <div aria-live="polite" className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800"><Loader2 className="h-4 w-4 animate-spin" /> Submitting the scoped onboarding request</div>
              ) : null}
              {registrationSucceeded ? (
                <div className="rounded-xl border border-slate-200 p-4">
                  <h3 className="font-semibold">Metadata is registered; access is still off</h3>
                  <p className="mt-1 text-sm text-slate-500">After the AWS-side installation is completed, start a separate validation. Validation may be blocked until the worker can verify the account.</p>
                </div>
              ) : null}
              {validationSucceeded ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">The scoped access validation succeeded. The account list will refresh when you return.</div>
              ) : null}
            </div>
          ) : null}
          {error ? <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button onClick={step === 1 ? onClose : step === 3 && metadataRegistered ? finish : () => setStep((value) => Math.max(1, value - 1))} disabled={pending} className="text-sm font-semibold text-slate-500 disabled:cursor-not-allowed disabled:opacity-40">{step === 1 ? "Cancel" : step === 3 && metadataRegistered ? "Return to accounts" : "Back"}</button>
          {step === 1 ? <button disabled={accountId.length !== 12 || !displayName} onClick={() => setStep(2)} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Review installation</button> : null}
          {step === 2 ? <button onClick={() => void run("REGISTER_METADATA")} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white">Register metadata</button> : null}
          {step === 3 && registrationSucceeded ? <button onClick={() => void run("VALIDATE_ACCESS")} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white"><ShieldCheck className="h-4 w-4" /> Validate access</button> : null}
          {step === 3 && !pending && !metadataRegistered && !registrationSucceeded ? <button onClick={() => setStep(2)} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Review and retry</button> : null}
        </div>
      </div>
    </div>
  )
}
