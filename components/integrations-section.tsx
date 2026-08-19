"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { CheckCircle2, GitBranch, Loader2, Plug } from "lucide-react"
import { TerraformExecutionChip } from "./terraform-execution-chip"

type Binding = {
  binding_id: string
  tenant_id?: string
  repository: string
  workspace: string
  account_id: string
  cloud_ref?: string
  role_arn?: string
  resource_address: string
  state_serial: number
  base_commit: string
  execution_adapter: string
}

type AcceptedResource = {
  address: string
  arn?: string
  id?: string
}

type Step = 1 | 2 | 3 | 4 | 5

const STEPS: { id: Step; label: string }[] = [
  { id: 1, label: "Repository" },
  { id: 2, label: "Workspace" },
  { id: 3, label: "Inspect" },
  { id: 4, label: "Register" },
  { id: 5, label: "Status" },
]

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
        {label}
      </span>
      {children}
      {hint ? (
        <span className="block text-[11px]" style={{ color: "var(--text-muted)" }}>
          {hint}
        </span>
      ) : null}
    </label>
  )
}

const inputStyle = {
  background: "var(--bg-primary)",
  borderColor: "var(--border-subtle)",
  color: "var(--text-primary)",
} as const

export function IntegrationsSection({ systemName }: { systemName?: string | null }) {
  const [step, setStep] = useState<Step>(1)
  const [bindings, setBindings] = useState<Binding[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [repository, setRepository] = useState("")
  const [workspace, setWorkspace] = useState("")
  const [stateBackend, setStateBackend] = useState<"s3" | "terraform_cloud" | "remote">("s3")
  const [resourceAddress, setResourceAddress] = useState("")
  const [declaredJson, setDeclaredJson] = useState("")
  const [accepted, setAccepted] = useState<AcceptedResource[]>([])
  const [accountId, setAccountId] = useState("")
  const [roleArn, setRoleArn] = useState("")
  const [stateSerial, setStateSerial] = useState("")
  const [baseCommit, setBaseCommit] = useState("")
  const [registered, setRegistered] = useState<Binding | null>(null)

  const scopedSystem = (systemName || "").trim()

  const loadBindings = async () => {
    if (!scopedSystem) {
      setBindings([])
      return
    }
    setLoadError(null)
    try {
      const res = await fetch(
        `/api/proxy/change-executions/ownership/terraform?tenant_id=${encodeURIComponent(scopedSystem)}`,
        { cache: "no-store" },
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setLoadError(data.detail || data.error || `Backend returned ${res.status}`)
        setBindings([])
        return
      }
      setBindings(Array.isArray(data.bindings) ? data.bindings : [])
    } catch (err: any) {
      setLoadError(err?.message || "Failed to load Terraform bindings")
      setBindings([])
    }
  }

  useEffect(() => {
    void loadBindings()
  }, [scopedSystem])

  const backendLabel = useMemo(() => {
    if (stateBackend === "s3") return "S3 backend"
    if (stateBackend === "terraform_cloud") return "Terraform Cloud"
    return "Remote backend"
  }, [stateBackend])

  const detailFrom = (data: any, fallback: string) => {
    if (typeof data?.detail === "string") return data.detail
    if (typeof data?.error === "string") return data.error
    return fallback
  }

  const inspect = async () => {
    setBusy(true)
    setFormError(null)
    try {
      let declared: unknown[] = []
      const raw = declaredJson.trim()
      if (raw) {
        const parsed = JSON.parse(raw)
        declared = Array.isArray(parsed) ? parsed : [parsed]
      }
      const res = await fetch("/api/proxy/change-executions/ownership/terraform/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource_address: resourceAddress.trim() || undefined,
          declared_resources: declared,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFormError(detailFrom(data, "Inspect rejected this payload"))
        return
      }
      const nextAccepted: AcceptedResource[] = Array.isArray(data.accepted) ? data.accepted : []
      setAccepted(nextAccepted)
      if (data.resource_address) {
        setResourceAddress(data.resource_address)
      } else if (nextAccepted[0]?.address) {
        setResourceAddress(nextAccepted[0].address)
      }
      if (nextAccepted[0]?.arn && !roleArn) {
        setRoleArn(nextAccepted[0].arn)
      }
      setStep(4)
    } catch (err: any) {
      setFormError(err?.message || "Inspect failed. Use identity-only JSON, not a state file.")
    } finally {
      setBusy(false)
    }
  }

  const register = async () => {
    if (!scopedSystem) {
      setFormError("Select a system first. Ownership is scoped to the current system.")
      return
    }
    setBusy(true)
    setFormError(null)
    try {
      const res = await fetch("/api/proxy/change-executions/ownership/terraform/register-ui", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: scopedSystem,
          repository: repository.trim(),
          workspace: workspace.trim(),
          account_id: accountId.trim(),
          cloud_ref: roleArn.trim(),
          resource_address: resourceAddress.trim(),
          state_serial: Number(stateSerial),
          base_commit: baseCommit.trim(),
          policy_attribute: "policy",
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFormError(detailFrom(data, "Registration failed"))
        return
      }
      setRegistered(data.binding || data)
      setStep(5)
      await loadBindings()
    } catch (err: any) {
      setFormError(err?.message || "Registration failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div
        className="rounded-xl p-6 border"
        style={{
          background: "var(--bg-secondary)",
          borderColor: "var(--border-subtle)",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
        }}
      >
        <div className="flex items-start justify-between gap-4 mb-2">
          <div className="flex items-center gap-3">
            <Plug className="w-6 h-6" style={{ color: "#3b82f6" }} />
            <div>
              <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                Settings → Integrations → Terraform
              </h2>
              <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                Register customer-pipeline ownership for an exact `aws_iam_role_policy`.
                Cyntro does not store Terraform credentials, tokens, or state files.
              </p>
            </div>
          </div>
        </div>
        <p className="text-xs mb-6" style={{ color: "var(--text-muted)" }}>
          System scope: {scopedSystem || "none selected"} · This slice does not run Terraform apply.
        </p>

        <ol className="grid grid-cols-5 gap-2 mb-6">
          {STEPS.map((item) => {
            const active = step === item.id
            const done = step > item.id
            return (
              <li
                key={item.id}
                className="rounded-lg px-2 py-2 text-center text-[11px] font-medium border"
                style={{
                  borderColor: active || done ? "#3b82f680" : "var(--border-subtle)",
                  color: active || done ? "#93c5fd" : "var(--text-muted)",
                  background: active ? "#3b82f618" : "transparent",
                }}
              >
                {item.id}. {item.label}
              </li>
            )
          })}
        </ol>

        {formError ? (
          <div
            className="mb-4 rounded-lg px-3 py-2 text-xs border"
            style={{ color: "#fca5a5", borderColor: "#ef444450", background: "#ef444415" }}
          >
            {formError}
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-4 max-w-xl">
            <Field
              label="GitHub repository URL"
              hint="Paste the HTTPS repo URL. This slice registers the URL only — it does not OAuth to GitHub or clone the repo."
            >
              <input
                value={repository}
                onChange={(e) => setRepository(e.target.value)}
                placeholder="https://github.com/org/repo"
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={inputStyle}
              />
            </Field>
            <button
              type="button"
              disabled={!repository.trim()}
              onClick={() => {
                setFormError(null)
                setStep(2)
              }}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40"
              style={{ background: "#3b82f6" }}
            >
              Continue
            </button>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4 max-w-xl">
            <Field label="Terraform workspace" hint="The workspace whose state owns this IAM policy.">
              <input
                value={workspace}
                onChange={(e) => setWorkspace(e.target.value)}
                placeholder="prod"
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={inputStyle}
              />
            </Field>
            <Field
              label="State backend"
              hint={`${backendLabel}. Cyntro does not ask for backend credentials and will not fetch state itself.`}
            >
              <select
                value={stateBackend}
                onChange={(e) => setStateBackend(e.target.value as typeof stateBackend)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={inputStyle}
              >
                <option value="s3">S3</option>
                <option value="terraform_cloud">Terraform Cloud</option>
                <option value="remote">Remote</option>
              </select>
            </Field>
            <div className="flex gap-2">
              <button type="button" onClick={() => setStep(1)} className="px-4 py-2 rounded-lg text-sm border" style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}>
                Back
              </button>
              <button
                type="button"
                disabled={!workspace.trim()}
                onClick={() => {
                  setFormError(null)
                  setStep(3)
                }}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40"
                style={{ background: "#3b82f6" }}
              >
                Continue
              </button>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4 max-w-2xl">
            <Field
              label="Terraform resource address"
              hint="Managed aws_iam_role_policy only. Data sources and aws_iam_role are rejected."
            >
              <input
                value={resourceAddress}
                onChange={(e) => setResourceAddress(e.target.value)}
                placeholder='module.app.aws_iam_role_policy.app'
                className="w-full rounded-lg border px-3 py-2 text-sm font-mono"
                style={inputStyle}
              />
            </Field>
            <Field
              label="Declared resources (optional, identity only)"
              hint='JSON array of { "address", "arn", "id" }. Do not paste terraform.tfstate, attributes, tokens, or keys.'
            >
              <textarea
                value={declaredJson}
                onChange={(e) => setDeclaredJson(e.target.value)}
                rows={6}
                placeholder='[{"address":"module.app.aws_iam_role_policy.app","arn":"arn:aws:iam::416651950952:role/app","id":"app"}]'
                className="w-full rounded-lg border px-3 py-2 text-xs font-mono"
                style={inputStyle}
              />
            </Field>
            <div className="flex gap-2">
              <button type="button" onClick={() => setStep(2)} className="px-4 py-2 rounded-lg text-sm border" style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}>
                Back
              </button>
              <button
                type="button"
                disabled={busy || (!resourceAddress.trim() && !declaredJson.trim())}
                onClick={() => void inspect()}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40 inline-flex items-center gap-2"
                style={{ background: "#3b82f6" }}
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitBranch className="w-4 h-4" />}
                Inspect without storing secrets
              </button>
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-4 max-w-xl">
            {accepted.length > 0 ? (
              <div className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}>
                Accepted addresses: {accepted.map((row) => row.address).join(", ")}
              </div>
            ) : null}
            <Field label="AWS account ID">
              <input value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="416651950952" className="w-full rounded-lg border px-3 py-2 text-sm font-mono" style={inputStyle} />
            </Field>
            <Field label="IAM role ARN">
              <input value={roleArn} onChange={(e) => setRoleArn(e.target.value)} placeholder="arn:aws:iam::416651950952:role/app" className="w-full rounded-lg border px-3 py-2 text-sm font-mono" style={inputStyle} />
            </Field>
            <Field label="Confirmed resource address">
              <input value={resourceAddress} onChange={(e) => setResourceAddress(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm font-mono" style={inputStyle} />
            </Field>
            <Field label="State serial" hint="Integer from terraform state metadata, not the file itself.">
              <input value={stateSerial} onChange={(e) => setStateSerial(e.target.value)} placeholder="42" className="w-full rounded-lg border px-3 py-2 text-sm font-mono" style={inputStyle} />
            </Field>
            <Field label="Git base commit">
              <input value={baseCommit} onChange={(e) => setBaseCommit(e.target.value)} placeholder="abc1234" className="w-full rounded-lg border px-3 py-2 text-sm font-mono" style={inputStyle} />
            </Field>
            <div className="flex gap-2">
              <button type="button" onClick={() => setStep(3)} className="px-4 py-2 rounded-lg text-sm border" style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}>
                Back
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void register()}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40 inline-flex items-center gap-2"
                style={{ background: "#3b82f6" }}
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Register customer_pipeline
              </button>
            </div>
          </div>
        ) : null}

        {step === 5 ? (
          <div className="space-y-3 max-w-xl">
            <div className="flex items-center gap-2 text-sm" style={{ color: "#10b981" }}>
              <CheckCircle2 className="w-4 h-4" />
              Ownership registered. Permissions now show customer_pipeline for this role.
            </div>
            {registered ? (
              <dl className="grid grid-cols-2 gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                <dt>Adapter</dt><dd><TerraformExecutionChip adapter={registered.execution_adapter} /></dd>
                <dt>Address</dt><dd className="font-mono">{registered.resource_address}</dd>
                <dt>Repository</dt><dd className="font-mono break-all">{registered.repository}</dd>
                <dt>Workspace</dt><dd className="font-mono">{registered.workspace}</dd>
                <dt>Role</dt><dd className="font-mono break-all">{registered.role_arn || registered.cloud_ref}</dd>
                <dt>Serial / commit</dt><dd className="font-mono">{registered.state_serial} / {registered.base_commit}</dd>
              </dl>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setRegistered(null)
                setAccepted([])
                setStep(1)
              }}
              className="px-4 py-2 rounded-lg text-sm border"
              style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}
            >
              Register another
            </button>
          </div>
        ) : null}
      </div>

      <div
        className="rounded-xl p-6 border"
        style={{
          background: "var(--bg-secondary)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
          Registered bindings
        </h3>
        {loadError ? (
          <p className="text-xs" style={{ color: "#fca5a5" }}>{loadError}</p>
        ) : !scopedSystem ? (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Select a system to list Terraform ownership bindings.
          </p>
        ) : bindings.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            No Terraform bindings for {scopedSystem}. Permissions stay unregistered until you complete the wizard.
          </p>
        ) : (
          <div className="space-y-2">
            {bindings.map((binding) => (
              <div
                key={binding.binding_id}
                className="rounded-lg border px-3 py-2 text-xs flex items-start justify-between gap-3"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                <div className="min-w-0" style={{ color: "var(--text-secondary)" }}>
                  <div className="font-mono truncate" style={{ color: "var(--text-primary)" }}>
                    {binding.resource_address}
                  </div>
                  <div className="truncate">{binding.role_arn || binding.cloud_ref}</div>
                  <div className="truncate">{binding.repository} · {binding.workspace}</div>
                </div>
                <TerraformExecutionChip adapter={binding.execution_adapter} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
