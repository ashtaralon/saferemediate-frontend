import { NextRequest } from "next/server"
import { proxyAuthoring } from "@/lib/server/authoring-proxy"

export const dynamic = "force-dynamic"

// The System Boundary authoring routes (lib/server/authoring-proxy.ts). The allowlist is matched on the
// request's own normalized pathname there, never on decoded segments, so this catch-all forwards nothing else.
async function run(request: NextRequest) {
  return proxyAuthoring(request)
}

export const GET = run
export const POST = run
// Onboarding G2: a setup's intent revision (PUT /setup/<uuid>) -- the allowlist names the one route that takes it.
export const PUT = run
