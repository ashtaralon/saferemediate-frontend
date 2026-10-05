"use client"

/**
 * Settings > Accounts > Add > Choose from your organization: setting the organization listing role up from here (Alon
 * 2026-10-05: "how should it work without authenticating with proper permissions at the org level?").
 *
 * Every value is the backend's own setup answer (GET /api/admin/accounts/organization -> setup, verified operators only):
 * the template, its three parameters, the role's exact name and the output to copy. The pasted ARN is a proposal: the
 * backend accepts only that exact role name, and its connector uses the role only after assuming it with this
 * installation's ExternalId and seeing it answer for this installation's own organization. When the installer names the
 * role, Settings cannot replace it, and says so.
 */
import { useState } from "react"
import { Download, Loader2 } from "lucide-react"
import { CopyButton } from "@/components/settings/connect-account-panel"
import {
  ORGANIZATION_DISCOVERY_TEMPLATE_PATH,
  checkDiscoveryRoleArn,
  type OrganizationDiscoverySetup,
} from "@/lib/account-admin"

export function OrganizationRoleSetup({
  setup,
  asking,
  onVerify,
  installerRoleArn,
}: {
  setup: OrganizationDiscoverySetup
  asking: boolean
  /** Ask the connector to list the organization through this role (POST discover with {role_arn}). */
  onVerify: (roleArn: string) => void
  /** The role the installer named, when the backend says so (setup.role.set_by): then nothing here can replace it. */
  installerRoleArn?: string | null
}) {
  const [arn, setArn] = useState("")
  const role = setup.role
  const parameters = Object.entries(setup.parameters || {}).filter(([, value]) => value)

  if (role?.set_by === "installation") {
    return (
      <div data-testid="organization-setup" className="space-y-2 rounded-lg border border-slate-200 p-3 text-xs text-slate-700">
        <p className="font-semibold text-slate-900">This installation&apos;s installer names the organization listing role</p>
        <p>
          {installerRoleArn ? <>Cyntro uses <span className="break-all font-mono">{installerRoleArn}</span>. </> : null}
          A role pasted here would not be used. Check that the role&apos;s stack was created with the values below, or change
          ORG_DISCOVERY_ROLE_ARN in install.env and run the installer again.
        </p>
        <SetupParameters parameters={parameters} />
      </div>
    )
  }

  const roleName = role?.name ?? ""
  const check = roleName ? checkDiscoveryRoleArn(arn, roleName) : { state: "EMPTY" as const }
  return (
    <div data-testid="organization-setup" className="space-y-3 rounded-lg border border-slate-200 p-3 text-xs text-slate-700">
      <div>
        <p className="font-semibold text-slate-900">1. Create the organization listing role</p>
        <p className="mt-1">
          Sign in to your organization&apos;s management account, or an account delegated to read AWS Organizations. Create a
          CloudFormation stack from this template with these values. The role it creates can only describe the organization and
          list its accounts, and only this installation can use it.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <a href={ORGANIZATION_DISCOVERY_TEMPLATE_PATH} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2 py-1 font-semibold text-slate-700 hover:bg-slate-50">
            <Download className="h-3 w-3" aria-hidden /> Download template
          </a>
        </div>
        <SetupParameters parameters={parameters} />
      </div>
      {roleName ? (
        <div>
          <label className="text-sm font-semibold text-slate-700">
            2. Organization listing role ARN <span className="font-normal text-slate-500">(the stack&apos;s {role?.output ?? "OrgDiscoveryRoleArn"} output)</span>
            <input
              value={arn}
              onChange={(event) => setArn(event.target.value)}
              placeholder={`arn:aws:iam::123456789012:role/${roleName}`}
              aria-invalid={check.state === "INVALID"}
              aria-describedby="organization-role-arn-check"
              className="mt-2 w-full rounded-lg border border-slate-200 p-3 font-mono text-xs font-normal outline-none focus:border-teal-500"
            />
          </label>
          <p id="organization-role-arn-check" data-testid="organization-role-arn-check" aria-live="polite"
            className={`mt-1.5 text-xs ${check.state === "INVALID" ? "font-semibold text-red-700" : "text-slate-600"}`}>
            {check.state === "INVALID" ? check.problem
              : check.state === "VALID" ? `Role in account ${check.accountId}. Cyntro checks it answers for this installation's organization before listing.`
              : "Paste it from the stack's Outputs once the stack is created."}
          </p>
          <div className="mt-2 flex items-center gap-4">
            <button
              type="button"
              onClick={() => check.state === "VALID" && onVerify(check.arn)}
              disabled={asking || check.state !== "VALID"}
              className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {asking ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Verify and list accounts
            </button>
          </div>
        </div>
      ) : (
        // An older backend sends no role name: the ARN cannot be checked here, so it is not asked for.
        <p>Then set the stack&apos;s OrgDiscoveryRoleArn output as this installation&apos;s organization listing role.</p>
      )}
    </div>
  )
}

function SetupParameters({ parameters }: { parameters: [string, string][] }) {
  return (
    <dl data-testid="organization-setup-parameters" className="mt-2 space-y-1">
      {parameters.map(([name, value]) => (
        <div key={name} className="flex items-center gap-2">
          <dt className="w-44 shrink-0 font-semibold text-slate-500">{name}</dt>
          <dd className="min-w-0 flex-1 truncate font-mono">{value}</dd>
          <CopyButton value={value} label={`Copy ${name}`} />
        </div>
      ))}
    </dl>
  )
}
