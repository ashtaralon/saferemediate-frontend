"use client"

/**
 * Zoom0 Exfiltration details panel — jewel → out, with mandatory coverage
 * honesty when observed transport is unwired (PRD).
 */

import { useMemo } from "react"
import { ArrowRight, Cloud, KeyRound, Loader2, Network, Route, Server } from "lucide-react"
import { useRetryFetch } from "@/lib/use-retry-fetch"
import type { CrownJewelSummary } from "@/components/identity-attack-paths/types"
import type { ExfilPayload } from "./exfil-view-v3"

function readableAccessor(name: string, id: string, type: string): string {
  const value = name || id
  if (/^[a-f0-9]{32,}$/i.test(value)) {
    const label = type && type !== "Unknown" ? type : "External principal"
    return `${label} · ${value.slice(0, 10)}…`
  }
  return value
}

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

  const paths = data?.paths ?? []
  const identityLane = data?.egress_lanes?.identity
  const propagationLane = data?.egress_lanes?.data_propagation

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

          {paths.length === 0 ? (
            <p
              className="mt-2 text-[11px] text-muted-foreground"
              data-empty-state="READY_ZERO"
            >
              No accessor-to-exit path was computed for this jewel. Review
              coverage before treating this as contained.
            </p>
          ) : (
            <div className="mt-2 space-y-2" data-testid="zoom0-exfil-paths">
              {paths.slice(0, 4).map((path) => {
                const workload = path.workload_sample?.[0] ?? null
                const gateway = path.gateway_sample?.find((item) => item.routed !== false) ?? path.gateway_sample?.[0] ?? null
                const publicEgressRules =
                  path.remediation?.sg?.groups?.reduce(
                    (total, group) => total + (group.public_egress_rules?.length ?? 0),
                    0,
                  ) ?? 0
                const sourceVpcRestricted =
                  path.remediation?.data_access?.has_source_vpc_condition
                return (
                  <div
                    key={path.path_id}
                    className="rounded-md border border-violet-200/70 bg-background/80 p-2 dark:border-violet-500/30"
                  >
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                      <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                        <KeyRound className="h-3 w-3" />
                        <span title={path.accessor_name}>
                          {readableAccessor(
                            path.accessor_name,
                            path.accessor_id,
                            path.accessor_type,
                          )}
                        </span>
                      </span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span className="inline-flex items-center gap-1 text-foreground">
                        {workload ? <Server className="h-3 w-3" /> : <Cloud className="h-3 w-3" />}
                        {workload?.name || "external API client"}
                      </span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span className="inline-flex items-center gap-1 font-semibold text-violet-800 dark:text-violet-300">
                        <Route className="h-3 w-3" />
                        {gateway?.kind || path.channel_label}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                      <span>
                        Access: {path.accessor_provenance === "observed" ? "observed" : "configured"}
                      </span>
                      {gateway ? (
                        <>
                          <span>
                            Effective route: {gateway.routed === false ? "not selected" : "selected"}
                            {gateway.route_destination_cidr
                              ? ` · ${gateway.route_destination_cidr}`
                              : gateway.route_target_service
                                ? ` · ${gateway.route_target_service}`
                                : ""}
                          </span>
                          {gateway.route_table?.id ? (
                            <span>
                              Route table: {gateway.route_table.name || gateway.route_table.id}
                              {gateway.route_table.is_main === true ? " · main" : ""}
                              {gateway.route_table.route_count != null
                                ? ` · ${gateway.route_table.route_count} routes`
                                : ""}
                            </span>
                          ) : null}
                        </>
                      ) : path.channel === "direct_api" ? (
                        <span>VPC route and SG controls do not constrain this channel</span>
                      ) : (
                        <span>No effective gateway resolved</span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-[10px]">
                      {publicEgressRules > 0 ? (
                        <span className="rounded border border-red-300/70 bg-red-50 px-1.5 py-0.5 text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
                          {publicEgressRules} public SG egress rule{publicEgressRules === 1 ? "" : "s"}
                        </span>
                      ) : null}
                      {sourceVpcRestricted === false ? (
                        <span className="rounded border border-amber-300/70 bg-amber-50 px-1.5 py-0.5 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                          resource policy does not require source VPC
                        </span>
                      ) : sourceVpcRestricted === true ? (
                        <span className="rounded border border-emerald-300/70 bg-emerald-50 px-1.5 py-0.5 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300">
                          source-VPC condition collected
                        </span>
                      ) : (
                        <span className="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-muted-foreground">
                          resource-policy boundary unknown
                        </span>
                      )}
                      {(path.remediation?.iam?.unused_actions?.length ?? 0) > 0 ? (
                        <span className="rounded border border-amber-300/70 bg-amber-50 px-1.5 py-0.5 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                          {path.remediation?.iam.unused_actions.length} unused IAM actions
                        </span>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {data?.accessors && data.accessors.length > 0 ? (
            <p className="mt-2 text-[10px] text-muted-foreground">
              {data.accessors.length} accessor
              {data.accessors.length === 1 ? "" : "s"} can reach this jewel
            </p>
          ) : null}

          {identityLane ? (
            <p className="mt-2 text-[10px] text-muted-foreground">
              Cross-account identity: {identityLane.items.length} evidence-backed path
              {identityLane.items.length === 1 ? "" : "s"} · {(identityLane.coverage_state || "not ready").replaceAll("_", " ")}
              {identityLane.coverage_reason || identityLane.not_wired_reason
                ? ` — ${identityLane.coverage_reason || identityLane.not_wired_reason}`
                : ""}
            </p>
          ) : null}
          {propagationLane ? (
            <p className="mt-1 text-[10px] text-muted-foreground">
              Replication and snapshot sharing: {propagationLane.items.length} destination
              {propagationLane.items.length === 1 ? "" : "s"} · {(propagationLane.coverage_state || "not ready").replaceAll("_", " ")}
              {propagationLane.coverage_reason || propagationLane.not_wired_reason
                ? ` — ${propagationLane.coverage_reason || propagationLane.not_wired_reason}`
                : ""}
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}
