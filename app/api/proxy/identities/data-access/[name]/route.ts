import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { selectBackendProof } from "@/lib/server/backend-proof"
import {
  iamIdentityArnParts,
  identityDataAccessFromEnvelope,
  identityDataAccessNotGiven,
  type IdentityDataAccessBody,
} from "@/lib/identity-data-access"

export const dynamic = "force-dynamic"

// One identity's data access, answered by the backend Decision operation `identity.data_access`
// (GET /api/identity-data-access). The frontend reads graph data only through the backend API and
// connects to no graph database. The backend decides tenant and account from the request's own
// verified proof; the ARN only says which identity inside that scope is meant, because a bare role
// name is not unique across accounts. See lib/identity-data-access.ts for what is shown and why.

const NO_STORE = { "Cache-Control": "no-store" }
const TYPED_CODE = /^[A-Z][A-Z0-9_]{2,127}$/
// Proof and scope refusals keep their status; any other backend failure is a gateway failure here.
const PASSED_THROUGH = new Set([401, 403, 503])

function respond(status: number, body: IdentityDataAccessBody) {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

function typedCode(body: unknown): string | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return null
  const record = body as Record<string, unknown>
  const candidate = record.error_code ?? record.reason_code
  return typeof candidate === "string" && TYPED_CODE.test(candidate) ? candidate : null
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params
  const arn = req.nextUrl.searchParams.get("arn")?.trim() ?? ""
  if (!arn) return respond(400, identityDataAccessNotGiven("failed", "IDENTITY_ARN_REQUIRED"))
  if (iamIdentityArnParts(arn)?.name !== name) {
    return respond(400, identityDataAccessNotGiven("failed", "IDENTITY_ARN_NAME_MISMATCH"))
  }

  const proof = await selectBackendProof(req)
  if (!proof.ok) return respond(proof.status, identityDataAccessNotGiven("failed", proof.code))

  let response: Response
  try {
    response = await fetch(
      `${getBackendBaseUrl()}/api/identity-data-access?${new URLSearchParams({ identity_arn: arn }).toString()}`,
      { cache: "no-store", headers: { Accept: "application/json", ...proof.headers }, signal: AbortSignal.timeout(25000) },
    )
  } catch {
    // Unreachable or timed out: never answered as if the identity had no data access.
    return respond(502, identityDataAccessNotGiven("failed", "IDENTITY_DATA_ACCESS_UNAVAILABLE"))
  }

  const text = await response.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = null
  }
  if (!response.ok) {
    const fallback = response.status === 401
      ? proof.untypedUnauthorizedCode ?? "IDENTITY_DATA_ACCESS_UNAUTHENTICATED"
      : "IDENTITY_DATA_ACCESS_UNAVAILABLE"
    const status = PASSED_THROUGH.has(response.status) ? response.status : 502
    return respond(status, identityDataAccessNotGiven("failed", typedCode(body) ?? fallback))
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return respond(502, identityDataAccessNotGiven("failed", "IDENTITY_DATA_ACCESS_INVALID_RESPONSE"))
  }
  // A Decision answer is HTTP 200 whether it is ready or a registered refusal; the body says which.
  return respond(200, identityDataAccessFromEnvelope(body, arn))
}
