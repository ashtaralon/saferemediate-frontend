"use client"

/**
 * Zoom0 Exfiltration details panel — jewel → out, with mandatory coverage
 * honesty when observed transport is unwired (PRD).
 */

import { ArrowRight, Cloud, KeyRound, Loader2, Network, Route, Server } from "lucide-react"
import type { ExfilPayloadWithCoverage } from "./use-zoom0-exfil"

function readableAccessor(name: string, id: string, type: string): string {
  const value = name || id
  if (/^[a-f0-9]{32,}$/i.test(value)) {
    const label = type && type !== "Unknown" ? type : "External principal"
    return `${label} · ${value.slice(0, 10)}…`
  }
  return value
}

export function Zoom0ExfilLensPanel({
  data,
  loading,
  error,
  retry,
  selectedPathId,
  onSelectPath,
}: {
  data: ExfilPayloadWithCoverage | null
  loading: boolean
  error: string | null
  retry: () => void
  selectedPathId: string | null
  onSelectPath: (pathId: string) => void
}) {
  const coverageText =
    data?.coverage_badge_text ||
    (!data?.observed_exfil?.available
      ? "Observed transport not yet collected — showing configured egress only"
      : null)

  const paths = data?.paths ?? []
  const selectedPath = paths.find((path) => path.path_id === selectedPathId) ?? paths[0] ?? null
  const selectedWorkload = selectedPath?.workload_sample?.[0] ?? null
  const selectedGateway = selectedPath?.gateway_sample?.find((item) => item.routed !== false) ?? selectedPath?.gateway_sample?.[0] ?? null
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
            <div className="mt-2 space-y-1.5" data-testid="zoom0-exfil-paths">
              <select
                value={selectedPath?.path_id ?? ""}
                onChange={(event) => onSelectPath(event.target.value)}
                className="w-full rounded-md border border-violet-300 bg-background px-2.5 py-1.5 text-[11px] text-foreground outline-none focus:ring-2 focus:ring-violet-500/30 dark:border-violet-500/40"
                aria-label="Exfiltration path"
              >
                {paths.map((path, index) => {
                  const workload = path.workload_sample?.[0]
                  const gateway = path.gateway_sample?.find((item) => item.routed !== false) ?? path.gateway_sample?.[0]
                  return (
                    <option key={path.path_id} value={path.path_id}>
                      #{index + 1} · {readableAccessor(path.accessor_name, path.accessor_id, path.accessor_type)} → {workload?.name || "external API client"} → {gateway?.kind || path.channel_label}
                    </option>
                  )
                })}
              </select>
              {selectedPath ? (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-violet-200/70 bg-background/80 px-2 py-1.5 text-[10px] dark:border-violet-500/30">
                  <span className="inline-flex items-center gap-1 font-semibold text-foreground"><KeyRound className="h-3 w-3" />{readableAccessor(selectedPath.accessor_name, selectedPath.accessor_id, selectedPath.accessor_type)}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <span className="inline-flex items-center gap-1">{selectedWorkload ? <Server className="h-3 w-3" /> : <Cloud className="h-3 w-3" />}{selectedWorkload?.name || "external API client"}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <span className="inline-flex items-center gap-1 font-semibold text-violet-800 dark:text-violet-300"><Route className="h-3 w-3" />{selectedGateway?.kind || selectedPath.channel_label}</span>
                  <span className="text-muted-foreground">· {selectedPath.accessor_provenance} access</span>
                  {selectedGateway?.route_destination_cidr ? <span className="text-muted-foreground">· route {selectedGateway.route_destination_cidr}</span> : null}
                  {selectedGateway?.route_table?.id ? <span className="text-muted-foreground">· {selectedGateway.route_table.name || selectedGateway.route_table.id}{selectedGateway.route_table.is_main ? " · main" : ""}</span> : null}
                </div>
              ) : null}
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
