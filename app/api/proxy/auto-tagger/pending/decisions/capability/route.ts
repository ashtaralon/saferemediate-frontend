import { proxyPendingTagDecisionRead } from "@/lib/server/pending-tag-decision-proxy"

// Whether approve / reject can be done on this deployment, how (direct | request), and if not, why.
export async function GET() {
  return proxyPendingTagDecisionRead("capability")
}
