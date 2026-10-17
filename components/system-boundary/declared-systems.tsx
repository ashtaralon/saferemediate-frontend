"use client"

/**
 * What is declared on this account, and correcting it (Phase 2 T18A): each System with a Deployment here, its
 * Deployments' environments and this account's roots. A change is reviewed -- its exact effect in words -- and saved as
 * ONE correction (one request id, resent unchanged if unconfirmed; a refusal is named). A replacement (remove + add) is
 * one revision: the declared roots go from A+B to A+C, never A+B+C, and stay A+B until it is saved. Removing a root
 * removes its declaration, never the AWS resource.
 */
import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  newCorrectionEnvelope,
  saveCorrection,
  type BoundaryRecord,
  type Correction,
  type CorrectionEnvelope,
  type DeclarationsView,
  type SaveResult,
} from "@/lib/system-boundary-authoring"
import { buildCorrection, declaredIn, environmentEffect, type CorrectionIntent } from "@/lib/system-boundary-correction"
import { describeResult, type PickedRoot, type SaveOutcome } from "@/lib/system-boundary-declaration"

export interface DeclaredSystemsProps {
  view: DeclarationsView
  accountId: string
  /** The roots picked in the inventory: what "add" and "replace" add. */
  picks: PickedRoot[]
  /** A correction was confirmed; ``usedPicks`` when it added the picked roots. */
  onSaved: (revision: number, usedPicks: boolean) => void
  save?: (envelope: CorrectionEnvelope) => Promise<SaveResult>
  onEnvelope?: (envelope: CorrectionEnvelope) => void
  onOutcome?: (envelope: CorrectionEnvelope, outcome: SaveOutcome) => void
}

type Editing =
  | { kind: "criticality"; systemKey: string }
  | { kind: "environment"; deploymentKey: string }
  | { kind: "roots"; deploymentKey: string }

function label(body: Record<string, unknown>, field: string): string {
  return typeof body[field] === "string" ? (body[field] as string) : "(not set)"
}

function rootName(root: BoundaryRecord): string {
  return label(root.body, "resource_uid").split("/").pop() ?? label(root.body, "resource_uid")
}

export function DeclaredSystems({ view, accountId, picks, onSaved, save = saveCorrection, onEnvelope, onOutcome }: DeclaredSystemsProps) {
  const declared = useMemo(() => declaredIn(view, accountId), [view, accountId])
  const allDeployments = useMemo(() => view.deployments.filter((d) => !d.tombstoned), [view])
  const [editing, setEditing] = useState<Editing | null>(null)
  const [criticality, setCriticality] = useState("")
  const [environment, setEnvironment] = useState("")
  const [environmentRaw, setEnvironmentRaw] = useState("")
  const [clearRaw, setClearRaw] = useState(false)
  const [rootPlan, setRootPlan] = useState<Record<string, string>>({})        // root key -> "keep" | "remove" | deployment key
  const [addPicks, setAddPicks] = useState(false)
  const [problems, setProblems] = useState<string[]>([])
  const [reviewed, setReviewed] = useState<{ correction: Correction; lines: string[] } | null>(null)
  const [envelope, setEnvelope] = useState<CorrectionEnvelope | null>(null)
  const [outcome, setOutcome] = useState<SaveOutcome | null>(null)
  const [sending, setSending] = useState(false)

  const open = (next: Editing, record: BoundaryRecord) => {
    setEditing(next)
    setProblems([])
    setReviewed(null)
    setEnvelope(null)
    setOutcome(null)
    setCriticality(typeof record.body.criticality === "string" ? (record.body.criticality as string) : "")
    setEnvironment(label(record.body, "environment"))
    setEnvironmentRaw(typeof record.body.environment_raw === "string" ? (record.body.environment_raw as string) : "")
    setClearRaw(false)
    setRootPlan({})
    setAddPicks(false)
  }

  const intentOf = (): CorrectionIntent | null => {
    if (!editing) return null
    if (editing.kind === "criticality") return { kind: "criticality", systemKey: editing.systemKey, criticality: criticality || null }
    if (editing.kind === "environment") {
      return { kind: "environment", deploymentKey: editing.deploymentKey, environment,
               environmentRaw: clearRaw ? null : environmentRaw }
    }
    const remove = Object.entries(rootPlan).filter(([, plan]) => plan === "remove").map(([key]) => key)
    const move = Object.entries(rootPlan).filter(([, plan]) => plan !== "remove" && plan !== "keep")
      .map(([rootKey, toDeploymentKey]) => ({ rootKey, toDeploymentKey }))
    return { kind: "roots", deploymentKey: editing.deploymentKey, add: addPicks ? picks : [], remove, move }
  }

  const review = () => {
    const intent = intentOf()
    if (!intent) return
    const built = buildCorrection(intent, view)
    if (!built.ok) {
      setProblems(built.problems)
      return
    }
    const correction = built.correction
    const lines: string[] = []
    if (intent.kind === "criticality") lines.push(`Criticality becomes ${intent.criticality ?? "not set"} (tenant-wide).`)
    if (intent.kind === "environment") {
      const deployment = view.deployments.find((d) => d.key === intent.deploymentKey)!
      lines.push(...environmentEffect(deployment, correction.deployment?.set ?? {}))
    }
    if (intent.kind === "roots") {
      const names = (keys: string[]) => keys.map((key) => rootName(view.roots.find((r) => r.key === key)!)).join(", ")
      if (intent.remove.length) lines.push(`Remove: ${names(intent.remove)} (their declarations, not the AWS resources).`)
      if (intent.add.length) lines.push(`Add: ${intent.add.map((p) => p.label).join(", ")}.`)
      for (const move of intent.move) {
        const to = view.deployments.find((d) => d.key === move.toDeploymentKey)!
        lines.push(`Move: ${names([move.rootKey])} to ${label(to.body, "deployment_key")}.`)
      }
      lines.push("This is ONE revision: until it is saved, the declared roots stay as they are.")
    }
    setProblems([])
    setReviewed({ correction, lines })
  }

  const send = async (target: CorrectionEnvelope) => {
    setSending(true)
    const described = describeResult(await save(target))
    setSending(false)
    setOutcome(described)
    onOutcome?.(target, described)
    if (described.kind === "saved") onSaved(described.revision, editing?.kind === "roots" && addPicks)
  }

  const saveReviewed = async () => {
    if (!reviewed || view.completed_revision === null) return
    const minted = newCorrectionEnvelope(view.completed_revision, reviewed.correction)
    setEnvelope(minted)
    onEnvelope?.(minted)
    await send(minted)
  }

  if (declared.length === 0) {
    return <p className="text-xs text-slate-500" data-testid="declared-systems">Nothing is declared on this account yet.</p>
  }
  return (
    <section aria-label="Declared on this account" className="space-y-3" data-testid="declared-systems">
      <h3 className="text-sm font-semibold text-slate-800">Declared on this account</h3>
      {declared.map(({ system, deployments }) => (
        <div key={system.key} className="space-y-2 rounded border border-slate-200 p-3">
          <div className="flex items-center gap-3 text-sm">
            <span className="font-semibold">{label(system.body, "display_name")}</span>
            <span className="text-xs text-slate-600">criticality {label(system.body, "criticality")}</span>
            <Button type="button" size="sm" variant="outline" onClick={() => open({ kind: "criticality", systemKey: system.key }, system)}>
              Change criticality
            </Button>
          </div>
          {deployments.map(({ deployment, roots }) => (
            <div key={deployment.key} className="space-y-1 pl-4 text-sm">
              <div className="flex items-center gap-3">
                <span>{label(deployment.body, "deployment_key")}</span>
                <span className="text-xs text-slate-600">
                  {label(deployment.body, "environment")}
                  {typeof deployment.body.environment_raw === "string" ? ` ("${deployment.body.environment_raw}")` : ""}
                </span>
                <Button type="button" size="sm" variant="outline"
                  onClick={() => open({ kind: "environment", deploymentKey: deployment.key }, deployment)}>Change environment</Button>
                <Button type="button" size="sm" variant="outline"
                  onClick={() => open({ kind: "roots", deploymentKey: deployment.key }, deployment)}>Change roots</Button>
              </div>
              <ul className="pl-4 text-xs text-slate-700">
                {roots.map((root) => (
                  <li key={root.key} className="flex items-center gap-2">
                    <span className="font-mono">{rootName(root)}</span>
                    {editing?.kind === "roots" && editing.deploymentKey === deployment.key ? (
                      <select aria-label={`Change ${rootName(root)}`} value={rootPlan[root.key] ?? "keep"}
                        onChange={(e) => setRootPlan((plan) => ({ ...plan, [root.key]: e.target.value }))}>
                        <option value="keep">Keep</option>
                        <option value="remove">Remove</option>
                        {allDeployments.filter((d) => d.key !== deployment.key).map((d) => (
                          <option key={d.key} value={d.key}>Move to {label(d.body, "deployment_key")}</option>
                        ))}
                      </select>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}

      {editing && !reviewed && !outcome ? (
        <div className="space-y-2 rounded border border-slate-300 p-3 text-sm" data-testid="correction-editor">
          {editing.kind === "criticality" ? (
            <label className="block">
              Criticality
              <select aria-label="New criticality" className="ml-2 rounded border px-2 py-1" value={criticality}
                onChange={(e) => setCriticality(e.target.value)}>
                <option value="">Not set</option>
                {view.limits.criticalities.map((tier) => <option key={tier} value={tier}>{tier}</option>)}
              </select>
            </label>
          ) : null}
          {editing.kind === "environment" ? (
            <>
              <label className="block">
                Environment
                <select aria-label="New environment" className="ml-2 rounded border px-2 py-1" value={environment}
                  onChange={(e) => setEnvironment(e.target.value)}>
                  {view.limits.environments.map((env) => <option key={env} value={env}>{env}</option>)}
                </select>
              </label>
              <label className="block">
                Your own word
                <input aria-label="New environment word" className="ml-2 rounded border px-2 py-1" value={environmentRaw}
                  disabled={clearRaw} onChange={(e) => setEnvironmentRaw(e.target.value)} />
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={clearRaw} onChange={(e) => setClearRaw(e.target.checked)} /> Clear my word
              </label>
            </>
          ) : null}
          {editing.kind === "roots" ? (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={addPicks} disabled={picks.length === 0} onChange={(e) => setAddPicks(e.target.checked)} />
              Add the {picks.length} picked {picks.length === 1 ? "resource" : "resources"} here
            </label>
          ) : null}
          {problems.length ? (
            <ul className="list-disc pl-5 text-red-700" role="alert">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
          ) : null}
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={review}>Review change</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </div>
      ) : null}

      {reviewed && !outcome ? (
        <div className="space-y-2 rounded border border-slate-300 p-3 text-sm" data-testid="correction-review">
          <ul className="list-disc pl-5">{reviewed.lines.map((line) => <li key={line}>{line}</li>)}</ul>
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={sending} onClick={() => void saveReviewed()}>Save change</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setReviewed(null)}>Back</Button>
          </div>
        </div>
      ) : null}

      {outcome ? (
        <div className="space-y-2 rounded border border-slate-300 p-3 text-sm" role="status" data-testid="correction-outcome">
          <p>{outcome.message}</p>
          {outcome.kind !== "saved" ? <p className="text-xs text-slate-500">Code: {outcome.code}</p> : null}
          <div className="flex gap-2">
            {outcome.kind === "resend" && envelope ? (
              <Button type="button" size="sm" onClick={() => void send(envelope)}>Resend the same request</Button>
            ) : null}
            {outcome.kind === "refused" ? (
              <Button type="button" size="sm" onClick={() => { setOutcome(null); setReviewed(null) }}>Back to edit</Button>
            ) : null}
            {outcome.kind === "saved" ? (
              <Button type="button" size="sm" onClick={() => { setOutcome(null); setReviewed(null); setEditing(null) }}>Done</Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}
