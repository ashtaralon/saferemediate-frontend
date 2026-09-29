import { NextResponse } from "next/server"

import {
  LEGACY_HELD_STATUS,
  legacyHeldBody,
  legacyMutationHold,
  type LegacyMutationFamily,
} from "@/lib/legacy-mutation-hold"

/**
 * Server-side refusal for a proxy that forwards a held legacy mutation. Mirrors the LP apply proxy's refusals
 * (lib/server/lp-mutation-proxy.ts): a typed code, every write count zero, origin "proxy", no-store -- and no backend
 * request. Returns null only when the family's compiled constant releases it. Call it before reading the body.
 */
export function refuseHeldLegacyMutation(family: LegacyMutationFamily): NextResponse | null {
  const hold = legacyMutationHold(family)
  if (!hold) return null
  return NextResponse.json(
    { ...legacyHeldBody(hold), origin: "proxy" },
    { status: LEGACY_HELD_STATUS, headers: { "Cache-Control": "no-store" } },
  )
}
