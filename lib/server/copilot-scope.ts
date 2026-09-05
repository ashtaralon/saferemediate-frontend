import type { NextRequest } from "next/server"

export const COPILOT_ALLOWED_SYSTEMS_ENV = "CYNTRO_ANALYST_ALLOWED_SYSTEMS"

export type CopilotScopeCode =
  | "COPILOT_SCOPE_READY"
  | "COPILOT_DEPLOYMENT_MODE_UNSUPPORTED"
  | "COPILOT_AUTHENTICATED_PRINCIPAL_UNAVAILABLE"
  | "COPILOT_SCOPE_CONFIGURATION_UNAVAILABLE"
  | "COPILOT_SCOPE_CONFIGURATION_INVALID"
  | "COPILOT_SYSTEM_SCOPE_REQUIRED"
  | "COPILOT_SYSTEM_SCOPE_FORBIDDEN"

export type CopilotScopeDecision =
  | {
      enabled: true
      code: "COPILOT_SCOPE_READY"
      reason: string
      status: 200
      systemName: string
    }
  | {
      enabled: false
      code: Exclude<CopilotScopeCode, "COPILOT_SCOPE_READY">
      reason: string
      status: 400 | 403 | 503
      systemName: null
    }

function denied(
  code: Exclude<CopilotScopeCode, "COPILOT_SCOPE_READY">,
  reason: string,
  status: 400 | 403 | 503,
): CopilotScopeDecision {
  return { enabled: false, code, reason, status, systemName: null }
}

function configuredSystems():
  | { ok: true; systems: string[] }
  | { ok: false; decision: CopilotScopeDecision } {
  const configured = process.env[COPILOT_ALLOWED_SYSTEMS_ENV]?.trim()
  if (!configured) {
    return {
      ok: false,
      decision: denied(
        "COPILOT_SCOPE_CONFIGURATION_UNAVAILABLE",
        "Free-form questions are disabled until an authorized system scope is configured.",
        503,
      ),
    }
  }

  const systems = [...new Set(configured.split(",").map((value) => value.trim()).filter(Boolean))]
  if (systems.length === 0 || systems.some((value) => value === "*")) {
    return {
      ok: false,
      decision: denied(
        "COPILOT_SCOPE_CONFIGURATION_INVALID",
        "Free-form questions are disabled because the authorized system scope is invalid.",
        503,
      ),
    }
  }

  return { ok: true, systems }
}

/**
 * Interim Phase-0 boundary for the existing Copilot route.
 *
 * The hosted deployment has only a shared password cookie, so it cannot
 * identify an end user and deliberately fails closed. Customer-resident
 * traffic must arrive through the OIDC-authenticated ALB and is narrowed by a
 * server-owned, non-wildcard allowlist. This is containment; policy-backed
 * per-user RequestScope enforcement still belongs to the Analyst identity
 * phase.
 */
export function authorizeCopilotSystem(
  request: NextRequest,
  requestedSystemName: unknown,
): CopilotScopeDecision {
  if (process.env.CYNTRO_DEPLOYMENT_MODE !== "CUSTOMER_RESIDENT") {
    return denied(
      "COPILOT_DEPLOYMENT_MODE_UNSUPPORTED",
      "Free-form questions require customer-resident authentication and an authorized system scope.",
      403,
    )
  }

  // The customer-resident task accepts UI traffic only from its private ALB.
  // Requiring both ALB OIDC headers prevents the application from treating a
  // shared UI cookie as end-user identity. The Phase-2 identity work must
  // independently verify the JWT and map its claims to policy-backed scope.
  const principal = request.headers.get("x-amzn-oidc-identity")?.trim()
  const oidcData = request.headers.get("x-amzn-oidc-data")?.trim()
  if (!principal || !oidcData) {
    return denied(
      "COPILOT_AUTHENTICATED_PRINCIPAL_UNAVAILABLE",
      "Free-form questions are disabled because authenticated user context is unavailable.",
      403,
    )
  }

  const configured = configuredSystems()
  if (!configured.ok) return configured.decision

  if (typeof requestedSystemName !== "string" || !requestedSystemName.trim()) {
    return denied(
      "COPILOT_SYSTEM_SCOPE_REQUIRED",
      "Select one authorized system before asking a free-form question.",
      400,
    )
  }

  const requested = requestedSystemName.trim()
  const canonical = configured.systems.find((systemName) => systemName === requested)
  if (!canonical) {
    return denied(
      "COPILOT_SYSTEM_SCOPE_FORBIDDEN",
      "The selected system is outside the authorized Copilot scope.",
      403,
    )
  }

  return {
    enabled: true,
    code: "COPILOT_SCOPE_READY",
    reason: "Authenticated user and system scope are available.",
    status: 200,
    systemName: canonical,
  }
}
