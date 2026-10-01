import { NextRequest } from "next/server"
import { proxyPendingTagDecision } from "@/lib/server/pending-tag-decision-proxy"

export async function POST(request: NextRequest) {
  return proxyPendingTagDecision(request, "approve")
}
