"use client"

/**
 * Declare a System from roots picked in the account inventory (Phase 2 T17): the System (new, with one of the server's
 * criticality tiers or none; or an existing one, whose criticality is shown and kept), its Deployment (new, with its
 * environment and the customer's own word for it, covering exactly the picked roots' account/Region cells; or an
 * existing one of that System), a review of exactly what will be sent, and the save.
 *
 * One reviewed declaration is ONE envelope (one request id): an unconfirmed save is resent unchanged, never re-minted,
 * and editing after a refusal makes a new request. A save is Saved -- Cyntro then prepares membership -- never Applied.
 */
import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  newCreateEnvelope,
  saveDeclaration,
  type CreateDeclaration,
  type CreateEnvelope,
  type DeclarationsView,
  type SaveResult,
} from "@/lib/system-boundary-authoring"
import {
  buildDeclaration,
  cellsOf,
  deploymentsOf,
  describeResult,
  reusableSystems,
  type DraftDeclaration,
  type PickedRoot,
  type SaveOutcome,
} from "@/lib/system-boundary-declaration"

export interface DeclarationFormProps {
  view: DeclarationsView
  roots: PickedRoot[]
  onCancel: () => void
  /** A save was confirmed (committed now, or the replay of this request). */
  onSaved: (revision: number) => void
  /** Injectable for tests; defaults to the console's authoring proxy. */
  save?: (envelope: CreateEnvelope) => Promise<SaveResult>
  /** Called with the envelope before it is first sent (durable submission identity: T18). */
  onEnvelope?: (envelope: CreateEnvelope) => void
  /** Called with every answer to that envelope (a resend included). */
  onOutcome?: (envelope: CreateEnvelope, outcome: SaveOutcome) => void
}

type Step = { kind: "edit"; problems: string[] } | { kind: "review"; declaration: CreateDeclaration } | { kind: "sent" }

function recordLabel(body: Record<string, unknown>, field: string): string {
  return typeof body[field] === "string" ? (body[field] as string) : "(unnamed)"
}

export function DeclarationForm({ view, roots, onCancel, onSaved, save = saveDeclaration, onEnvelope, onOutcome }: DeclarationFormProps) {
  const systems = useMemo(() => reusableSystems(view), [view])
  const [systemMode, setSystemMode] = useState<"new" | "existing">("new")
  const [displayName, setDisplayName] = useState("")
  const [criticality, setCriticality] = useState("")
  const [systemKey, setSystemKey] = useState(systems[0]?.key ?? "")
  const [deploymentMode, setDeploymentMode] = useState<"new" | "existing">("new")
  const [deploymentKey, setDeploymentKey] = useState("")
  const [environment, setEnvironment] = useState("")
  const [environmentRaw, setEnvironmentRaw] = useState("")
  const [existingDeployment, setExistingDeployment] = useState("")
  const [step, setStep] = useState<Step>({ kind: "edit", problems: [] })
  const [envelope, setEnvelope] = useState<CreateEnvelope | null>(null)
  const [outcome, setOutcome] = useState<SaveOutcome | null>(null)
  const [sending, setSending] = useState(false)

  const deployments = systemMode === "existing" ? deploymentsOf(view, systemKey) : []
  const chosenSystem = systems.find((s) => s.key === systemKey)
  const cells = cellsOf(roots.map((picked) => picked.root))

  const draft = (): DraftDeclaration => ({
    roots,
    system: systemMode === "new" ? { mode: "new", displayName, criticality: criticality || null } : { mode: "existing", systemKey },
    deployment: deploymentMode === "new" || systemMode === "new"
      ? { mode: "new", deploymentKey, environment, environmentRaw }
      : { mode: "existing", deploymentKey: existingDeployment },
  })

  const review = () => {
    if (view.completed_revision === null) {
      setStep({ kind: "edit", problems: ["Saving declarations is not available on this installation yet."] })
      return
    }
    const built = buildDeclaration(draft(), view)
    setStep(built.ok ? { kind: "review", declaration: built.declaration } : { kind: "edit", problems: built.problems })
  }

  const send = async (target: CreateEnvelope) => {
    setSending(true)
    const result = await save(target)
    setSending(false)
    const described = describeResult(result)
    setOutcome(described)
    onOutcome?.(target, described)
    if (described.kind === "saved") onSaved(described.revision)
  }

  const saveReviewed = async () => {
    if (step.kind !== "review" || view.completed_revision === null) return
    // ONE envelope per reviewed declaration: minted here once, handed over before its first send, never re-minted.
    const minted = newCreateEnvelope(view.completed_revision, step.declaration)
    setEnvelope(minted)
    onEnvelope?.(minted)
    setStep({ kind: "sent" })
    await send(minted)
  }

  const backToEdit = () => {
    setEnvelope(null)
    setOutcome(null)
    setStep({ kind: "edit", problems: [] })
  }

  return (
    <section aria-label="Declare a system" className="space-y-4 rounded-md border border-slate-200 bg-white p-4">
      <header>
        <h2 className="text-base font-semibold text-slate-900">Declare a system</h2>
        {step.kind === "edit" ? (
          <p className="text-xs text-slate-600">
            {roots.length} picked {roots.length === 1 ? "resource" : "resources"} become the system&apos;s roots. Cyntro derives
            the rest of its membership from them after the save.
          </p>
        ) : null}
      </header>

      {step.kind === "edit" ? (
        <div className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-slate-800">System</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="system-mode" checked={systemMode === "new"} onChange={() => setSystemMode("new")} />
              New system
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="system-mode" checked={systemMode === "existing"} disabled={systems.length === 0}
                onChange={() => { setSystemMode("existing"); setDeploymentMode("new") }} />
              Existing system{systems.length === 0 ? " (none yet)" : ""}
            </label>
            {systemMode === "new" ? (
              <div className="space-y-2 pl-6">
                <label className="block text-sm">
                  Name
                  <input aria-label="System name" className="mt-1 block w-full rounded border px-2 py-1 text-sm" value={displayName}
                    maxLength={view.limits.max_display_name} onChange={(e) => setDisplayName(e.target.value)} />
                </label>
                <label className="block text-sm">
                  Criticality
                  <select aria-label="Criticality" className="mt-1 block rounded border px-2 py-1 text-sm" value={criticality}
                    onChange={(e) => setCriticality(e.target.value)}>
                    <option value="">Not set</option>
                    {view.limits.criticalities.map((tier) => <option key={tier} value={tier}>{tier}</option>)}
                  </select>
                </label>
                <p className="text-xs text-slate-500">Creating a system needs tenant-wide access.</p>
              </div>
            ) : (
              <div className="space-y-2 pl-6">
                <label className="block text-sm">
                  System
                  <select aria-label="Existing system" className="mt-1 block rounded border px-2 py-1 text-sm" value={systemKey}
                    onChange={(e) => { setSystemKey(e.target.value); setExistingDeployment("") }}>
                    {systems.map((s) => <option key={s.key} value={s.key}>{recordLabel(s.body, "display_name")}</option>)}
                  </select>
                </label>
                <p className="text-xs text-slate-600" data-testid="existing-criticality">
                  Criticality: {chosenSystem && typeof chosenSystem.body.criticality === "string" ? chosenSystem.body.criticality : "Not set"} (kept;
                  changing it is a separate, tenant-wide correction)
                </p>
              </div>
            )}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-slate-800">Deployment</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="deployment-mode" checked={deploymentMode === "new" || systemMode === "new"}
                onChange={() => setDeploymentMode("new")} />
              New deployment
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="deployment-mode" checked={deploymentMode === "existing" && systemMode === "existing"}
                disabled={systemMode === "new" || deployments.length === 0}
                onChange={() => { setDeploymentMode("existing"); setExistingDeployment(deployments[0]?.key ?? "") }} />
              Existing deployment of this system{systemMode === "existing" && deployments.length === 0 ? " (none yet)" : ""}
            </label>
            {deploymentMode === "new" || systemMode === "new" ? (
              <div className="space-y-2 pl-6">
                <label className="block text-sm">
                  Deployment key
                  <input aria-label="Deployment key" className="mt-1 block w-full rounded border px-2 py-1 text-sm" value={deploymentKey}
                    placeholder="e.g. prod-eu" onChange={(e) => setDeploymentKey(e.target.value)} />
                </label>
                <label className="block text-sm">
                  Environment
                  <select aria-label="Environment" className="mt-1 block rounded border px-2 py-1 text-sm" value={environment}
                    onChange={(e) => setEnvironment(e.target.value)}>
                    <option value="">Choose…</option>
                    {view.limits.environments.map((env) => <option key={env} value={env}>{env}</option>)}
                  </select>
                </label>
                <label className="block text-sm">
                  Your own word for it (optional)
                  <input aria-label="Your own environment word" className="mt-1 block w-full rounded border px-2 py-1 text-sm"
                    value={environmentRaw} maxLength={view.limits.max_environment_raw} placeholder="e.g. prd"
                    onChange={(e) => setEnvironmentRaw(e.target.value)} />
                </label>
                <p className="text-xs text-slate-600" data-testid="deployment-cells">
                  Covers: {cells.map((c) => `${c.account_id} / ${c.region}`).join(", ") || "no cells"}
                </p>
              </div>
            ) : (
              <div className="space-y-2 pl-6">
                <select aria-label="Existing deployment" className="block rounded border px-2 py-1 text-sm" value={existingDeployment}
                  onChange={(e) => setExistingDeployment(e.target.value)}>
                  {deployments.map((d) => (
                    <option key={d.key} value={d.key}>
                      {recordLabel(d.body, "deployment_key")} ({recordLabel(d.body, "environment")})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </fieldset>

          {step.problems.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-red-700" role="alert">
              {step.problems.map((problem) => <li key={problem}>{problem}</li>)}
            </ul>
          ) : null}
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={review}>Review</Button>
            <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
          </div>
        </div>
      ) : null}

      {step.kind === "review" ? (
        <div className="space-y-3" data-testid="declaration-review">
          <h3 className="text-sm font-semibold text-slate-800">Review</h3>
          <dl className="grid grid-cols-[10rem_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-slate-500">System</dt>
            <dd>
              {step.declaration.system.mode === "new"
                ? `${step.declaration.system.display_name} (new; criticality ${step.declaration.system.criticality ?? "not set"})`
                : `${recordLabel(chosenSystem?.body ?? {}, "display_name")} (existing, version ${step.declaration.system.expected_version})`}
            </dd>
            <dt className="text-slate-500">Deployment</dt>
            <dd>
              {step.declaration.deployment.mode === "new"
                ? `${step.declaration.deployment.deployment_key} (new; ${step.declaration.deployment.environment}` +
                  `${step.declaration.deployment.environment_raw ? `, "${step.declaration.deployment.environment_raw}"` : ""}; ` +
                  `${step.declaration.deployment.scopes.map((c) => `${c.account_id} / ${c.region}`).join(", ")})`
                : `existing, version ${step.declaration.deployment.expected_version}`}
            </dd>
          </dl>
          <table className="w-full text-xs">
            <thead><tr className="text-left text-slate-500"><th>Root</th><th>Type</th><th>Account / Region</th><th>Identity</th></tr></thead>
            <tbody>
              {step.declaration.roots.map((root) => (
                <tr key={`${root.selection.resource_type}|${root.resource_uid}`}>
                  <td className="font-mono">{roots.find((p) => p.root.resource_uid === root.resource_uid && p.root.selection.resource_type
                    === root.selection.resource_type)?.label ?? root.resource_uid}</td>
                  <td>{root.selection.resource_type}</td>
                  <td>{root.account_id} / {root.region}</td>
                  <td>{root.selection.observed_incarnation.status === "provided" ? "verified" : "not provided"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={() => void saveReviewed()}>Save</Button>
            <Button type="button" size="sm" variant="ghost" onClick={backToEdit}>Back</Button>
          </div>
        </div>
      ) : null}

      {step.kind === "sent" ? (
        <div className="space-y-3" role="status" data-testid="declaration-outcome">
          {sending ? <p className="text-sm text-slate-600">Saving…</p> : null}
          {!sending && outcome ? (
            <>
              <p className={`text-sm ${outcome.kind === "saved" ? "text-teal-800" : "text-slate-800"}`}>{outcome.message}</p>
              {outcome.kind === "refused" && outcome.roots.length ? (
                <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                  {outcome.roots.map(({ root, reason }) => (
                    <li key={`${root.account_id}|${root.region}|${root.resource_uid}`}>
                      <span className="font-mono text-xs">{root.resource_uid}</span>: {reason}
                    </li>
                  ))}
                </ul>
              ) : null}
              {outcome.kind !== "saved" ? <p className="text-xs text-slate-500">Code: {outcome.code}</p> : null}
              <div className="flex gap-2">
                {outcome.kind === "resend" && envelope ? (
                  <Button type="button" size="sm" onClick={() => void send(envelope)}>Resend the same request</Button>
                ) : null}
                {outcome.kind === "refused" ? <Button type="button" size="sm" onClick={backToEdit}>Back to edit</Button> : null}
                {outcome.kind === "saved" ? <Button type="button" size="sm" onClick={onCancel}>Close</Button> : null}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
