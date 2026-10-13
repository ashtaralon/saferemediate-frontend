/**
 * The guided setup's intent, read and written LOSSLESSLY (S1a contract D1). Pure: no React, no fetch.
 *
 * A saved intent carries the existing declaration fields: ``{system, deployment{mode:"new", deployment_key, environment,
 * environment_raw, scopes}, roots, bindings, resource_decisions}``. Reading it and writing it back unchanged gives back exactly
 * what was saved -- a stack binding, a person's per-resource decision (an exclusion included), each list's presence, the saved
 * Deployment scopes and every value the person did not edit. What the person edits is normalized as the declaration form
 * normalizes it (trimmed text; an empty optional field left out).
 *
 * ``deployment.scopes`` is the ONE scope authority. It is saved explicitly and recomputed -- the distinct (account, Region) cells
 * of the roots, bindings and decisions (``cellsOf``, the declaration builder's own rule) -- only when one of those changes, never
 * on resume. An intent with no saved scopes starts from that same rule.
 *
 * A key this release does not know -- in the declaration, its System, its Deployment, a Deployment scope or a disposition scope
 * -- is SETUP_CONTRACT_UNKNOWN: the setup is not edited from here, and the key is never dropped.
 *
 * (S1b, setup level 5; agreed A2 / N1 / N2) The PLURAL shape -- ``declaration.deployments[]`` instead of ``deployment`` (never
 * both), each entry today's new-mode object -- is read and written as losslessly, decided by the stored shape alone (A9). Every
 * root, binding and decision of a plural intent names its Deployment (``deployment_key``); a ``code`` / ``iac`` disposition
 * names one in its scope (``deployment``) and never asks for an owner request; the account x Region sources stay cell-scoped,
 * once for the union. Each Deployment's ``scopes`` is recomputed from ITS roots, bindings and decisions only, by the same
 * rule. A Deployment is added only when the person adds one (the single shape then becomes plural, its one Deployment first),
 * and removed only while nothing names it (the last but one leaves the single shape again).
 */
import type { DeclaredRoot, ResourceDecision, StackBinding } from "@/lib/system-boundary-authoring"
import { DEPLOYMENT_KEY_NAME } from "@/lib/system-boundary-deployment-context"
import { cellsOf, type PickedRoot } from "@/lib/system-boundary-declaration"
import { SETUP_CONTRACT_UNKNOWN, type AuthoredDisposition, type SetupIntent } from "@/lib/system-boundary-setup"

export type Cell = { account_id: string; region: string }

/** (S1b) One Deployment of a PLURAL intent, as the guided steps edit it; ``saved`` keeps what was saved, never edited. */
export interface DeploymentLocal {
  deploymentKey: string
  environment: string
  environmentRaw: string
  scopes: Cell[]
  saved: Record<string, unknown> | null
}

/** (S1b) The most Deployments one plural create may carry (backend unified/system_boundary_plan.MAX_DEPLOYMENTS). */
export const MAX_DEPLOYMENTS = 4
/** (S1b, N1) The subjects a plural intent scopes per Deployment; every other subject is cell-scoped. */
export const DEPLOYMENT_SCOPED_SUBJECTS: ReadonlySet<string> = new Set(["code", "iac"])

export interface IntentLocal {
  displayName: string
  criticality: string
  deploymentKey: string
  environment: string
  environmentRaw: string
  roots: PickedRoot[]
  bindings: StackBinding[]
  decisions: ResourceDecision[]
  /** The Deployment's scopes: as saved, or as last recomputed from a change of roots, bindings or decisions. */
  scopes: Cell[]
  /** (S0 NSW-04) Every authored disposition, as saved: one per (subject, account, Region[, Deployment]). */
  dispositions: AuthoredDisposition[]
  /** (S1b) The plural shape's Deployments, in the order saved; null for the single shape (whose Deployment is the fields above). */
  deployments: DeploymentLocal[] | null
  /** What was saved, for the values the person did not edit and the lists' presence. Never edited. */
  saved: { system: Record<string, unknown> | null; deployment: Record<string, unknown> | null; lists: ReadonlySet<string> }
}

export type LoadedIntent = { kind: "ok"; local: IntentLocal } | { kind: "unknown"; code: typeof SETUP_CONTRACT_UNKNOWN; at: string }

const DECLARATION_KEYS = ["system", "deployment", "deployments", "roots", "bindings", "resource_decisions"]
const SYSTEM_KEYS = ["mode", "display_name", "criticality"]
const DEPLOYMENT_KEYS = ["mode", "deployment_key", "environment", "environment_raw", "scopes"]
const SCOPE_KEYS = ["account_id", "region"]
const LISTS = ["roots", "bindings", "resource_decisions"] as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** The first key of ``value`` outside ``known``, or null. */
function stranger(value: Record<string, unknown>, known: readonly string[]): string | null {
  return Object.keys(value).find((key) => !known.includes(key)) ?? null
}

const text = (value: unknown): string => (typeof value === "string" ? value : "")

/** The setup intent as the guided steps edit it, or the first thing this release cannot carry back unchanged. */
export function loadIntent(intent: SetupIntent): LoadedIntent {
  const unknown = (at: string): LoadedIntent => ({ kind: "unknown", code: SETUP_CONTRACT_UNKNOWN, at })
  const stray = stranger(intent as unknown as Record<string, unknown>, ["declaration", "dispositions", "resume_step"])
  if (stray) return unknown(stray)
  const declaration = intent.declaration ?? {}
  if (!isRecord(declaration)) return unknown("declaration")
  const key = stranger(declaration, DECLARATION_KEYS)
  if (key) return unknown(`declaration.${key}`)
  const system = declaration.system === undefined ? null : declaration.system
  const deployment = declaration.deployment === undefined ? null : declaration.deployment
  const plural = declaration.deployments !== undefined
  if (plural && declaration.deployment !== undefined) return unknown("declaration.deployments")     // XOR (A2)
  if (system !== null) {
    if (!isRecord(system)) return unknown("declaration.system")
    const k = stranger(system, SYSTEM_KEYS)
    if (k) return unknown(`declaration.system.${k}`)
    if (system.mode !== undefined && system.mode !== "new") return unknown("declaration.system.mode")
  }
  let scopes: Cell[] | null = null
  if (deployment !== null) {
    if (!isRecord(deployment)) return unknown("declaration.deployment")
    const k = stranger(deployment, DEPLOYMENT_KEYS)
    if (k) return unknown(`declaration.deployment.${k}`)
    if (deployment.mode !== undefined && deployment.mode !== "new") return unknown("declaration.deployment.mode")
    if (deployment.scopes !== undefined) {
      if (!Array.isArray(deployment.scopes)) return unknown("declaration.deployment.scopes")
      for (const scope of deployment.scopes) {
        if (!isRecord(scope)) return unknown("declaration.deployment.scopes")
        const s = stranger(scope, SCOPE_KEYS)
        if (s) return unknown(`declaration.deployment.scopes.${s}`)
      }
      scopes = structuredClone(deployment.scopes as Cell[])
    }
  }
  let deployments: DeploymentLocal[] | null = null
  const unsavedScopes = new Set<number>()                 // filled below from the entries naming them, as the single shape does
  if (plural) {
    if (!Array.isArray(declaration.deployments) || declaration.deployments.length === 0) return unknown("declaration.deployments")
    deployments = []
    for (const entry of declaration.deployments) {
      if (!isRecord(entry)) return unknown("declaration.deployments")
      const k = stranger(entry, DEPLOYMENT_KEYS)
      if (k) return unknown(`declaration.deployments.${k}`)
      if (entry.mode !== undefined && entry.mode !== "new") return unknown("declaration.deployments.mode")
      if (entry.scopes !== undefined && (!Array.isArray(entry.scopes)
          || !entry.scopes.every((scope) => isRecord(scope) && stranger(scope, SCOPE_KEYS) === null))) {
        return unknown("declaration.deployments.scopes")
      }
      if (entry.scopes === undefined) unsavedScopes.add(deployments.length)
      deployments.push({ deploymentKey: text(entry.deployment_key), environment: text(entry.environment),
                         environmentRaw: text(entry.environment_raw),
                         scopes: structuredClone((entry.scopes as Cell[] | undefined) ?? []), saved: structuredClone(entry) })
    }
  }
  for (const list of LISTS) {
    if (declaration[list] !== undefined && !Array.isArray(declaration[list])) return unknown(`declaration.${list}`)
  }
  const dispositionScope = plural ? [...SCOPE_KEYS, "deployment"] : SCOPE_KEYS
  for (const d of intent.dispositions ?? []) {
    if (!isRecord(d) || !isRecord(d.scope)) return unknown("dispositions")
    const s = stranger(d.scope, dispositionScope)
    if (s) return unknown(`dispositions.scope.${s}`)
  }
  const roots = structuredClone((declaration.roots as DeclaredRoot[] | undefined) ?? [])
  const bindings = structuredClone((declaration.bindings as StackBinding[] | undefined) ?? [])
  const decisions = structuredClone((declaration.resource_decisions as ResourceDecision[] | undefined) ?? [])
  for (const i of unsavedScopes) {
    const d = deployments![i]
    d.scopes = cellsOf([...roots, ...bindings, ...decisions].filter((e) => keyOf(e) === d.deploymentKey))
  }
  return { kind: "ok", local: {
    displayName: text(system?.display_name),
    criticality: text(system?.criticality),
    deploymentKey: text(deployment?.deployment_key),
    environment: text(deployment?.environment),
    environmentRaw: text(deployment?.environment_raw),
    // A resumed root keeps the selection it was picked under; its label is its identity (the row is not re-read here).
    roots: roots.map((root) => ({ root, label: root.resource_uid,
                                  publication: { attempt: "", generation: 0, source_identity: "", authority_digest: "", registration_id: "" } })),
    bindings, decisions,
    scopes: scopes ?? cellsOf([...roots, ...bindings, ...decisions]),
    dispositions: (intent.dispositions ?? []).map((d) => structuredClone(d)),
    deployments,
    saved: { system: system === null ? null : structuredClone(system), deployment: deployment === null ? null : structuredClone(deployment),
             lists: new Set(LISTS.filter((list) => declaration[list] !== undefined)) },
  } }
}

/** ``typed`` back into ``target[key]``: the SAVED value exactly while the person has not changed it; else normalized, and an
 *  empty one left out. */
function field(target: Record<string, unknown>, key: string, typed: string, saved: Record<string, unknown> | null,
               normalize: (value: string) => string = (value) => value.trim()): void {
  const before = saved?.[key]
  if (typed === text(before)) {
    if (before === undefined) delete target[key]
    else target[key] = structuredClone(before)
    return
  }
  const value = normalize(typed)
  if (value) target[key] = value
  else delete target[key]
}

/** The DRAFT declaration: what was saved, with what the person changed (the server names what is missing at Finish, by step).
 *  A list is written when it was saved (empty or not) or is not empty now; ``roots`` too whenever no stack is bound -- the
 *  declaration a root-only setup always carried. */
export function draftDeclaration(local: IntentLocal): Record<string, unknown> {
  const system: Record<string, unknown> = { ...structuredClone(local.saved.system ?? {}), mode: "new" }
  field(system, "display_name", local.displayName, local.saved.system)
  field(system, "criticality", local.criticality, local.saved.system, (value) => value)
  const entry = (d: Pick<DeploymentLocal, "deploymentKey" | "environment" | "environmentRaw" | "scopes" | "saved">) => {
    const deployment: Record<string, unknown> = { ...structuredClone(d.saved ?? {}), mode: "new", scopes: structuredClone(d.scopes) }
    field(deployment, "deployment_key", d.deploymentKey, d.saved)
    field(deployment, "environment", d.environment, d.saved, (value) => value)
    field(deployment, "environment_raw", d.environmentRaw, d.saved)
    return deployment
  }
  const declaration: Record<string, unknown> = local.deployments
    ? { system, deployments: local.deployments.map(entry) }
    : { system, deployment: entry({ ...local, saved: local.saved.deployment }) }
  const lists: Record<(typeof LISTS)[number], unknown[]> = {
    roots: local.roots.map((picked) => picked.root), bindings: local.bindings, resource_decisions: local.decisions,
  }
  for (const list of LISTS) {
    const written = local.saved.lists.has(list) || lists[list].length > 0 || (list === "roots" && local.bindings.length === 0)
    if (written) declaration[list] = structuredClone(lists[list])
  }
  return declaration
}

/** ``local`` with the roots, bindings and decisions given, and its scopes recomputed from them -- the only way scopes change.
 *  (S1b) A plural intent's Deployments each get the cells of the entries naming THEM. */
export function withBoundary(local: IntentLocal, change: Partial<Pick<IntentLocal, "roots" | "bindings" | "decisions">>): IntentLocal {
  const next = { ...local, ...change }
  const entries = [...next.roots.map((p) => p.root), ...next.bindings, ...next.decisions]
  if (!next.deployments) return { ...next, scopes: cellsOf(entries) }
  return { ...next, deployments: next.deployments.map((d) => ({
    ...d, scopes: cellsOf(entries.filter((e) => keyOf(e) === d.deploymentKey)) })) }
}

/** (S1b) The ``deployment_key`` a root, binding or decision of a plural intent names; undefined for any other. */
export function keyOf(entry: object): string | undefined {
  const key = (entry as { deployment_key?: unknown }).deployment_key
  return typeof key === "string" ? key : undefined
}

/** (S1b) ``entry`` naming ``key`` (undefined: naming none, as in the single shape). */
function tagged<T extends object>(entry: T, key: string | undefined): T {
  const { deployment_key: _old, ...rest } = entry as T & { deployment_key?: string }
  return (key === undefined ? rest : { ...rest, deployment_key: key }) as T
}

/** (S1b) A disposition with its scope naming ``key`` -- only a Deployment-scoped subject's, and undefined: none. */
function scoped(d: AuthoredDisposition, key: string | undefined): AuthoredDisposition {
  if (!DEPLOYMENT_SCOPED_SUBJECTS.has(d.subject)) return d
  const { deployment: _old, ...scope } = d.scope
  return { ...d, scope: key === undefined ? scope : { ...scope, deployment: key } }
}

export type DeploymentChange = { kind: "ok"; local: IntentLocal } | { kind: "refused"; why: string }

/** (S1b) Every entry and disposition naming ``from`` renamed to ``to`` (undefined: naming none). */
function retag(local: IntentLocal, from: string, to: string | undefined): IntentLocal {
  const re = <T extends object>(e: T): T => (keyOf(e) === from ? tagged(e, to) : e)
  return { ...local, roots: local.roots.map((p) => ({ ...p, root: re(p.root) })), bindings: local.bindings.map(re),
           decisions: local.decisions.map(re),
           dispositions: local.dispositions.map((d) => (d.scope.deployment === from ? scoped(d, to) : d)) }
}

/** (S1b) A NEW Deployment ``key`` added. From the single shape this makes the intent plural: its one Deployment first (named
 *  by its key, which must be set), every root, binding and decision -- and each code / iac choice -- naming it. Refused, with
 *  why, past the limit, for a key the backend does not admit, a key already used, or a code / iac choice that asks for an
 *  owner request (N2: a request is per account and Region, never per Deployment -- the person changes that choice first). */
export function addDeployment(local: IntentLocal, key: string): DeploymentChange {
  const name = key.trim()
  if (!DEPLOYMENT_KEY_NAME.test(name)) return { kind: "refused", why: "A Deployment key is 1-64 letters, digits, '.', '_' or '-'." }
  let next = local
  if (!next.deployments) {
    const first = next.deploymentKey.trim()
    if (!DEPLOYMENT_KEY_NAME.test(first)) return { kind: "refused", why: "Name this Deployment first: its key is not set yet." }
    const asked = next.dispositions.find((d) => DEPLOYMENT_SCOPED_SUBJECTS.has(d.subject) && d.choice === "requested")
    if (asked) {
      return { kind: "refused", why: `This setup requests ${asked.subject === "iac" ? "infrastructure as code" : "application code"} `
        + "from an account administrator. With several Deployments that is chosen per Deployment, and a request is made per "
        + "account and Region only (OWNER_REQUEST_NOT_DEPLOYMENT_SCOPED): change that choice first." }
    }
    next = {
      ...next, deploymentKey: "", environment: "", environmentRaw: "", scopes: [],
      saved: { ...next.saved, deployment: null },
      roots: next.roots.map((p) => ({ ...p, root: tagged(p.root, first) })), bindings: next.bindings.map((b) => tagged(b, first)),
      decisions: next.decisions.map((d) => tagged(d, first)), dispositions: next.dispositions.map((d) => scoped(d, first)),
      deployments: [{ deploymentKey: first, environment: next.environment, environmentRaw: next.environmentRaw,
                      scopes: structuredClone(next.scopes), saved: next.saved.deployment }],
    }
  }
  const deployments = next.deployments!
  if (deployments.length >= MAX_DEPLOYMENTS) return { kind: "refused", why: `A system is set up with at most ${MAX_DEPLOYMENTS} Deployments here.` }
  if (deployments.some((d) => d.deploymentKey === name)) return { kind: "refused", why: `"${name}" is already a Deployment of this setup.` }
  return { kind: "ok", local: { ...next, deployments: [...deployments, { deploymentKey: name, environment: "", environmentRaw: "",
                                                                         scopes: [], saved: null }] } }
}

/** (S1b) The Deployment ``key`` removed -- only while no root, binding, decision or choice names it. The last but one leaves
 *  the single shape again: its Deployment becomes the setup's one Deployment, and nothing names a Deployment any more. */
export function removeDeployment(local: IntentLocal, key: string): DeploymentChange {
  if (!local.deployments || local.deployments.length < 2) return { kind: "refused", why: "A setup keeps at least one Deployment." }
  const named = [...local.roots.map((p) => p.root), ...local.bindings, ...local.decisions].some((e) => keyOf(e) === key)
    || local.dispositions.some((d) => d.scope.deployment === key)
  if (named) return { kind: "refused", why: `Move or remove what "${key}" holds first: its roots, stack, decisions and choices.` }
  const deployments = local.deployments.filter((d) => d.deploymentKey !== key)
  if (deployments.length > 1) return { kind: "ok", local: { ...local, deployments } }
  const [only] = deployments
  const single = retag(local, only.deploymentKey, undefined)
  return { kind: "ok", local: { ...single, deployments: null, deploymentKey: only.deploymentKey, environment: only.environment,
                                environmentRaw: only.environmentRaw, scopes: only.scopes,
                                saved: { ...single.saved, deployment: only.saved } } }
}

/** (S1b) The Deployment at ``index`` renamed to ``key`` -- every entry and choice naming it follows -- or why not. */
export function renameDeployment(local: IntentLocal, index: number, key: string): DeploymentChange {
  const current = local.deployments?.[index]
  if (!current) return { kind: "refused", why: "No such Deployment." }
  if (local.deployments!.some((d, i) => i !== index && d.deploymentKey === key)) {
    return { kind: "refused", why: `"${key}" is already a Deployment of this setup.` }
  }
  const next = retag(local, current.deploymentKey, key)
  return { kind: "ok", local: { ...next, deployments: local.deployments!.map((d, i) => (i === index ? { ...d, deploymentKey: key } : d)) } }
}

/** (S1b) The Deployment at ``index`` with its environment fields changed. */
export function withDeployment(local: IntentLocal, index: number,
                               patch: Partial<Pick<DeploymentLocal, "environment" | "environmentRaw">>): IntentLocal {
  if (!local.deployments) return local
  return { ...local, deployments: local.deployments.map((d, i) => (i === index ? { ...d, ...patch } : d)) }
}

/** (S1b) ``picks`` as the roots of Deployment ``key``, replacing its own; refused when a pick is already a root of another
 *  Deployment (one seed per resource, whichever Deployment names it). */
export function withRootsOf(local: IntentLocal, key: string, picks: PickedRoot[]): DeploymentChange {
  const same = (a: DeclaredRoot, b: DeclaredRoot) =>
    a.account_id === b.account_id && a.region === b.region && a.resource_uid === b.resource_uid
  const elsewhere = local.roots.filter((p) => keyOf(p.root) !== key && picks.some((q) => same(p.root, q.root)))
  if (elsewhere.length) {
    return { kind: "refused", why: `${elsewhere.map((p) => p.label).join(", ")} is already a root of another Deployment.` }
  }
  const roots = [...local.roots.filter((p) => keyOf(p.root) !== key), ...picks.map((p) => ({ ...p, root: tagged(p.root, key) }))]
  return { kind: "ok", local: withBoundary(local, { roots }) }
}

/** (S1b) A binding of a plural intent naming ``key``; as given in the single shape (``key`` undefined). */
export function bindingOf(binding: StackBinding, key: string | undefined): StackBinding {
  return tagged(binding, key)
}

/** The stack binding a guided setup makes for a CloudFormation stack the census serves: the person's stack, as a System's own
 *  (``exclusive``) -- or the kind it was already bound as -- with what the person saw of it (never authority: the census is read
 *  again at save). */
export function stackBinding(accountId: string, stack: { stack_id: string; region: string; stack_status: string | null;
                                                         census: { generation: number; source_identity: string } },
                             previous?: StackBinding): StackBinding {
  return { account_id: accountId, region: stack.region, stack_id: stack.stack_id,
           kind: previous?.stack_id === stack.stack_id ? previous.kind : "exclusive",
           selection: { census: { generation: stack.census.generation, source_identity: stack.census.source_identity },
                        stack_status: stack.stack_status } }
}

/** Whether a saved create intent binds a stack: Finish then rests on a reviewed preview (the backend's ``requires_preview``). */
export function bindsStack(intent: SetupIntent | undefined): boolean {
  const bindings = isRecord(intent?.declaration) ? intent?.declaration?.bindings : undefined
  return Array.isArray(bindings) && bindings.length > 0
}
