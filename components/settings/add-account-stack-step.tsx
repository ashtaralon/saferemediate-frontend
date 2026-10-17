"use client"

/**
 * Add AWS account, stack first (Alon 2026-10-05: "add the ARN"): deploy this installation's connection stack in the account,
 * then paste the read role ARN its Outputs name (ReadRoleArn). The account ID is AWS's own, taken from that ARN, so a stack
 * deployed in another account than the one meant is seen before anything is added. Every value here is the backend's
 * (GET /api/admin/accounts/connect/instructions); the ARN rule is lib/account-admin.ts checkReadRoleArn, the backend's own.
 */
import { useEffect, useState } from "react"
import { Download, ExternalLink, Loader2 } from "lucide-react"
import { CopyButton } from "@/components/settings/connect-account-panel"
import {
  accountAdminFailure,
  proxiedTemplatePath,
  safeExternalUrl,
  type InstallationStackInstructions,
  type ReadRoleArnCheck,
} from "@/lib/account-admin"

type Load = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; instructions: InstallationStackInstructions }

export function useInstallationStack(customerId: string | null): Load {
  const [load, setLoad] = useState<Load>({ state: "loading" })
  useEffect(() => {
    if (!customerId) return
    let live = true
    void (async () => {
      try {
        const response = await fetch(`/api/proxy/admin/accounts/connect/instructions?customer_id=${encodeURIComponent(customerId)}`)
        if (!response.ok) throw await accountAdminFailure(response, "Connection stack")
        const instructions = (await response.json()) as InstallationStackInstructions
        if (live) setLoad({ state: "ready", instructions })
      } catch (reason) {
        if (live) setLoad({ state: "error", message: reason instanceof Error ? reason.message : String(reason) })
      }
    })()
    return () => { live = false }
  }, [customerId])
  return load
}

export function AddAccountStackStep({
  load,
  arn,
  onArn,
  arnCheck,
  mismatch,
}: {
  load: Load
  arn: string
  onArn: (value: string) => void
  arnCheck: ReadRoleArnCheck
  /** The account the form names, when the ARN is in another one (the stack was deployed there). */
  mismatch: { arnAccount: string; formAccount: string } | null
}) {
  const instructions = load.state === "ready" ? load.instructions : null
  const consoleUrl = safeExternalUrl(instructions?.console_url)
  const parameters = Object.entries(instructions?.parameters || {}).filter(([, value]) => value)
  return (
    <div data-testid="add-account-stack-step" className="col-span-2 space-y-3">
      <div className="rounded-lg border border-slate-200 p-3 text-xs text-slate-700">
        <p className="font-semibold text-slate-900">1. Deploy the connection stack in the account you are adding</p>
        {load.state === "loading" ? (
          <p className="mt-2 flex items-center gap-2 text-slate-500"><Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Reading this installation&apos;s stack…</p>
        ) : load.state === "error" ? (
          <p role="alert" className="mt-2 text-red-700">{load.message}</p>
        ) : instructions ? (
          <>
            <p className="mt-1">
              Sign in to that account and check the account ID at the top right of the AWS console before creating anything. Create
              stack <code className="rounded bg-slate-100 px-1 font-mono">{instructions.stack_name}</code> in {instructions.region}
              {" "}from this template with these values. It creates read-only roles; nothing in the account is changed.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <a href={proxiedTemplatePath(instructions.template_path)} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2 py-1 font-semibold text-slate-700 hover:bg-slate-50">
                <Download className="h-3 w-3" aria-hidden /> Download template
              </a>
              {consoleUrl ? (
                <a href={consoleUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2 py-1 font-semibold text-slate-700 hover:bg-slate-50">
                  Open CloudFormation in {instructions.region} <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              ) : null}
            </div>
            <dl data-testid="installation-stack-parameters" className="mt-2 space-y-1">
              {parameters.map(([name, value]) => (
                <div key={name} className="flex items-center gap-2">
                  <dt className="w-44 shrink-0 font-semibold text-slate-500">{name}</dt>
                  <dd className="min-w-0 flex-1 truncate font-mono">{value}</dd>
                  <CopyButton value={value} label={`Copy ${name}`} />
                </div>
              ))}
            </dl>
          </>
        ) : null}
      </div>
      <div>
        <label className="text-sm font-semibold text-slate-700">
          2. Read role ARN <span className="font-normal text-slate-500">(the stack&apos;s {instructions?.read_role_output ?? "ReadRoleArn"} output)</span>
          <input
            value={arn}
            onChange={(event) => onArn(event.target.value)}
            placeholder={`arn:aws:iam::123456789012:role/${instructions?.read_role_name ?? "CyntroRead-…"}`}
            aria-invalid={arnCheck.state === "INVALID" || mismatch !== null}
            aria-describedby="add-account-arn-check"
            className="mt-2 w-full rounded-lg border border-slate-200 p-3 font-mono text-xs font-normal outline-none focus:border-teal-500"
          />
        </label>
        <p id="add-account-arn-check" data-testid="read-role-arn-check" aria-live="polite"
          className={`mt-1.5 text-xs ${arnCheck.state === "INVALID" || mismatch ? "font-semibold text-red-700" : "text-slate-600"}`}>
          {arnCheck.state === "INVALID" ? arnCheck.problem
            : mismatch ? `This read role is in account ${mismatch.arnAccount}, not ${mismatch.formAccount}: the stack was deployed in ${mismatch.arnAccount}. Add ${mismatch.arnAccount}, or deploy the stack in ${mismatch.formAccount}.`
            : arnCheck.state === "VALID" ? `Account ${arnCheck.accountId}, from the ARN.`
            : "Paste it from the stack's Outputs once the stack is created."}
        </p>
      </div>
    </div>
  )
}
