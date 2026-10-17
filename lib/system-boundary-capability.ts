/**
 * The wizard's capability read (A7 rev 4): a strict reader of the backend's `system_boundary_wizard_capability/v1` answer
 * (GET /api/system-boundary/wizard/capability, through the authoring proxy).
 *
 * The page reads it BEFORE it shows the wizard's binding and per-resource steps: the install must have the wizard on, and
 * the backend must serve the save envelope and the completed-snapshot reader contract this build was made for. Anything
 * else -- off, another level, another contract, a refusal, a malformed answer -- leaves the wizard's new steps hidden, with
 * the reason said. Validation mirrors backend unified/system_boundary_wizard.py; nothing here throws.
 */

export const CAPABILITY_CONTRACT = "system_boundary_wizard_capability/v1"
/** The save envelope levels this build speaks (backend unified/system_boundary_plan.SAVE_ENVELOPE_LEVEL) -- exactly these: 2 = +
 * bindings / resource decisions, 3 = + a plural create (`deployments`). lib/release-contract.json requires 2 and accepts 3,
 * and the release builder and verify refuse a backend publishing outside them (S1b, SW-S1B-20261013-02). */
export const SUPPORTED_SAVE_ENVELOPE_LEVELS: readonly number[] = [2, 3]
/** The lowest of them: what this build requires, and the single-Deployment shape every save it sends today speaks. */
export const REQUIRED_SAVE_ENVELOPE_LEVEL = 2
/** The level whose backend takes a plural create; only there may this build send `deployments`. */
export const PLURAL_SAVE_ENVELOPE_LEVEL = 3

/** A level this build speaks; any other (older, newer, unknown) is not. */
export function isSupportedSaveEnvelopeLevel(level: unknown): level is number {
  return typeof level === "number" && SUPPORTED_SAVE_ENVELOPE_LEVELS.includes(level)
}
/** The completed-snapshot reader contract the declarations view this build reads is served under. */
export const REQUIRED_READER_CONTRACT = "implicit-snapshot-v2"
export const WIZARD_DISABLED = "WIZARD_DISABLED"
export const SAVE_LEVEL_MISMATCH = "SAVE_LEVEL_MISMATCH"
export const READER_CONTRACT_MISMATCH = "READER_CONTRACT_MISMATCH"
export const RESPONSE_MALFORMED = "RESPONSE_MALFORMED"
export const RESPONSE_NOT_CONTRACT = "RESPONSE_NOT_CONTRACT"
/** A backend that predates the wizard answers its framework's 404: the wizard is simply not offered, never "not authorized". */
export const CAPABILITY_ROUTE_ABSENT = "CAPABILITY_ROUTE_ABSENT"

export interface WizardCapability {
  kind: "enabled" | "disabled"
  status: number
  /** Why the wizard's new steps are not offered (null when enabled). */
  reasonCode: string | null
  saveEnvelopeLevel: number
  readerContract: string
}

export interface CapabilityUnavailable {
  kind: "unavailable" | "refused"
  status: number
  reasonCode: string | null
}

export type ParsedCapability = WizardCapability | CapabilityUnavailable

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** The ONE strict reading: the answer is always 200 for a verified reader; a refusal is the route's 4xx detail. */
export function parseCapabilityResponse(status: number, body: unknown): ParsedCapability {
  if (!isObject(body)) return { kind: "unavailable", status, reasonCode: RESPONSE_NOT_CONTRACT }
  if (body.contract !== CAPABILITY_CONTRACT) {
    if (status === 404 && !(isObject(body.detail) && typeof body.detail.code === "string")) {
      return { kind: "unavailable", status, reasonCode: CAPABILITY_ROUTE_ABSENT }
    }
    if (status === 401 || status === 403) {
      const code = isObject(body.detail) && typeof body.detail.code === "string" ? body.detail.code : null
      return { kind: "refused", status, reasonCode: code }
    }
    return { kind: "unavailable", status, reasonCode: RESPONSE_NOT_CONTRACT }
  }
  if (status !== 200 || typeof body.enabled !== "boolean") return { kind: "unavailable", status, reasonCode: RESPONSE_MALFORMED }
  const level = body.save_envelope_level
  const reader = body.reader_contract
  if (typeof level !== "number" || !Number.isSafeInteger(level) || level < 1 || typeof reader !== "string" || !reader) {
    return { kind: "unavailable", status, reasonCode: RESPONSE_MALFORMED }
  }
  if (body.enabled ? body.reason_code !== null : body.reason_code !== WIZARD_DISABLED) {
    return { kind: "unavailable", status, reasonCode: RESPONSE_MALFORMED }
  }
  const base = { status, saveEnvelopeLevel: level, readerContract: reader }
  if (!body.enabled) return { kind: "disabled", reasonCode: WIZARD_DISABLED, ...base }
  // On, but not the levels this build writes and reads: the steps stay hidden rather than send what the backend refuses.
  if (!isSupportedSaveEnvelopeLevel(level)) return { kind: "disabled", reasonCode: SAVE_LEVEL_MISMATCH, ...base }
  if (reader !== REQUIRED_READER_CONTRACT) return { kind: "disabled", reasonCode: READER_CONTRACT_MISMATCH, ...base }
  return { kind: "enabled", reasonCode: null, ...base }
}

/** Whether this build may send a plural create: the wizard on, at the plural level. Anything else keeps the
 *  single-Deployment shape -- never `deployments` -- exactly as at level 2. */
export function pluralCreateOffered(capability: ParsedCapability): boolean {
  return capability.kind === "enabled" && capability.saveEnvelopeLevel === PLURAL_SAVE_ENVELOPE_LEVEL
}

export function capabilitySentence(capability: ParsedCapability): string | null {
  if (capability.kind === "enabled") return null
  // Unreadable (an older backend, the network, a malformed answer): the wizard is not offered, and the account page does
  // not speak for the backend's state -- the capability read is not this page's subject.
  if (capability.kind === "unavailable") return null
  if (capability.kind === "refused") {
    return capability.status === 401 ? "Sign in again to use the system wizard." : "You are not authorized to use the system wizard."
  }
  if (capability.reasonCode === WIZARD_DISABLED) return "Binding stacks and per-resource decisions are not turned on for this install."
  return `This page and the backend disagree on the save format (${capability.reasonCode}); binding stacks is not offered.`
}

export const CAPABILITY_PATH = "/api/proxy/system-boundary/wizard/capability"

export async function fetchCapability(signal?: AbortSignal): Promise<{ status: number; body: unknown }> {
  try {
    const response = await fetch(CAPABILITY_PATH, { cache: "no-store", signal })
    let body: unknown = null
    try {
      body = await response.json()
    } catch {
      body = null
    }
    return { status: response.status, body }
  } catch {
    return { status: 0, body: null }
  }
}
