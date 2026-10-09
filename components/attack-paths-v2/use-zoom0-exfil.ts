"use client"

import { useMemo } from "react"
import { useRetryFetch } from "@/lib/use-retry-fetch"
import type { CrownJewelSummary } from "@/components/identity-attack-paths/types"
import type { ExfilPayload } from "./exfil-view-v3"

export type ExfilPayloadWithCoverage = ExfilPayload & {
  coverage_badge?: string | null
  coverage_badge_text?: string | null
}

export function useZoom0Exfil({
  systemName,
  jewel,
  enabled,
  systemKey = null,
}: {
  systemName: string
  jewel: CrownJewelSummary
  enabled: boolean
  /** A7 B5: the system's KEY when the page was opened by key -- the exfil body's optional ``system_key`` names ONE
   *  system. Absent, the request body is byte-identical to before. */
  systemKey?: string | null
}) {
  const jewelId =
    jewel.canonical_id ?? (jewel.id.startsWith("arn:") ? jewel.id : jewel.name)
  const requestBody = useMemo(
    () =>
      JSON.stringify({
        system_name: systemName,
        ...(systemKey ? { system_key: systemKey } : {}),
        jewel_id: jewelId,
        include_capable: true,
        include_observed: true,
        max_destinations: 20,
        include_atlas: false,
        // Zoom0 needs the path topology already carried by the base payload.
        // Deep remediation/ATLAS enrichment belongs to the full view and can
        // exceed the proxy budget on large estates.
        include_details: false,
      }),
    [systemName, jewelId, systemKey],
  )
  const fetchInit = useMemo<RequestInit>(
    () => ({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: requestBody,
    }),
    [requestBody],
  )

  return useRetryFetch<ExfilPayloadWithCoverage>(
    enabled ? "/api/proxy/attack-chain/exfil-paths" : null,
    {
      fetchInit,
      refetchKey: systemKey ? `zoom0-exfil:${systemName}:${jewelId}:key=${systemKey}` : `zoom0-exfil:${systemName}:${jewelId}`,
      maxRetries: 2,
      initialDelayMs: 1000,
    },
  )
}
