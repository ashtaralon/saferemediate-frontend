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
}: {
  systemName: string
  jewel: CrownJewelSummary
  enabled: boolean
}) {
  const jewelId =
    jewel.canonical_id ?? (jewel.id.startsWith("arn:") ? jewel.id : jewel.name)
  const requestBody = useMemo(
    () =>
      JSON.stringify({
        system_name: systemName,
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
    [systemName, jewelId],
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
      refetchKey: `zoom0-exfil:${systemName}:${jewelId}`,
      // §11 retry budget: one retry, 15s per attempt, then the honest
      // "timed out — backend may be cold-starting; Retry" state.
      maxRetries: 1,
      timeoutMs: 15_000,
      initialDelayMs: 1000,
    },
  )
}
