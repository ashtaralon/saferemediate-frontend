"use client"

import { useState } from "react"
import { Building2, Cloud, X } from "lucide-react"
import type { OperatorState } from "@/lib/account-onboarding"
import { OperatorSignInPanel } from "@/components/settings/operator-sign-in-panel"
import { OrganizationOnboarding } from "@/components/settings/organization-onboarding"
import { SingleAccountOnboarding } from "@/components/settings/single-account-onboarding"

export function AddAccountDialog({
  operator,
  operatorLoading,
  operatorError,
  onOperatorChanged,
  onClose,
  onChanged,
}: {
  operator: OperatorState | null
  operatorLoading: boolean
  operatorError: string | null
  onOperatorChanged: () => void
  onClose: () => void
  onChanged: () => void
}) {
  const [mode, setMode] = useState<"single" | "organization">("single")
  const verified = operator?.verified === "VERIFIED" ? operator.operator : null
  const canSubmit = Boolean(verified?.permissions.submit)

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-2 backdrop-blur-sm sm:p-6">
      <div role="dialog" aria-modal="true" aria-labelledby="add-account-title" className="max-h-[calc(100vh-1rem)] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl sm:max-h-[calc(100vh-3rem)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-4 sm:p-6">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-700">Account onboarding</p>
            <h2 id="add-account-title" className="mt-1 text-xl font-semibold">Add AWS accounts</h2>
            <p className="mt-1 text-sm text-slate-500">Your team installs a read-only role with an ExternalId; Cyntro verifies access before anything is marked connected.</p>
          </div>
          <button type="button" aria-label="Close account onboarding" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-5 p-4 sm:p-6">
          <OperatorSignInPanel state={operator} loading={operatorLoading} error={operatorError} onChanged={onOperatorChanged} />
          {verified ? (
            <>
              <div role="tablist" aria-label="Onboarding type" className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
                {([["single", "Single account", Cloud], ["organization", "AWS Organization", Building2]] as const).map(([value, label, Icon]) => (
                  <button key={value} type="button" role="tab" aria-selected={mode === value} onClick={() => setMode(value)} className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${mode === value ? "bg-white text-teal-800 shadow-sm" : "text-slate-600"}`}>
                    <Icon className="h-4 w-4" /> {label}
                  </button>
                ))}
              </div>
              {mode === "single"
                ? <SingleAccountOnboarding customerId={verified.tenant_id} canSubmit={canSubmit} onChanged={onChanged} />
                : <OrganizationOnboarding customerId={verified.tenant_id} canSubmit={canSubmit} onChanged={onChanged} />}
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
