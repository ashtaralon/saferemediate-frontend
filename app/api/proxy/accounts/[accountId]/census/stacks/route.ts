import { NextRequest, NextResponse } from "next/server"
import { proxyAccountRead } from "@/lib/server/account-read-proxy"

/**
 * GET /api/proxy/accounts/{accountId}/census/stacks -> backend GET /api/accounts/{accountId}/census/stacks (A7 rev 4 C-A,
 * contract account_census_stacks_read/v1). Read only; the inventory proxy's rules (lib/server/account-read-proxy.ts). The
 * one query key is the route's own Region filter.
 */

export const dynamic = "force-dynamic"

const FORWARDED_QUERY: ReadonlySet<string> = new Set(["region"])

type Context = { params: Promise<{ accountId: string }> }

export async function GET(request: NextRequest, context: Context): Promise<NextResponse> {
  const { accountId } = await context.params
  return proxyAccountRead(request, accountId, "census/stacks", FORWARDED_QUERY)
}
