import { NextRequest, NextResponse } from "next/server"
import { proxyAccountRead } from "@/lib/server/account-read-proxy"

/**
 * GET /api/proxy/accounts/{accountId}/census -> backend GET /api/accounts/{accountId}/census (A7 S1c,
 * contract account_census_read/v1). Read only; the inventory proxy's rules (lib/server/account-read-proxy.ts). The query
 * keys are the route's own filters and its cursor page: resource_type, service, depth, source, region, limit, cursor.
 */

export const dynamic = "force-dynamic"

const FORWARDED_QUERY: ReadonlySet<string> = new Set(["resource_type", "service", "depth", "source", "region", "limit", "cursor"])

type Context = { params: Promise<{ accountId: string }> }

export async function GET(request: NextRequest, context: Context): Promise<NextResponse> {
  const { accountId } = await context.params
  return proxyAccountRead(request, accountId, "census", FORWARDED_QUERY)
}
