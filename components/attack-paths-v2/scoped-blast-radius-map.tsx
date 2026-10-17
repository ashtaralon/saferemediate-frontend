"use client"

import { useAccountScope } from "@/lib/account-scope-context"
import { BlastRadiusMap } from "./blast-radius-map"
import { normalizeBlastRadiusScope } from "./blast-radius-scope"

/**
 * The standalone /blast-radius-map/[system] page rendered <BlastRadiusMap> with no scope, so
 * buildBlastRadiusUrl returned null and the page never fetched (integration matrix, 2026-09-30).
 * Bind it to the operator's active Estate scope exactly as the attacker shell and the
 * business-system view do: the backend refuses to infer scope, and a cached compose from another
 * account/region would be a cross-tenant paint.
 */
export function ScopedBlastRadiusMap({ systemName }: { systemName: string }) {
  const scope = normalizeBlastRadiusScope(useAccountScope())
  return <BlastRadiusMap systemName={systemName} scope={scope} />
}
