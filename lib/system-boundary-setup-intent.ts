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
 * (S1b adds ``deployments[]`` and a scope ``deployment`` key under a new setup level) -- is SETUP_CONTRACT_UNKNOWN: the setup is
 * not edited from here, and the key is never dropped.
 */
import type { DeclaredRoot, ResourceDecision, StackBinding } from "@/lib/system-boundary-authoring"
import { cellsOf, type PickedRoot } from "@/lib/system-boundary-declaration"
import { SETUP_CONTRACT_UNKNOWN, type AuthoredDisposition, type SetupIntent } from "@/lib/system-boundary-setup"

export type Cell = { account_id: string; region: string }

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
  /** (S0 NSW-04) Every authored disposition, as saved: one per (subject, account, Region). */
  dispositions: AuthoredDisposition[]
  /** What was saved, for the values the person did not edit and the lists' presence. Never edited. */
  saved: { system: Record<string, unknown> | null; deployment: Record<string, unknown> | null; lists: ReadonlySet<string> }
}

export type LoadedIntent = { kind: "ok"; local: IntentLocal } | { kind: "unknown"; code: typeof SETUP_CONTRACT_UNKNOWN; at: string }

const DECLARATION_KEYS = ["system", "deployment", "roots", "bindings", "resource_decisions"]
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
  for (const list of LISTS) {
    if (declaration[list] !== undefined && !Array.isArray(declaration[list])) return unknown(`declaration.${list}`)
  }
  for (const d of intent.dispositions ?? []) {
    if (!isRecord(d) || !isRecord(d.scope)) return unknown("dispositions")
    const s = stranger(d.scope, SCOPE_KEYS)
    if (s) return unknown(`dispositions.scope.${s}`)
  }
  const roots = structuredClone((declaration.roots as DeclaredRoot[] | undefined) ?? [])
  const bindings = structuredClone((declaration.bindings as StackBinding[] | undefined) ?? [])
  const decisions = structuredClone((declaration.resource_decisions as ResourceDecision[] | undefined) ?? [])
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
  const deployment: Record<string, unknown> = { ...structuredClone(local.saved.deployment ?? {}), mode: "new",
                                                scopes: structuredClone(local.scopes) }
  field(deployment, "deployment_key", local.deploymentKey, local.saved.deployment)
  field(deployment, "environment", local.environment, local.saved.deployment, (value) => value)
  field(deployment, "environment_raw", local.environmentRaw, local.saved.deployment)
  const declaration: Record<string, unknown> = { system, deployment }
  const lists: Record<(typeof LISTS)[number], unknown[]> = {
    roots: local.roots.map((picked) => picked.root), bindings: local.bindings, resource_decisions: local.decisions,
  }
  for (const list of LISTS) {
    const written = local.saved.lists.has(list) || lists[list].length > 0 || (list === "roots" && local.bindings.length === 0)
    if (written) declaration[list] = structuredClone(lists[list])
  }
  return declaration
}

/** ``local`` with the roots, bindings and decisions given, and its scopes recomputed from them -- the only way scopes change. */
export function withBoundary(local: IntentLocal, change: Partial<Pick<IntentLocal, "roots" | "bindings" | "decisions">>): IntentLocal {
  const next = { ...local, ...change }
  return { ...next, scopes: cellsOf([...next.roots.map((p) => p.root), ...next.bindings, ...next.decisions]) }
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
