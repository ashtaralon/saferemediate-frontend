/**
 * The account inventory's held / refused / unavailable answers, in words (QA-04, QA-13 of rehearsal.32's QA).
 *
 * Every code worded here is one the backend route really answers:
 * - a readiness hold is "<account>:CONSUMER_NOT_READY:<reason>" (cyntro_data/semantic/estate_read.py:
 *   registry_consumer_readiness's provider -> consumer_readiness_hold_for -> _ready_selection), whose reasons include
 *   lifecycle_not_active:<STATE> for every non-ACTIVE onboarding state and the pass lapses
 *   (semantic_onboarding.PASS_LAPSE_REASONS); both are captured by executing the backend
 *   (__tests__/fixtures/account-inventory-types/hold-reasons.json), and a test fails when one has no words here;
 * - 403 INVENTORY_SCOPE_MISMATCH is the gate refusing an account outside this installation's serving scope
 *   (estate_read._refuse_http(CLAIM_OUTSIDE_SERVER_SCOPE)). It is not "you are not authorized" (QA-04), and on its own it does
 *   not say why the account is outside: the account page names the reason when it knows one (removed, or not confirmed yet --
 *   components/accounts/account-inventory-gate.tsx); this generic sentence never guesses one (r41).
 * A code this table does not know is shown with its own spelling, never guessed into words.
 */
import type { InventoryModel } from "@/lib/account-inventory"

/** What each onboarding state means for this account's data, as "Now: ..." (cyntro_data/consume/onboarding.py's ladder).
 *  The ladder is the DATA's: it never speaks for the connection, which is the connector's and is shown on Settings › Accounts.
 *  An account Settings shows Connected reads INSTALLING here until a data stage is recorded for it (first-account QA, r41). */
export const LIFECYCLE_NOW: Record<string, string> = {
  INSTALLING: "no stage of its data has been recorded yet",
  PROVISIONING: "the setup its data is collected through is being checked",
  BOOTSTRAPPING: "collecting its first inventory",
  BACKFILLING: "reading its recent activity history",
  SHADOW: "its first data is staged and being checked",
  VALIDATION_HELD: "its latest data check was held",
  READY: "its data is checked and waiting to be activated",
  OFFBOARDED: "removed from Cyntro",
}

/** The readiness check's lapses: the account is ACTIVE, but its recorded consumer pass does not admit this read. */
export const PASS_LAPSE_COPY: Record<string, string> = {
  not_recorded: "Inventory is not shown yet: this account's readiness check has not been recorded.",
  stale: "Inventory is not shown: this account's readiness check is out of date and has to be recorded again.",
  generation_moved:
    "Inventory is not shown: this account's data moved to a newer version, and its readiness check has not been recorded for it yet.",
  suite_version_mismatch:
    "Inventory is not shown: this account's readiness check was recorded by another version of Cyntro.",
}

const HELD_COPY: Record<string, string> = {
  AUTHORITY_CHANGED:
    "This account's registration changed after the inventory was published, so it is not shown. A new publication is needed.",
}

const READINESS_HOLD = /^[0-9]{12}:CONSUMER_NOT_READY:(.+)$/

export const SCOPE_MISMATCH_COPY =
  "This account is not currently in this installation's serving scope, so its inventory is not shown."

function readinessCopy(reason: string): string | null {
  const [head, ...rest] = reason.split(":")
  const detail = rest.join(":")
  if (head === "lifecycle_not_active") {
    if (detail === "OFFBOARDED") return "This account was removed from Cyntro, so its inventory is not shown."
    const now = LIFECYCLE_NOW[detail]
    return now ? `Inventory appears once this account's data is active. Now: ${now}.` : null
  }
  if (head === "platform_not_ready") {
    const now = LIFECYCLE_NOW[detail]
    return now ? `Inventory is not shown: this installation's own account is not active yet (now: ${now}).` : null
  }
  return PASS_LAPSE_COPY[head] ?? null
}

export function heldCopy(reasonCode: string | null): string {
  const code = reasonCode ?? ""
  if (HELD_COPY[code]) return HELD_COPY[code]
  const readiness = READINESS_HOLD.exec(code)
  const worded = readiness ? readinessCopy(readiness[1]) : null
  return worded ?? `Inventory is held and not shown (${reasonCode ?? "no reason given"}).`
}

/** The words for any answer that is not data (empty for data, loading and republishing, which the view words itself). */
export function inventoryOutcomeCopy(model: InventoryModel): string {
  if (model.kind === "evidence") {
    if (model.state === "not_published") return "Inventory has not been published for this account yet."
    if (model.state === "held") return heldCopy(model.reasonCode)
    if (model.state === "stale") return "The published inventory is older than allowed, so it is not shown."
    return "The published inventory could not be validated, so it is not shown."
  }
  if (model.kind === "refused") {
    if (model.status === 401) return "Sign in again to view this inventory."
    if (model.status === 403 && model.reasonCode === "INVENTORY_SCOPE_MISMATCH") return SCOPE_MISMATCH_COPY
    if (model.status === 403) return "You are not authorized to view this account's inventory."
    return `The request was refused (${model.reasonCode ?? model.status}).`
  }
  if (model.kind === "unavailable") return `Inventory is unavailable right now (${model.reasonCode ?? model.status}).`
  return ""
}
