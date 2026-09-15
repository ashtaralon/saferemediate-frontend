"use client"

import { useState } from "react"
import { Check, Copy, EyeOff, FileCode2 } from "lucide-react"
import type { Binding, InstallationPlan } from "@/lib/account-onboarding"

/**
 * A generated ExternalId, shown exactly once. It lives only in this component's
 * memory: never logged, never written to storage, never put in a URL, and
 * discarded when the operator confirms it is stored.
 */
export function ExternalIdOnce({ label, value, onStored }: { label: string; value: string; onStored: () => void }) {
  const [copied, setCopied] = useState(false)
  return (
    <div data-testid="external-id-once" className="rounded-xl border border-amber-300 bg-amber-50 p-4">
      <p className="text-xs font-bold uppercase tracking-wider text-amber-900">{label}: shown once</p>
      <p className="mt-1 text-xs text-amber-900">Store it where you run the installation. Cyntro keeps only an encrypted copy and cannot show it again; generating a new one invalidates this value.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code data-testid="external-id-value" className="min-w-0 flex-1 break-all rounded-lg border border-amber-200 bg-white px-3 py-2 font-mono text-xs text-slate-800">{value}</code>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(value).then(() => setCopied(true), () => setCopied(false))
          }}
          className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <button type="button" onClick={onStored} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-amber-900 underline">
        <EyeOff className="h-3 w-3" /> I stored it, hide it
      </button>
    </div>
  )
}

export function BindingSummary({ binding, title }: { binding: Binding | null; title: string }) {
  if (!binding) return <p className="text-xs text-slate-500">{title}: not created yet.</p>
  return (
    <p data-testid={`binding-${binding.purpose}`} data-binding-status={binding.status} className="text-xs text-slate-600">
      <span className="font-semibold">{title}</span> · version {binding.binding_version} · {binding.status.replaceAll("_", " ").toLowerCase()}
      {binding.role_configured ? " · role attached" : " · role not attached"}
      {binding.last_validation_code ? ` · last check ${binding.last_validation_code}` : ""}
    </p>
  )
}

export function InstallationPlanView({ plan }: { plan: InstallationPlan }) {
  return (
    <div data-testid="installation-plan" className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500"><FileCode2 className="h-3.5 w-3.5" /> Installation plan · run by your team</p>
      {plan.templates.map((template) => (
        <p key={template.template_id} className="mt-2 text-xs text-slate-600">
          <span className="font-semibold">{template.template_id}</span> v{template.template_version} · <span className="font-mono">{template.path}</span> · sha256 <span className="font-mono">{template.sha256.slice(0, 12)}…</span>
        </p>
      ))}
      <ol className="mt-3 space-y-3">
        {plan.steps.map((step) => (
          <li key={step.step_id} className="text-xs">
            <p className="font-semibold text-slate-700">{step.title}</p>
            {step.commands.map((command) => (
              <pre key={command} className="mt-1 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-slate-900 p-3 font-mono text-[11px] text-slate-100">{command}</pre>
            ))}
            {step.verification ? <p className="mt-1 text-slate-500">{step.verification}</p> : null}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[11px] text-slate-500">Placeholders such as <span className="font-mono">&lt;EXTERNAL_ID_FROM_…&gt;</span> are filled with the ExternalId shown once above. Cyntro never runs these commands.</p>
    </div>
  )
}
