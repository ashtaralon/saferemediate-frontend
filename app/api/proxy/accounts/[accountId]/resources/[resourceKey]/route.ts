import { NextRequest, NextResponse } from "next/server"
import { proxyAccountRead } from "@/lib/server/account-read-proxy"

/** GET /api/proxy/accounts/{accountId}/resources/{resourceKey} -> the backend's drawer read of one BASIC row. */

export const dynamic = "force-dynamic"

/** The backend's opaque resource key: "k1." + base64url (cyntro_data/resource_discovery/identity.py). */
const RESOURCE_KEY = /^k1\.[A-Za-z0-9_-]{1,2800}$/

type Context = { params: Promise<{ accountId: string; resourceKey: string }> }

function refuse(status: number, code: string): NextResponse {
  return NextResponse.json({ error: code }, { status, headers: { "Cache-Control": "no-store" } })
}

export async function GET(request: NextRequest, context: Context): Promise<NextResponse> {
  const { accountId, resourceKey } = await context.params
  if (typeof resourceKey !== "string" || !RESOURCE_KEY.test(resourceKey)) return refuse(400, "PROXY_RESOURCE_KEY_INVALID")
  return proxyAccountRead(request, accountId, `resources/${resourceKey}`, new Set(["resource_type"]))
}
