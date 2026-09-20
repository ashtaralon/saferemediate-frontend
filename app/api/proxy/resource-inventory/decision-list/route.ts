import { NextRequest, NextResponse } from "next/server"
import { inventoryListParams } from "@/lib/inventory-proxy-scope"
import { proxyProductDecisionInventory } from "@/lib/server/inventory-decision-proxy"

export const maxDuration = 30
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

/**
 * The Decision-backed inventory list for product surfaces (All Services). Always `envelope=true`;
 * there is no raw fallback on this route. Identity rules: `proxyProductDecisionInventory`.
 */
export async function GET(req: NextRequest) {
  const params = inventoryListParams(new URL(req.url).searchParams)
  if (!params) {
    return NextResponse.json(
      { status: "unavailable", reason_code: "ANALYST_ARGUMENTS_INVALID" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    )
  }
  return proxyProductDecisionInventory(req, "list", params)
}
