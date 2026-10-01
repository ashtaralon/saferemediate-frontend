import { NextRequest } from "next/server"
import { proxyPendingTagDecisionRead } from "@/lib/server/pending-tag-decision-proxy"

// The decision request recorded for one pending tag: queued -> running -> applied | refused | failed.
export async function GET(_request: NextRequest, context: { params: Promise<{ pendingId: string }> }) {
  const { pendingId } = await context.params
  return proxyPendingTagDecisionRead(encodeURIComponent(pendingId))
}
