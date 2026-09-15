import { NextRequest, NextResponse } from "next/server"
import { operatorOidcConfig, readOperatorSession } from "@/lib/server/operator-session"

export const dynamic = "force-dynamic"

/** Sign-in state for the UI. Never returns a token. */
export async function GET(request: NextRequest) {
  const residentAlb = process.env.CYNTRO_DEPLOYMENT_MODE === "CUSTOMER_RESIDENT"
  const config = operatorOidcConfig()
  const session = residentAlb ? null : await readOperatorSession(request, config)
  return NextResponse.json(
    {
      mode: residentAlb ? "CUSTOMER_IDP_ALB" : "HOSTED_OIDC",
      configured: residentAlb || Boolean(config),
      signed_in: residentAlb ? Boolean(request.headers.get("x-amzn-oidc-data")) : Boolean(session),
      operator: session ? { name: session.name, email: session.email, expires_at: new Date(session.expiresAt * 1000).toISOString() } : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
