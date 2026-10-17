/**
 * PENDING CAPTURES -- NOT producer output.
 *
 * The listing's per-account `data_activation` for each stage of automatic onboarding, written to the contract the
 * coordinator fixed on 2026-10-10 (relayed from Alon / Codex) because the backend that produces it is being built now. When
 * the backend worker commits its JSON captures of real route output for each stage, every export here is replaced by those
 * captures and this file is deleted; until then NOTHING in it is a capture, and every test that uses it says so in its file
 * name (`*.pending-captures.test.tsx`).
 *
 * Fields, and only these: the option-A ones -- state, policy, active, can_request, blocked_by, request {request_id, status,
 * requested_by {display}, requested_at, completed_at, outcome, refusals} -- plus consent, stage, stage_detail, stage_since,
 * census {state, detail} and inventory {state, detail}. Codes are the backend's own vocabulary (cyntro_data/accounts/
 * data_activation.py at saferemediate-backend 2343b3a2: blocked_by, outcomes; consume/onboarding.py: permit refusals).
 * There are no counts here: the "Collecting (n/m)" line reads the producer's own first_inventory, never a number from this file.
 */
import type { DataActivation, DataActivationRequest } from "@/lib/account-admin"

/** The producer's own operator name (settings-c-producer capture 41's by_display). */
export const OPERATOR = "Alice Operator"

export function pendingRequest(status: string, at: string, extra: Partial<DataActivationRequest> = {}): DataActivationRequest {
  return {
    request_id: "pending-capture-request-1",
    status,
    requested_by: { display: OPERATOR },
    requested_at: at,
    completed_at: null,
    outcome: null,
    refusals: [],
    ...extra,
  }
}

const NOT_YET = { state: "pending", detail: null }
const READY = { state: "ready", detail: null }

function activation(fields: Partial<DataActivation>): DataActivation {
  return {
    state: null,
    policy: "STAGE_ONLY",
    active: false,
    can_request: false,
    blocked_by: [],
    request: null,
    consent: "collect_and_show",
    stage: null,
    stage_detail: [],
    stage_since: null,
    census: NOT_YET,
    inventory: NOT_YET,
    ...fields,
  }
}

/** One account (consent collect_and_show, the informed confirmation) at each stage of automatic onboarding, entered at `since`. */
export const automatic = {
  collecting: (since: string) => activation({ state: "BOOTSTRAPPING", stage: "collecting", stage_since: since,
    blocked_by: ["first_inventory_not_collected"] }),
  staging: (since: string) => activation({ state: "SHADOW", stage: "staging", stage_since: since }),
  checking: (since: string) => activation({ state: "SHADOW", stage: "checking", stage_since: since }),
  activating: (since: string) => activation({ state: "READY", policy: "AUTO_ACTIVATE_WHEN_READY", stage: "activating", stage_since: since }),
  publishing: (since: string) => activation({ state: "ACTIVE", policy: "AUTO_ACTIVATE_WHEN_READY", active: true, stage: "publishing",
    stage_since: since, blocked_by: ["already_active"] }),
  active: (since: string) => activation({ state: "ACTIVE", policy: "AUTO_ACTIVATE_WHEN_READY", active: true, stage: "active",
    stage_since: since, blocked_by: ["already_active"], census: READY, inventory: READY }),
  held: (since: string, codes: string[]) => activation({ state: "VALIDATION_HELD", stage: "held", stage_since: since, stage_detail: codes,
    census: { state: "held", detail: codes }, inventory: { state: "held", detail: codes } }),
}

/** An account connected for collection only, before the informed confirmation existed: its data waits for someone to ask. */
export function legacy(since: string, fields: Partial<DataActivation> = {}): DataActivation {
  return activation({ state: "SHADOW", consent: "collect_only", stage: "awaiting_consent", stage_since: since, can_request: true, ...fields })
}

/** The option-A shape alone (a backend before automatic onboarding): no consent, stage, census or inventory. */
export function optionA(fields: Partial<DataActivation>): DataActivation {
  return { state: "READY", policy: "STAGE_ONLY", active: false, can_request: false, blocked_by: [], request: null, ...fields }
}
