"use client"

/**
 * Zoom0 Exfiltration details panel — jewel → out, with mandatory coverage
 * honesty when observed transport is unwired (PRD).
 */

import { useMemo } from "react"
import { Loader2, Network } from "lucide-react"
import { useRetryFetch } from "@/lib/use-retry-fetch"
import type { CrownJewelSummary } from "@/components/identity-attack-paths/types"
import type { ExfilPayload } from "./exfil-view-v3"

type ExfilPayloadWithCoverage = ExfilPayload & {
  coverage_badge?: string | null
  coverage_badge_text?: string | null
}

export function Zoom0ExfilLensPanel({
  systemName,
  jewel,
}: {
  systemName: string
  jewel: CrownJewelSummary
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

  const enabled = Boolean(systemName && jewelId)
  const { data, loading, error, retry } = useRetryFetch<ExfilPayloadWithCoverage>(
    enabled ? "/api/proxy/attack-chain/exfil-paths" : null,
    {
      fetchInit,
      refetchKey: `zoom0-exfil:${systemName}:${jewelId}`,
      maxRetries: 2,
      initialDelayMs: 1000,
    },
  )

  const coverageText =
    data?.coverage_badge_text ||
    (!data?.observed_exfil?.available
      ? "Observed transport not yet collected — showing configured egress only"
      : null)

  const network = data?.egress_lanes?.network ?? []

  return (
    <div
      className="rounded-lg border border-violet-200/60 bg-violet-50/40 px-3 py-2.5 dark:border-violet-500/30 dark:bg-violet-500/10"
      data-testid="zoom0-exfil-details"
    >
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-violet-800 dark:text-violet-300">
        <Network className="h-3.5 w-3.5" />
        Exfiltration — jewel → out
      </div>

      {loading && !data ? (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading egress…
        </p>
      ) : error && !data ? (
        <p
          className="mt-2 text-[11px] text-amber-700 dark:text-amber-400"
          data-empty-state="ERROR"
        >
          {error}{" "}
          <button type="button" onClick={retry} className="underline">
            Retry
          </button>
        </p>
      ) : data && data.ok === false ? (
        <p
          className="mt-2 text-[11px] text-amber-800 dark:text-amber-200"
          data-empty-state={data.error === "jewel_not_found" ? "NOT_FOUND" : "ERROR"}
        >
          {data.error === "jewel_not_found"
            ? "Jewel not found in the graph — egress is unknown, not empty."
            : data.message || data.error || "Exfil lookup failed."}{" "}
          <button type="button" onClick={retry} className="underline">
            Retry
          </button>
        </p>
      ) : (
        <>
          {coverageText ? (
            <p
              className="mt-2 rounded border border-amber-200/80 bg-amber-50/80 px-2 py-1.5 text-[11px] text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
              data-testid="zoom0-exfil-coverage-badge"
            >
              {coverageText}
            </p>
          ) : null}

          {network.length === 0 ? (
            <p
              className="mt-2 text-[11px] text-muted-foreground"
              data-empty-state="READY_ZERO"
            >
              No configured network egress doors for this jewel.
            </p>
          ) : (
            <ul className="mt-2 space-y-1">
              {network.slice(0, 5).map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-baseline gap-x-2 text-[11px] font-mono"
                >
                  <span className="text-foreground">
                    {item.name || item.kind || "egress"}
                  </span>
                  <span className="text-muted-foreground">
                    {item.provenance === "observed" ? "observed" : "configured"}
                    {item.routed === false ? " · available, not selected" : ""}
                  </span>
                  {item.route_target_service || item.route_destination_cidr ? (
                    <span className="truncate text-muted-foreground">
                      {item.route_target_service || item.route_destination_cidr}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {data?.accessors && data.accessors.length > 0 ? (
            <p className="mt-2 text-[10px] text-muted-foreground">
              {data.accessors.length} accessor
              {data.accessors.length === 1 ? "" : "s"} can reach this jewel
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}
