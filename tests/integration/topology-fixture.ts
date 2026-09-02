/**
 * Deterministic topology fixture for browser geometry specs.
 *
 * NOT live: the specs that import this intercept the topology proxy routes and
 * serve docs/mocks/topology-snapshot-alon-prod.json (a captured alon-prod
 * topology-risk payload). That makes layout assertions reproducible on any
 * machine or CI runner with no backend. It says nothing about the deployed
 * backend — a deployed-backend smoke is a separate, genuinely live spec.
 *
 * The estate page is gated by the product scope before it mounts the map:
 * AccountScopeProvider loads the organization roster and the account/region
 * options, useScopedSystemCatalog builds no catalog URL until an organization
 * is selected, and the page renders "No systems available yet" when the
 * scoped catalog lacks the requested system. routeSnapshot therefore also
 * answers those three routes, derived from the captured payload's own scope
 * fields (account id, account name, regions, system name). Only the
 * organization id is not in the payload: it is the backend's legacy default
 * tenant (LEGACY_CUSTOMER_ID in api/iam_usage_sync.py), which is where the
 * captured alon-prod system lives.
 */
import fs from "node:fs"
import path from "node:path"
import type { Page } from "@playwright/test"

export const SYSTEM = "alon-prod"
export const ESTATE_URL = `/topology/v0.2-estate?systemName=${SYSTEM}`
/** Organization the captured system belongs to (backend legacy default tenant). */
export const ORGANIZATION = { customer_id: "cyntro-dev", display_name: "cyntro-dev" } as const
const RAW_SNAPSHOT = JSON.parse(
  fs.readFileSync(
    path.join(process.cwd(), "docs/mocks/topology-snapshot-alon-prod.json"),
    "utf8",
  ),
)
/**
 * Lane coverage the way the backend derives it (traffic_authority.lane_coverage,
 * topology-risk/v8), from the captured payload's own node types. The payload
 * carries no VPC-attachment verdict for its Lambdas, so they are `unknown`
 * (never assumed non-VPC); S3 and DynamoDB have no network interface, so they
 * are `not_applicable`; EC2, RDS and the load balancer are eligible and, to
 * match the synthesized active generation above, covered.
 */
function laneCoverageFromSnapshot(nodes: Array<{ type: string }>) {
  const count = (types: string[]) => nodes.filter(node => types.includes(node.type)).length
  const vpc = count(["EC2", "LoadBalancer"])
  const database = count(["RDS"])
  const lambdas = count(["Lambda"])
  const regional = count(["S3", "DynamoDB"])
  const lane = (eligible: number, unknown: number, notApplicable: number) => ({
    eligible,
    authoritative: eligible,
    unknown,
    not_applicable: notApplicable,
    state:
      eligible > 0 ? "authoritative" : unknown > 0 ? "unknown" : notApplicable > 0 ? "not_applicable" : "empty",
  })
  const warnings: Array<{ code: string; lane: string; count: number; message: string }> = []
  if (lambdas > 0) {
    warnings.push({
      code: "lambda_attachment_unknown",
      lane: "serverless",
      count: lambdas,
      message: `${lambdas} Lambda function(s) have no verified VPC configuration; flow-log coverage for them is unknown, not absent.`,
    })
  }
  if (regional > 0) {
    warnings.push({
      code: "regional_services_outside_flow_logs",
      lane: "regional",
      count: regional,
      message: `${regional} regional service(s) have no VPC network interface; VPC flow logs cannot observe them. Access to them is evidenced by CloudTrail data events, a separate lane.`,
    })
  }
  return {
    basis: "vpc_flow_logs",
    mode: "incremental",
    active_generation: 7,
    state: "partial",
    eligible: vpc + database,
    authoritative: vpc + database,
    unknown: lambdas,
    not_applicable: regional,
    by_lane: {
      vpc: lane(vpc, 0, 0),
      serverless: lane(0, lambdas, 0),
      database: lane(database, 0, 0),
      regional: lane(0, 0, regional),
    },
    projection: {
      unclassified_external_targets: 0,
      unclassified_external_sources: 0,
      igw_to_database_rejected: 0,
      unresolved_pairs: 0,
    },
    rejected_edges: { non_vpc_lambda_edges: 0 },
    warnings,
  }
}

export const SNAPSHOT = {
  ...RAW_SNAPSHOT,
  traffic_authority: {
    state: "authoritative_positive_only",
    mode: "incremental",
    active_generation: 7,
    window_days: 90,
    authoritative_endpoint_count: RAW_SNAPSHOT.nodes.length,
    endpoint_count: RAW_SNAPSHOT.nodes.length,
    projected_edge_count: RAW_SNAPSHOT.traffic_edges.length,
    authority_scope: "positive_confirmed_tcp",
    absence_authority: "unknown",
    normalization_version: "tcp_syn_connection_v1",
    limitation: "Confirmed TCP segments are authoritative; a missing segment is not evidence of no traffic.",
    lane_coverage: laneCoverageFromSnapshot(RAW_SNAPSHOT.nodes),
  },
  traffic_edges: RAW_SNAPSHOT.traffic_edges.map((edge: { protocol?: string | null }, index: number) => {
    const configured = ["ROUTES_TO", "QUERIES_DB"].includes(edge.protocol ?? "")
    return {
      ...edge,
      evidence_type: configured ? "configured" : "observed",
      evidence_source: configured ? "aws_configuration" : "behavioral_summary",
      authority_state: configured ? "configured" : "authoritative",
      path_basis: configured ? "configured_route" : "observed_segment",
      projection_generation: configured ? null : 7,
      evidence_id: configured ? null : `mock-edge-${index}`,
      normalization_basis: configured ? null : "tcp_syn_connection_v1",
      normalization_provenance: configured ? [] : ["NATIVE_REQUEST_TCP_FLAGS"],
    }
  }),
}

interface SnapshotAccount {
  account_id: string
  name?: string | null
  regions?: string[] | null
  onboarded?: boolean | null
}

/** Product-scope gate: organization roster, account/region options, scoped systems catalog. */
async function routeProductScope(page: Page) {
  await page.route("**/api/proxy/admin/customers**", async route => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([ORGANIZATION]) })
  })
  await page.route("**/api/proxy/admin/accounts/scope/options/all**", async route => {
    const accounts = ((SNAPSHOT.available_accounts ?? []) as SnapshotAccount[]).map(account => ({
      account_id: account.account_id,
      display_name: account.name || account.account_id,
      regions: account.regions ?? [],
      group_ids: [],
      status: account.onboarded ? "active" : "pending",
    }))
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ customer_id: ORGANIZATION.customer_id, accounts, groups: [] }),
    })
  })
  // Exact path: `/api/proxy/systems/<name>/...` routes must keep their own behaviour.
  await page.route(url => url.pathname === "/api/proxy/systems", async route => {
    const system = { name: SNAPSHOT.system, account_id: SNAPSHOT.account_id, region: SNAPSHOT.region }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, systems: [system], total: 1 }),
    })
  })
}

export async function routeSnapshot(page: Page) {
  await routeProductScope(page)
  await page.route(`**/api/proxy/topology-risk/${SYSTEM}**`, async route => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(SNAPSHOT) })
  })
  await page.route("**/api/proxy/dependency-map/full**", async route => {
    const nodes = SNAPSHOT.nodes.map((node: { id: string; name: string; type: string }) => ({
      id: node.id,
      name: node.name,
      type: node.type,
      properties: { arn: node.id },
    }))
    const edges = SNAPSHOT.traffic_edges.map(
      (edge: {
        source_id: string
        target_id: string
        protocol: string | null
        port: number | null
        last_seen: string | null
      }) => ({
        source: edge.source_id,
        target: edge.target_id,
        type: edge.protocol ?? "ACTUAL_TRAFFIC",
        protocol: edge.protocol,
        port: edge.port,
        last_seen: edge.last_seen,
      }),
    )
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ nodes, edges }),
    })
  })
  await page.route("**/api/proxy/findings/severity-summary**", async route => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" })
  })
  await page.route("**/api/proxy/findings/decision-routing**", async route => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" })
  })
}

export interface RailHeaderBadgeOverlap {
  header: string
  label: string
  badge: { l: number; t: number; r: number; b: number }
  headerBox: { l: number; t: number; r: number; b: number }
}

/**
 * Labelled flow badges that paint over the visible part of a rail tier header
 * inside the fullscreen map. Empty when the badge nudge pass (FlowOverlay
 * pass 4) kept every label clear of both headers.
 */
export async function railHeaderBadgeOverlaps(page: Page): Promise<RailHeaderBadgeOverlap[]> {
  return page.evaluate(() => {
    const root = document.querySelector('[data-testid="topology-estate-map-fullscreen"]')
    if (!root) throw new Error("fullscreen map is not open")
    const rail = root.querySelector('[data-testid="topology-edge-services-rail"]')
    if (!rail) throw new Error("edge-services rail is not rendered")
    const railRect = rail.getBoundingClientRect()
    const headers = Array.from(
      root.querySelectorAll<HTMLElement>('[data-flow-obstacle$="-tier-header"]'),
    ).map(el => {
      const r = el.getBoundingClientRect()
      // Only the part inside the rail's scroll box is painted (and is what the
      // overlay treats as the obstacle).
      return {
        name: el.getAttribute("data-flow-obstacle") ?? "",
        l: Math.max(r.left, railRect.left),
        t: Math.max(r.top, railRect.top),
        r: Math.min(r.right, railRect.right),
        b: Math.min(r.bottom, railRect.bottom),
      }
    }).filter(h => h.r > h.l && h.b > h.t)
    const out: Array<{
      header: string
      label: string
      badge: { l: number; t: number; r: number; b: number }
      headerBox: { l: number; t: number; r: number; b: number }
    }> = []
    for (const badge of Array.from(root.querySelectorAll<SVGGElement>('[data-testid="topology-flow-badge"]'))) {
      const box = badge.querySelector("rect")
      if (!box) continue
      const r = box.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const label = badge.querySelector("text")?.textContent ?? ""
      for (const h of headers) {
        if (r.left < h.r && r.right > h.l && r.top < h.b && r.bottom > h.t) {
          out.push({
            header: h.name,
            label,
            badge: { l: r.left, t: r.top, r: r.right, b: r.bottom },
            headerBox: { l: h.l, t: h.t, r: h.r, b: h.b },
          })
        }
      }
    }
    return out
  })
}
