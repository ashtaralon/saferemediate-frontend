import { NextRequest, NextResponse } from "next/server"
import { proxyAccountRead } from "@/lib/server/account-read-proxy"

/** GET /api/proxy/accounts/{accountId}/resources -> backend GET /api/accounts/{accountId}/resources (account_resources/v1). */

export const dynamic = "force-dynamic"

type Context = { params: Promise<{ accountId: string }> }

export async function GET(request: NextRequest, context: Context): Promise<NextResponse> {
  const { accountId } = await context.params
  return proxyAccountRead(request, accountId, "resources", new Set(["resource_type", "limit", "cursor"]))
}
