/**
 * (PC1 S0-H) Which System a listed setup is about, in words -- display only. The backend names it from the setup's OWN records
 * (``system`` on each list row): a draft's typed new System, or a ``ref`` -- the System a finished setup APPLIED, or an existing
 * one a draft or correction refers to. A ``ref`` is named here ONLY from the Systems this page already reads for the person
 * (the declarations view the existing-System picker shows); one not there is "an existing System", never its id. A finished
 * row not resolved that way falls back to the name typed at declaration, marked "(as declared)".
 *
 * Canonical identity stays the setup id / system id: no sort, dedupe or match uses these words.
 * - Field absent (a backend from before it) or ``null`` (the intent names no System yet): today's words, never "not named".
 * - ``system_unreadable`` (that setup's revision could not be read) or a ``system`` this reader does not know: the row says
 *   "name unavailable (<code>)" and the list is still shown.
 */
import type { BoundaryRecord } from "@/lib/system-boundary-authoring"

export type ListedSystem =
  | { state: "absent" }
  | { state: "none" }
  | { state: "unreadable"; code: string }
  | { state: "new"; displayName: string | null }
  | { state: "ref"; systemId: string; declaredName: string | null }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
const nameOrNull = (value: unknown): value is string | null => value === null || (typeof value === "string" && value.length > 0)

/** The row's ``system`` read into one state. Never throws, never refuses the list it is in. */
export function readListedSystem(row: Record<string, unknown>): ListedSystem {
  if ("system_unreadable" in row) {                                  // marked by the backend: never today's plain words
    const code = row.system_unreadable
    return { state: "unreadable", code: typeof code === "string" && code ? code : "SYSTEM_FIELD_INVALID" }
  }
  if (!("system" in row)) return { state: "absent" }
  const system = row.system
  if (system === null) return { state: "none" }
  if (isRecord(system) && system.mode === "new" && Object.keys(system).length === 2 && nameOrNull(system.display_name)) {
    return { state: "new", displayName: system.display_name }
  }
  if (isRecord(system) && system.mode === "ref" && Object.keys(system).length === 3 && typeof system.system_id === "string"
      && system.system_id.length > 0 && nameOrNull(system.declared_name)) {
    return { state: "ref", systemId: system.system_id, declaredName: system.declared_name }
  }
  return { state: "unreadable", code: "SYSTEM_FIELD_INVALID" }
}

/** A ``ref``'s CURRENT name, from the Systems the page already reads for this person; null when it is not among them. */
export function scopedSystemName(systemId: string, systems: readonly BoundaryRecord[]): string | null {
  const record = systems.find((s) => s.key === `SYSTEM#${systemId}` && !s.tombstoned)
  const name = record?.body.display_name
  return typeof name === "string" && name.trim() ? name : null
}

/** " of <System>" for the row's words, or "" where today's words stand (absent / none / unreadable: see ``unavailableNote``). */
export function systemPhrase(listed: ListedSystem, systems: readonly BoundaryRecord[]): string {
  if (listed.state === "new") return listed.displayName ? ` of ${listed.displayName}` : " of a new System (not named yet)"
  if (listed.state !== "ref") return ""
  const current = scopedSystemName(listed.systemId, systems)
  if (current) return ` of ${current}`
  return listed.declaredName ? ` of ${listed.declaredName} (as declared)` : " of an existing System"
}

/** The visible mark on a row whose name could not be read; null otherwise. */
export function unavailableNote(listed: ListedSystem): string | null {
  return listed.state === "unreadable" ? `name unavailable (${listed.code})` : null
}
