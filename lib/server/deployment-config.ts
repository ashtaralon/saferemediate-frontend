import { siteSessionConfigProblems } from "@/lib/server/site-session"

type Env = Record<string, string | undefined>

/**
 * Every required-secret problem for this deployment's mode, as names and reasons only -- never
 * values -- so a missing secret stops the server at startup instead of surfacing later as a
 * lockout or a silently unauthenticated backend call.
 *
 * - CUSTOMER_RESIDENT: the private ALB's OIDC action authenticates users, and the backend is reached
 *   with the service token, so CYNTRO_SERVICE_TOKEN and BACKEND_URL_OVERRIDE are required.
 * - Hosted (unset or HOSTED): the sealed site session gates the console, so the site-session
 *   problems apply. CYNTRO_SERVICE_TOKEN stays optional here on purpose: an unset token is the
 *   documented pre-rollout state (lib/server/customer-backend-auth.ts), not a misconfiguration.
 * - Anything else is refused. Middleware treats every value but the exact string
 *   "CUSTOMER_RESIDENT" as hosted, so a typo would silently change which gate applies.
 */
export function deploymentConfigProblems(env: Env = process.env): string[] {
  const raw = env.CYNTRO_DEPLOYMENT_MODE
  const mode = raw === undefined || raw === "" ? "HOSTED" : raw
  if (mode !== "HOSTED" && mode !== "CUSTOMER_RESIDENT") {
    return ["CYNTRO_DEPLOYMENT_MODE has an unrecognised value: expected HOSTED or CUSTOMER_RESIDENT"]
  }
  if (mode === "CUSTOMER_RESIDENT") {
    const problems: string[] = []
    if (!env.CYNTRO_SERVICE_TOKEN?.trim()) {
      problems.push("CYNTRO_SERVICE_TOKEN is not set: backend requests would be refused by its auth boundary")
    }
    if (!env.BACKEND_URL_OVERRIDE?.trim()) {
      problems.push("BACKEND_URL_OVERRIDE is not set: a customer install must name its own backend")
    }
    return problems
  }
  return siteSessionConfigProblems(env)
}

/** Throw, naming every problem at once, when this deployment is missing a required secret. */
export function assertDeploymentConfig(env: Env = process.env): void {
  const problems = deploymentConfigProblems(env)
  if (problems.length > 0) {
    throw new Error(`Deployment configuration refused:\n- ${problems.join("\n- ")}`)
  }
}
