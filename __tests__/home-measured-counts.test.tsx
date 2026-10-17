/**
 * Home shows a count only where a source measured one.
 *
 * Before: the infrastructure tiles defaulted every kind to 0 (and the Telemetry tile and the banner's "tracked
 * resources" summed those zeros), and Security Hub rendered "0 findings / hub ingestion looks quiet" for a hub
 * that was never read. On a control plane with no workload account that was the whole Home page.
 *
 * Payload shapes are the literal ones the code builds:
 *   - issues-summary proxy, backend 503 with nothing cached: a non-ok answer (app/api/proxy/issues-summary)
 *   - dashboard-metrics proxy, backend held (503): 200 {success:false, error, metrics:null}
 *   - backend issues-summary `infrastructure` (api/issues_summary.py): EC2/RDS/S3 counted, the rest null
 *   - backend /api/security-hub/findings: 503 {detail:{code:"SECURITY_HUB_NOT_CONNECTED"}} when unconnected,
 *     200 {findings, summary:{total, by_severity, by_product}, total_count} on a real read
 * Each absence check has a control in which the same query finds the value.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import { measuredInfrastructure } from "@/lib/api-client"
import { InfrastructureOverview } from "@/components/infrastructure-overview"
import { HomeStatsBanner } from "@/components/home-stats-banner"
import { SecurityHubCard, parseSecurityHubReading } from "@/components/security-hub-card"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

type Route = (url: string) => { status: number; body: unknown } | null

function stubFetch(route: Route) {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    const hit = route(url) ?? { status: 404, body: { error: "unrouted in test" } }
    return {
      ok: hit.status >= 200 && hit.status < 300,
      status: hit.status,
      headers: new Headers({ "Content-Type": "application/json" }),
      json: async () => hit.body,
      text: async () => JSON.stringify(hit.body),
    } as unknown as Response
  })
  vi.stubGlobal("fetch", fn)
  return fn
}

const MEASURED = {
  containerClusters: null, kubernetesWorkloads: null, standaloneVMs: 4, vmScalingGroups: null,
  relationalDatabases: 0, blockStorage: null, fileStorage: null, objectStorage: 2,
}

function readySummary(infrastructure: unknown) {
  return {
    total: 3, by_severity: { critical: 0, high: 1, medium: 2, low: 0 }, by_source: {},
    avg_health_score: 80, serve_state: "READY", analysis_complete: true, counts_are_partial: false,
    resources: { with_issues: 2 }, infrastructure, success: true,
  }
}

async function homeInfrastructure(route: Route) {
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
  stubFetch(route)
  const { fetchInfrastructure } = await import("@/lib/api-client")
  return fetchInfrastructure()
}

describe("infrastructure counts", () => {
  it("keeps only what a source measured", () => {
    expect(measuredInfrastructure(MEASURED)).toEqual(MEASURED)
    expect(measuredInfrastructure({ standaloneVMs: "4", objectStorage: Number.NaN })).toBeNull()
    expect(measuredInfrastructure({ containerClusters: null })).toBeNull()
    expect(measuredInfrastructure(null)).toBeNull()
    expect(measuredInfrastructure("x")).toBeNull()
  })

  it("a control plane with no account: no tiles, no Telemetry sum, no 'tracked resources'", async () => {
    const infra = await homeInfrastructure((url) => {
      if (url.includes("/api/proxy/issues-summary")) return { status: 503, body: { error: "Issues-summary backend returned 503" } }
      if (url.includes("/api/proxy/dashboard-metrics"))
        return { status: 200, body: { success: false, error: "Backend returned 503", metrics: null } }
      return null
    })
    expect(infra.infrastructure).toBeNull()

    render(<InfrastructureOverview stats={infra.infrastructure} />)
    expect(screen.queryByText("Infrastructure Overview")).toBeNull()
    render(<HomeStatsBanner {...infra.stats} resourceCount={null} />)
    expect(document.body.textContent).not.toContain("tracked resources")
  })

  it("control: measured counts render, a measured 0 included, an uncounted kind gets no tile", async () => {
    const infra = await homeInfrastructure((url) =>
      url.includes("/api/proxy/issues-summary") ? { status: 200, body: readySummary(MEASURED) } : null,
    )
    expect(infra.infrastructure).toEqual(MEASURED)

    render(<InfrastructureOverview stats={infra.infrastructure} />)
    expect(screen.getByText("Infrastructure Overview")).toBeInTheDocument()
    const tile = (label: string) => screen.getByText(label).parentElement?.textContent
    expect(tile("Standalone VMs")).toContain("4")
    expect(tile("Relational Databases")).toContain("0")
    expect(tile("Object Storage")).toContain("2")
    expect(screen.queryByText("Container Clusters")).toBeNull()
    expect(screen.queryByText("Block Storage")).toBeNull()

    render(<HomeStatsBanner {...infra.stats} resourceCount={6} />)
    expect(document.body.textContent).toContain("6 tracked resources")
  })

  it("a failed count query (infrastructure null) and a stale replay carry no counts", async () => {
    const failed = await homeInfrastructure((url) =>
      url.includes("/api/proxy/issues-summary") ? { status: 200, body: readySummary(null) } : null,
    )
    expect(failed.infrastructure).toBeNull()
    const stale = await homeInfrastructure((url) =>
      url.includes("/api/proxy/issues-summary")
        ? { status: 200, body: { ...readySummary(MEASURED), fromStaleCache: true } }
        : null,
    )
    expect(stale.infrastructure).toBeNull()
  })
})

describe("Security Hub", () => {
  it("an unconnected or unread hub has no reading and no card", () => {
    expect(parseSecurityHubReading({ detail: { code: "SECURITY_HUB_NOT_CONNECTED" } })).toBeNull()
    expect(parseSecurityHubReading({ error: "Backend returned 503" })).toBeNull()
    expect(parseSecurityHubReading({ summary: {} })).toBeNull()
    expect(parseSecurityHubReading(null)).toBeNull()
    render(<SecurityHubCard data={null} />)
    expect(document.body.textContent).toBe("")
  })

  it("control: a real read with no findings is the quiet card; with findings, the findings card", () => {
    const quiet = parseSecurityHubReading({ findings: [], summary: { total: 0, by_severity: {}, by_product: {} }, total_count: 0 })
    expect(quiet).toEqual({ total: 0, critical: 0, high: 0, medium: 0, low: 0, byProduct: {} })
    render(<SecurityHubCard data={quiet} />)
    expect(screen.getByText("Hub ingestion looks quiet")).toBeInTheDocument()
    cleanup()

    const reading = parseSecurityHubReading({
      findings: [], total_count: 3,
      summary: { total: 3, by_severity: { HIGH: 2, LOW: 1 }, by_product: { Inspector: 3 } },
    })
    render(<SecurityHubCard data={reading} />)
    expect(screen.getByText("3 Active")).toBeInTheDocument()
    expect(screen.getByText("Inspector: 3")).toBeInTheDocument()
    expect(screen.queryByText("Hub ingestion looks quiet")).toBeNull()
  })
})
