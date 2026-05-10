/**
 * Operator identity capture for Decision Contract §7 override audit.
 *
 * Pre-SSO pilot stage: we don't have an authenticated user context to
 * pull from. Hardcoding `overridden_by: 'operator'` across all modals
 * (which is what we did before this module) destroys the audit trail —
 * every override looks the same in the audit log, defeating the
 * "who reviewed this?" question that compliance asks.
 *
 * This module fixes that with self-attestation:
 *
 *   1. On first override, the modal asks the operator for their
 *      identity (name + optional email). Recorded as
 *      identity_source: "self_attested" so compliance knows it's
 *      operator-typed, not IDP-verified.
 *
 *   2. Subsequent overrides pre-populate from localStorage. Operator
 *      can change it at any time (e.g., shared workstation handoff).
 *
 *   3. When SSO/auth lands, `useOperatorIdentity()` will return
 *      identity_source: "auth_verified" instead. The override modals
 *      don't need to change — they just keep calling this hook.
 *
 * Schema in localStorage (key: "cyntro.operator.identity"):
 *   { name: string, email?: string, captured_at: ISO8601 }
 *
 * Schema in the override_lineage payload sent to backend:
 *   overridden_by: name<+email-if-present>
 *   _identity_source: "self_attested" | "auth_verified"
 */

const STORAGE_KEY = "cyntro.operator.identity"

export interface OperatorIdentity {
  name: string
  email?: string
  captured_at: string
}

export interface OperatorIdentityResolved {
  /** Display string suitable for the audit log's `overridden_by` field. */
  identifier: string
  /** Raw fields so the modal can re-show them in the form. */
  name: string
  email?: string
  /** Where this identity came from. Always "self_attested" pre-SSO. */
  source: "self_attested" | "auth_verified" | "anonymous"
  /** Whether the operator was prompted this session. */
  is_first_capture: boolean
}

function safeLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function readOperatorIdentity(): OperatorIdentity | null {
  const ls = safeLocalStorage()
  if (!ls) return null
  try {
    const raw = ls.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (
      parsed &&
      typeof parsed.name === "string" &&
      parsed.name.trim().length > 0
    ) {
      return {
        name: String(parsed.name).trim(),
        email: parsed.email ? String(parsed.email).trim() : undefined,
        captured_at: parsed.captured_at || new Date().toISOString(),
      }
    }
  } catch {
    // Corrupt JSON — fall through to null.
  }
  return null
}

export function writeOperatorIdentity(
  name: string,
  email?: string,
): OperatorIdentity {
  const id: OperatorIdentity = {
    name: name.trim(),
    email: email?.trim() || undefined,
    captured_at: new Date().toISOString(),
  }
  const ls = safeLocalStorage()
  if (ls) {
    try {
      ls.setItem(STORAGE_KEY, JSON.stringify(id))
    } catch {
      // Quota or privacy mode — just continue with in-memory only.
    }
  }
  return id
}

export function clearOperatorIdentity(): void {
  const ls = safeLocalStorage()
  if (ls) {
    try {
      ls.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
  }
}

/**
 * Compose the audit `overridden_by` string from name + email.
 *
 *   "Alice Operator <alice@company.com>" when email present
 *   "Alice Operator"                     when email absent
 *
 * Format chosen to match RFC-5322 mailbox so compliance pipelines
 * can parse it without bespoke logic.
 */
export function composeOverriddenBy(name: string, email?: string): string {
  const cleanName = name.trim()
  const cleanEmail = email?.trim()
  if (cleanEmail) return `${cleanName} <${cleanEmail}>`
  return cleanName
}

/**
 * Resolve operator identity for an override flow.
 *
 * Returns:
 *   { identifier, source, is_first_capture } when identity is known.
 *   When no identity is stored (pre-SSO + first session), the modal
 *   should prompt with <OperatorIdentityField> below. Until the
 *   operator fills it in, `identifier` is "anonymous" and `source`
 *   is "anonymous" — the override flow can still proceed but the
 *   record will be tagged as un-attested.
 */
export function resolveOperatorIdentity(): OperatorIdentityResolved {
  const stored = readOperatorIdentity()
  if (stored) {
    return {
      identifier: composeOverriddenBy(stored.name, stored.email),
      name: stored.name,
      email: stored.email,
      source: "self_attested",
      is_first_capture: false,
    }
  }
  return {
    identifier: "anonymous",
    name: "",
    email: undefined,
    source: "anonymous",
    is_first_capture: true,
  }
}
