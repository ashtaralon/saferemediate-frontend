import type { NextRequest } from "next/server"

import { POST as managedPost } from "@/app/api/proxy/sync/start/route"

/** @deprecated Use /api/proxy/sync/start. Kept as a safe compatibility alias. */
export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export async function POST(request: NextRequest) {
  // Forward the request, not just the call: the managed route reads a
  // `sources` lane selection off the query string, and an alias that dropped
  // it would quietly downgrade the round to the Inspector default.
  return managedPost(request)
}
