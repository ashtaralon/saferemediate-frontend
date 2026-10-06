/**
 * The declaration form's model (T17): what the person picked in the account inventory and typed, turned into the exact
 * CreateDeclaration the backend saves, and the words for every answer. Pure: no React, no fetch.
 *
 * The backend decides everything (authority, admission of every root, conflicts). Locally this only refuses what the
 * SERVED limits and the declarations view already rule out, so a request that cannot be valid is never sent. Nothing
 * here guesses a value: the criticality tiers and environments are the server's, a reused System keeps its own
 * criticality, and a new Deployment covers exactly the (account, Region) cells of the roots picked.
 */
import type {
  AuthoringLimits,
  BoundaryRecord,
  CreateDeclaration,
  DeclaredRoot,
  DeclarationsView,
  RefusedRoot,
  SaveResult,
} from "@/lib/system-boundary-authoring"
import { refusedRoots } from "@/lib/system-boundary-authoring"
import type { InventoryRow, PublicationIdentity } from "@/lib/account-inventory"

/** A root picked in the inventory: the root, what the person saw it as, and the full publication identity of the page
 *  it was picked from (what the inventory view compares with the publication it shows). */
export interface PickedRoot {
  root: DeclaredRoot
  label: string
  publication: PublicationIdentity
}

/**
 * The selection hook Settings' I3 account inventory view accepts (components/accounts/account-inventory-view.tsx; the
 * interface Settings sent 2026-10-06). TEMPORARY structural copy: when that view lands, import its InventorySelection and
 * delete this one -- one contract, not two. The view renders a box per row the inventory marks selectable, says why a
 * row is not, marks a pick whose publication differs from the one shown, and holds no selection state: the caller owns
 * every pick.
 */
export interface InventorySelection {
  /** rowKey(row) -> the publication identity the pick was made under. */
  selected: ReadonlyMap<string, PublicationIdentity>
  onToggle(row: InventoryRow, publication: PublicationIdentity): void
  /** Called when the shown publication is first shown or changes. */
  onPublication?(publication: PublicationIdentity): void
}

/** Whether a pick was made under exactly the publication now shown. */
export function samePublication(a: PublicationIdentity, b: PublicationIdentity): boolean {
  return a.attempt === b.attempt && a.generation === b.generation && a.source_identity === b.source_identity
    && a.authority_digest === b.authority_digest && a.registration_id === b.registration_id
}

export type SystemChoice =
  | { mode: "new"; displayName: string; criticality: string | null }
  | { mode: "existing"; systemKey: string }

export type DeploymentChoice =
  | { mode: "new"; deploymentKey: string; environment: string; environmentRaw: string }
  | { mode: "existing"; deploymentKey: string }

export interface DraftDeclaration {
  roots: PickedRoot[]
  system: SystemChoice
  deployment: DeploymentChoice
}

export type BuildResult = { ok: true; declaration: CreateDeclaration } | { ok: false; problems: string[] }

const DEPLOYMENT_KEY = /^[A-Za-z0-9._-]{1,64}$/
const GLOBAL_REGION = "global"

/** A live (not tombstoned) record of the view, by its key. */
function live(records: BoundaryRecord[], key: string): BoundaryRecord | undefined {
  return records.find((record) => record.key === key && !record.tombstoned)
}

/** The Systems the person may reuse: every live System of the view (the view is already scoped to the person). */
export function reusableSystems(view: DeclarationsView): BoundaryRecord[] {
  return view.systems.filter((system) => !system.tombstoned)
    .sort((a, b) => String(a.body.display_name ?? "").localeCompare(String(b.body.display_name ?? "")))
}

/** The live Deployments of one System. */
export function deploymentsOf(view: DeclarationsView, systemKey: string): BoundaryRecord[] {
  const system = live(view.systems, systemKey)
  if (!system) return []
  return view.deployments.filter((d) => !d.tombstoned && d.body.system_id === system.body.system_id)
    .sort((a, b) => String(a.body.deployment_key ?? "").localeCompare(String(b.body.deployment_key ?? "")))
}

/** The cells a NEW Deployment covers: the distinct (account, Region) of its roots, sorted -- a global root's own cell
 * (account, global) included, so it is inside by the backend's explicit-cell rule. */
export function cellsOf(roots: DeclaredRoot[]): { account_id: string; region: string }[] {
  const seen = new Map<string, { account_id: string; region: string }>()
  for (const root of roots) seen.set(`${root.account_id}|${root.region}`, { account_id: root.account_id, region: root.region })
  return [...seen.values()].sort((a, b) => a.account_id.localeCompare(b.account_id) || a.region.localeCompare(b.region))
}

/** Whether an existing Deployment covers a root's cell: listed, or a global root in an account with exactly one cell
 * (the backend's ``cell_in_deployment``). */
export function deploymentCovers(deployment: BoundaryRecord, root: DeclaredRoot): boolean {
  const scopes = Array.isArray(deployment.body.scopes) ? (deployment.body.scopes as { account_id?: unknown; region?: unknown }[]) : []
  if (scopes.some((s) => s.account_id === root.account_id && s.region === root.region)) return true
  return root.region === GLOBAL_REGION && scopes.filter((s) => s.account_id === root.account_id).length === 1
}

function collapse(text: string): string {
  return text.split(/\s+/).filter(Boolean).join(" ")
}

/** The exact request for a draft, or every problem the served limits and the view already rule out. */
export function buildDeclaration(draft: DraftDeclaration, view: DeclarationsView): BuildResult {
  const limits: AuthoringLimits = view.limits
  const problems: string[] = []
  const roots = draft.roots.map((picked) => picked.root)
  if (roots.length === 0) problems.push("Pick at least one resource as a root.")
  if (roots.length > limits.max_roots) problems.push(`Pick at most ${limits.max_roots} roots in one save.`)
  const accounts = new Set(roots.map((r) => r.account_id))
  if (accounts.size > limits.max_write_accounts) problems.push(`Roots may span at most ${limits.max_write_accounts} accounts in one save.`)

  let system: CreateDeclaration["system"] | null = null
  if (draft.system.mode === "new") {
    const name = collapse(draft.system.displayName)
    if (!name) problems.push("Name the system.")
    else if (name.length > limits.max_display_name) problems.push(`A system name is at most ${limits.max_display_name} characters.`)
    const criticality = draft.system.criticality
    if (criticality !== null && !limits.criticalities.includes(criticality)) problems.push("Choose one of the listed criticality tiers.")
    system = { mode: "new", display_name: name, ...(criticality !== null ? { criticality } : {}) }
  } else {
    const record = live(view.systems, draft.system.systemKey)
    if (!record) problems.push("The chosen system is no longer available; reload and choose again.")
    else system = { mode: "ref", system_id: String(record.body.system_id), expected_version: record.version }
  }

  let deployment: CreateDeclaration["deployment"] | null = null
  if (draft.deployment.mode === "new") {
    const key = draft.deployment.deploymentKey.trim()
    if (!DEPLOYMENT_KEY.test(key)) problems.push("A deployment key is 1-64 letters, digits, dots, dashes or underscores.")
    if (!limits.environments.includes(draft.deployment.environment)) problems.push("Choose the deployment's environment.")
    const raw = draft.deployment.environmentRaw.trim()
    if (raw.length > limits.max_environment_raw) problems.push(`Your own environment word is at most ${limits.max_environment_raw} characters.`)
    const scopes = cellsOf(roots)
    if (scopes.length > limits.max_new_cells) problems.push(`A new deployment covers at most ${limits.max_new_cells} account/Region cells.`)
    deployment = { mode: "new", deployment_key: key, environment: draft.deployment.environment,
                   ...(raw ? { environment_raw: raw } : {}), scopes }
  } else {
    if (draft.system.mode === "new") problems.push("A new system starts with a new deployment.")
    const record = live(view.deployments, draft.deployment.deploymentKey)
    if (!record) problems.push("The chosen deployment is no longer available; reload and choose again.")
    else {
      const outside = roots.filter((root) => !deploymentCovers(record, root))
      if (outside.length) problems.push(`${outside.length} picked root(s) are outside this deployment's accounts and Regions.`)
      deployment = { mode: "ref", deployment_id: String(record.body.deployment_id), expected_version: record.version }
    }
  }
  if (problems.length || system === null || deployment === null) return { ok: false, problems }
  return { ok: true, declaration: { system, deployment, roots } }
}

/** Why the current-root resolver did not admit a root, in the person's words (its status and reason). */
const ROOT_REASONS: Record<string, string> = {
  INCARNATION_NOT_PROVIDED: "it has no verified identity yet, so it cannot be a root",
  ROOT_DELETED: "it was deleted",
  ROOT_STATE_UNVERIFIED: "its current state is not verified",
  NOT_IN_PUBLICATION: "it is no longer in the account's published inventory",
  AUTHORITY_CHANGED_SINCE_SELECTION: "the account's registration changed after you picked it; reload the inventory and pick it again",
  AUTHORITY_CHANGED: "the account's registration changed; reload the inventory and pick it again",
  INCARNATION_CHANGED: "the resource was recreated after you picked it; reload the inventory and pick it again",
  INCARNATION_NOT_PINNED: "it was picked without its identity; reload the inventory and pick it again",
  INCARNATION_UNVERIFIABLE: "its identity can no longer be verified",
  PUBLICATION_BEHIND_SELECTION: "the inventory is being republished; try again shortly",
  PUBLICATION_PIN_CONFLICT: "the inventory is being republished; try again shortly",
  SELECTION_TYPE_MISMATCH: "its type does not match the resource",
  SELECTION_REGION_MISMATCH: "its Region does not match the resource",
  PERSON_NOT_AUTHORIZED: "you are not authorized to read this account",
}

export function rootReason(root: RefusedRoot): string {
  return (root.reason_code && ROOT_REASONS[root.reason_code]) || `${root.status.toLowerCase()} (${root.reason_code ?? "no reason given"})`
}

/** Plain words for every refusal code a save may name; the code itself is always shown too. */
const REFUSALS: Record<string, string> = {
  ROOT_NOT_ADMITTED: "Some picked resources cannot be roots right now. Nothing was saved.",
  ACCOUNT_AUTHORITY_CHANGED: "The account's registration changed while saving. Nothing was saved; reload the inventory and pick again.",
  BASE_REVISION_CONFLICT: "Declarations changed since you opened this form. Nothing was saved; reload and review.",
  DISPLAY_NAME_TAKEN: "A system with this name already exists. Choose it as an existing system instead.",
  PERSON_NOT_TENANT_WIDE: "Creating a system needs tenant-wide access. Choose an existing system, or ask a tenant administrator to create it.",
  PERSON_NOT_AUTHORIZED: "You are not authorized to declare in one of these accounts.",
  NO_GRANT: "You have no authoring access. Ask an administrator for an authoring grant.",
  GRANT_REVOKED: "Your authoring access was revoked. Ask an administrator.",
  OUT_OF_SCOPE: "Your authoring access does not cover one of these accounts. Ask an administrator.",
  ACTION_NOT_GRANTED: "Your authoring access does not include declaring systems. Ask an administrator.",
  GRANT_CHANGED: "Your authoring access changed while saving. Nothing was saved; try again.",
  ACCOUNT_NOT_SERVED: "One of these accounts is not connected to this console.",
  ROOT_ALREADY_DECLARED: "A picked resource is already declared in a system.",
  CELL_OUTSIDE_DEPLOYMENT: "A picked resource is outside the deployment's accounts and Regions.",
  DEPLOYMENT_EXISTS: "This system already has a deployment with that key. Choose it as an existing deployment.",
  DEPLOYMENT_OF_ANOTHER_SYSTEM: "That deployment belongs to another system.",
  ENVIRONMENT_RAW_CONFLICT: "Your own environment word names a different environment.",
  VERSION_CONFLICT: "The chosen system or deployment changed since you opened this form. Reload and review.",
  SYSTEM_CHANGED: "The chosen system changed since you opened this form. Reload and review.",
  DEPLOYMENT_CHANGED: "The chosen deployment changed since you opened this form. Reload and review.",
  PROTOCOL_READER_UNAVAILABLE: "Saving declarations is not available on this installation yet.",
  PROTOCOL_DISABLED: "Saving declarations is not available on this installation yet.",
  PROTOCOL_NOT_INITIALIZED: "Saving declarations is not available on this installation yet.",
  PROTOCOL_SUSPENDED: "Saving declarations is paused on this installation.",
  ROOT_ADMISSION_UNAVAILABLE: "The account inventory could not be checked right now. Nothing was saved; try again.",
  ACCOUNT_REGISTRY_UNAVAILABLE: "The account registry could not be read right now. Nothing was saved; try again.",
}

export type SaveOutcome =
  | { kind: "saved"; revision: number; replayed: boolean; message: string }
  | { kind: "refused"; code: string; message: string; roots: { root: RefusedRoot; reason: string }[] }
  | { kind: "resend"; code: string; message: string }

/** What to tell the person about one answer. Saved is never "applied": membership is prepared after the save. */
export function describeResult(result: SaveResult): SaveOutcome {
  if (result.kind === "SAVED") {
    return { kind: "saved", revision: result.saved.revision, replayed: result.saved.replayed,
             message: `Saved as revision ${result.saved.revision}. Cyntro is preparing this system's membership; nothing is applied yet.` }
  }
  if (result.kind === "RESEND_SAME") {
    return { kind: "resend", code: result.code,
             message: "The save could not be confirmed. Resend the same request: it is safe, and it can never save twice." }
  }
  const roots = refusedRoots(result).map((root) => ({ root, reason: rootReason(root) }))
  return { kind: "refused", code: result.code, message: REFUSALS[result.code] ?? `The save was refused (${result.code}).`, roots }
}
