/**
 * Deterministic topology fixture for browser geometry specs.
 *
 * NOT live: the specs that import this intercept the topology proxy routes and
 * serve docs/mocks/topology-snapshot-alon-prod.json (a captured alon-prod
 * topology-risk payload). That makes layout assertions reproducible on any
 * machine or CI runner with no backend. It says nothing about the deployed
 * backend — a deployed-backend smoke is a separate, genuinely live spec.
 */
import fs from "node:fs"
import path from "node:path"
import type { Page } from "@playwright/test"

export const SYSTEM = "alon-prod"
export const ESTATE_URL = `/topology/v0.2-estate?systemName=${SYSTEM}`
const RAW_SNAPSHOT = JSON.parse(
  fs.readFileSync(
    path.join(process.cwd(), "docs/mocks/topology-snapshot-alon-prod.json"),
    "utf8",
  ),
)
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

export async function routeSnapshot(page: Page) {
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
