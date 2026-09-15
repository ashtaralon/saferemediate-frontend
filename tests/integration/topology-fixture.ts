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
/** Frozen copy of backend a41a2646's executable topology-risk/v11 contract.
 *  Browser fixtures layer it over the full captured topology so the real Estate
 *  page can render it; unit tests consume the same bytes without adaptation. */
const RAW_V11_ESTATE_CONTRACT = JSON.parse(
  fs.readFileSync(
    path.join(process.cwd(), "__tests__/fixtures/topology-risk/estate-map-v11-contract.json"),
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
function laneCoverageFromSnapshot(nodes: Array<{ type: string; resource_label?: string | null }>) {
  // A logical group is not an ENDPOINT. A DB cluster projects as type "RDS"
  // with resource_label "RDSCluster", so counting it made the coverage pill
  // read "Database 3/3" beside a filter chip reading "RDS (2)" — two numbers
  // for one fact, which is the defect class this fixture exists to catch.
  // Mirrors isLogicalGroupNode's own resource_label-first rule.
  const GROUP_LABELS = new Set([
    "AutoScalingGroup",
    "ASG",
    "TargetGroup",
    "RDSCluster",
    "NeptuneCluster",
    "NeptuneDBCluster",
    "DocumentDBCluster",
    "DocDBCluster",
    "DBCluster",
  ])
  const endpoints = nodes.filter(
    node => !(node.resource_label && GROUP_LABELS.has(node.resource_label)),
  )
  const count = (types: string[]) => endpoints.filter(node => types.includes(node.type)).length
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

/**
 * `snapshot` defaults to the captured payload; a spec may hand in a variant
 * (the captured payload plus a node shape it does not carry, e.g. a target
 * group) so the product code renders what THAT payload says. Fixture data in a
 * test file — the product never sees it outside the spec.
 */
export async function routeSnapshot(page: Page, snapshot: typeof SNAPSHOT = SNAPSHOT) {
  await routeProductScope(page)
  await page.route(`**/api/proxy/topology-risk/${SYSTEM}**`, async route => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot) })
  })
  await page.route("**/api/proxy/dependency-map/full**", async route => {
    const nodes = snapshot.nodes.map((node: { id: string; name: string; type: string }) => ({
      id: node.id,
      name: node.name,
      type: node.type,
      properties: { arn: node.id },
    }))
    const edges = snapshot.traffic_edges.map(
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

export interface ChromeTextDefects {
  /** Leaf text boxes that paint over each other. */
  overlaps: Array<{ a: string; b: string; overlapX: number; overlapY: number }>
  /** Leaf text that is laid out but squeezed to zero width — present in the DOM,
   *  invisible on screen. A `truncate` label starved by a `shrink-0` sibling
   *  reads to an operator as "this system has no name". */
  collapsed: Array<{ text: string; left: number; top: number }>
}

/**
 * Layout defects in a header row, measured in a real browser.
 *
 * Two failure modes, one helper, because a narrow viewport produces both from
 * the same cause — a non-wrapping flex row whose content exceeds it:
 *
 *   1. a `shrink-0` child overflows its own squeezed wrapper and paints on top
 *      of the next control, and
 *   2. a `truncate` sibling absorbs the whole shortfall and renders at zero
 *      width, silently dropping information rather than shortening it.
 *
 * Mode 2 is the one a screenshot review misses: there is nothing to see, so
 * the header looks merely sparse. Only measurement catches it.
 *
 * `<option>` elements are skipped — they have no box by specification, not by
 * defect. `display: none` is skipped too (no client rects): hiding a label at a
 * breakpoint is a decision, collapsing it to zero is an accident.
 *
 * Takes a full CSS selector, not a bare test id, because the map's header rows
 * exist in both the inline map and the fullscreen overlay at once — a bare id
 * resolves to the background copy and measures the wrong element.
 */
export async function chromeTextDefects(page: Page, selector: string): Promise<ChromeTextDefects> {
  return page.evaluate((sel: string) => {
    const root = document.querySelector<HTMLElement>(sel)
    if (!root) throw new Error(`no element matching ${sel}`)
    const leaves: Array<{ text: string; l: number; t: number; r: number; b: number; w: number }> = []
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
    const consider = (el: Element) => {
      if (el.children.length > 0) return
      if (el.tagName === "OPTION" || el.closest("select")) return
      const text = (el.textContent ?? "").trim()
      if (!text) return
      if (el.getClientRects().length === 0) return
      const cs = getComputedStyle(el)
      if (cs.visibility === "hidden" || cs.position === "absolute" || cs.position === "fixed") return
      const r = el.getBoundingClientRect()
      leaves.push({ text, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width })
    }
    consider(root)
    while (walk.nextNode()) consider(walk.currentNode as Element)

    const overlaps: ChromeTextDefects["overlaps"] = []
    for (let i = 0; i < leaves.length; i += 1) {
      for (let j = i + 1; j < leaves.length; j += 1) {
        const a = leaves[i]
        const b = leaves[j]
        const overlapX = Math.min(a.r, b.r) - Math.max(a.l, b.l)
        const overlapY = Math.min(a.b, b.b) - Math.max(a.t, b.t)
        // Sub-pixel touching is antialiasing, not a collision.
        if (overlapX > 1 && overlapY > 1) {
          overlaps.push({
            a: a.text.slice(0, 40),
            b: b.text.slice(0, 40),
            overlapX: Math.round(overlapX),
            overlapY: Math.round(overlapY),
          })
        }
      }
    }
    const collapsed = leaves
      .filter(l => l.w < 1)
      .map(l => ({ text: l.text.slice(0, 60), left: Math.round(l.l), top: Math.round(l.t) }))
    return { overlaps, collapsed }
  }, selector)
}

type PayloadNode = {
  id: string
  name: string
  type: string
  vpc_id: string | null
  subnet_id: string | null
}

/** A group node shaped like the ones topology_platform_enrichment projects.
 *
 *  `resource_label` is the GRAPH label and is what isLogicalGroupNode matches
 *  on first: a cluster and its instances both project as `type: "RDS"`, so a
 *  group whose label repeated its type would be read as an unplaced instance
 *  and land in the amber gap area instead of the band. */
function fixtureGroupNode(
  base: typeof SNAPSHOT,
  id: string,
  name: string,
  type: string,
  resourceLabel: string,
): PayloadNode & Record<string, unknown> {
  return {
    id,
    name,
    type,
    resource_label: resourceLabel,
    subnet_id: null,
    subnet_ids: [],
    vpc_id: base.vpc_topology.vpc_id as string,
    account_id: base.account_id,
    region: base.region,
    placement_tier: null,
    score: null,
    stale: null,
    is_jewel: false,
    security_group_ids: [],
  }
}

function membershipEdge(groupId: string, memberId: string, protocol: string) {
  return {
    edge_class: "internal",
    source_id: groupId,
    target_id: memberId,
    port: null,
    protocol,
    last_seen: null,
    external_destinations: null,
    evidence_type: "configured",
    evidence_source: "aws_configuration",
    authority_state: "configured",
    path_basis: "configured_route",
  }
}

/** A snapshot whose VPC frame also contains SIX logical groups, shaped like the
 *  band C1 production draws.
 *
 *  The production band (run 34832847455) reads
 *  "Logical groups · members carry the placement (6)" over an RDS cluster, two
 *  target groups, a Neptune cluster and two auto-scaling groups — bound to
 *  their members by MEMBER_OF_CLUSTER / TARGETS / LAUNCHES respectively. One
 *  group exercised one row and one relationship type; six exercise the band's
 *  height, its disclosure, and every membership spelling the reader accepts.
 *
 *  Canonical builder, deliberately shared: three specs need a band to measure
 *  and a second inline construction of the same shape is the twin fork this
 *  repo lints against.
 *
 *  Members are the captured payload's OWN nodes wherever the payload has one of
 *  that type in the drawn VPC, so the zones a band claims are zones the fixture
 *  actually draws; the captured VPC holds no Neptune instance, so that one
 *  group gets a `fixture-`-named member placed in a real data subnet. Groups
 *  share members on purpose — production's tg-web and asg-web cover the same
 *  instances — and the helper returns each group's ACTUAL member ids so a spec
 *  asserts what the fixture supplies rather than a hardcoded count. */
export function logicalGroupSnapshot(base: typeof SNAPSHOT = SNAPSHOT) {
  const frameVpc = base.vpc_topology.vpc_id as string
  const subnetsById = new Map(
    (base.vpc_topology.subnets as Array<{ id: string; az: string | null; tier?: string | null }>).map(
      subnet => [subnet.id, subnet],
    ),
  )
  const placed = (type: string) =>
    (base.nodes as PayloadNode[]).filter(
      node =>
        node.type === type &&
        node.vpc_id === frameVpc &&
        node.subnet_id &&
        subnetsById.get(node.subnet_id)?.az,
    )
  const ec2 = placed("EC2")
  const rds = placed("RDS")
  const dataSubnet = (base.vpc_topology.subnets as Array<{ id: string; az: string | null; tier?: string | null }>)
    .find(subnet => subnet.tier === "data" && subnet.az)

  // The captured VPC draws no Neptune instance, so the one group whose member
  // type the payload lacks brings its own, in a subnet the frame really draws.
  const neptuneMember: PayloadNode & Record<string, unknown> = {
    id: "arn:aws:neptune:eu-west-1:745783559495:db:fixture-neptune-1",
    name: "fixture-neptune-1",
    type: "Neptune",
    resource_label: "Neptune",
    subnet_id: dataSubnet?.id ?? null,
    subnet_ids: dataSubnet ? [dataSubnet.id] : [],
    vpc_id: frameVpc,
    account_id: base.account_id,
    region: base.region,
    placement_tier: null,
    score: null,
    stale: null,
    is_jewel: false,
    security_group_ids: [],
  }

  // Rotate through the instance pool so two groups of the same type do not
  // list the identical pair, exactly as production's tg-web / asg-web differ.
  const rotate = (pool: PayloadNode[], offset: number, size: number) =>
    pool.length === 0
      ? []
      : Array.from({ length: Math.min(size, pool.length) }, (_, i) => pool[(offset + i) % pool.length])

  const specs: Array<{
    id: string
    name: string
    type: string
    label: string
    protocol: string
    members: PayloadNode[]
  }> = [
    { id: "tg-web", name: "fixture-tg-web", type: "TargetGroup", label: "TargetGroup", protocol: "TARGETS", members: rotate(ec2, 0, 2) },
    { id: "tg-app", name: "fixture-tg-app", type: "TargetGroup", label: "TargetGroup", protocol: "TARGETS", members: rotate(ec2, 1, 2) },
    { id: "asg-web", name: "fixture-asg-web", type: "AutoScalingGroup", label: "AutoScalingGroup", protocol: "LAUNCHES", members: rotate(ec2, 2, 2) },
    { id: "asg-app", name: "fixture-asg-app", type: "AutoScalingGroup", label: "AutoScalingGroup", protocol: "LAUNCHES", members: rotate(ec2, 0, 2) },
    { id: "aurora", name: "fixture-aurora", type: "RDS", label: "RDSCluster", protocol: "MEMBER_OF_CLUSTER", members: rotate(rds, 0, 2) },
    { id: "graph", name: "fixture-graph", type: "Neptune", label: "NeptuneCluster", protocol: "MEMBER_OF_CLUSTER", members: [neptuneMember] },
  ]

  const azsOf = (members: PayloadNode[]) =>
    [
      ...new Set(
        members
          .map(member => (member.subnet_id ? subnetsById.get(member.subnet_id)?.az : null))
          .filter((az): az is string => Boolean(az)),
      ),
    ].sort()

  const groupNodes = specs.map(spec =>
    fixtureGroupNode(
      base,
      `arn:aws:fixture:eu-west-1:745783559495:group/${spec.id}`,
      spec.name,
      spec.type,
      spec.label,
    ),
  )
  const groups = specs.map((spec, i) => ({
    node: groupNodes[i],
    protocol: spec.protocol,
    members: spec.members,
    expectedAzs: azsOf(spec.members),
  }))

  const nodes = [...base.nodes, neptuneMember, ...groupNodes]
  const traffic_edges = [
    ...base.traffic_edges,
    ...groups.flatMap(group =>
      group.members.map(member => membershipEdge(group.node.id, member.id, group.protocol)),
    ),
  ]
  const snapshot = {
    ...base,
    nodes,
    traffic_edges,
    traffic_authority: {
      ...base.traffic_authority,
      authoritative_endpoint_count: nodes.length,
      endpoint_count: nodes.length,
      projected_edge_count: traffic_edges.length,
      lane_coverage: laneCoverageFromSnapshot(
        nodes as Array<{ type: string; resource_label?: string | null }>,
      ),
    },
  }

  // Back-compatible handles: the first target group is the one the existing
  // specs measure.
  const primary = groups[0]
  return {
    snapshot,
    groups,
    targetGroup: primary.node,
    members: primary.members,
    expectedAzs: primary.expectedAzs,
  }
}

/** The production egress contract laid over the captured payload's own egress
 *  legs: a NAT hop, then the IGW, a structural route basis, and a sampled set
 *  of addresses that is COMPLETE on exactly one leg and short on the rest.
 *
 *  Shapes, identifiers, counts and addresses are the C1 capture's (generation
 *  1789380108, run 34832847455): `structural_route: "NAT"`,
 *  `route_basis: "structural_default_egress"`, `destinations: []`, five sample
 *  hosts against a large distinct count, and the one leg whose whole count is
 *  three and whose three addresses therefore ARE the inventory. That leg's
 *  count is transcribed onto the first captured leg, because the captured
 *  alon-prod payload's own smallest count is 20 and a sample of 20 would have
 *  to be invented.
 *
 *  The base snapshot carries the distinct COUNTS and no hops at all, so it is
 *  the no-addresses case; this builder is what exercises the hop chain and the
 *  complete-vs-sampled split. */
export function externalEgressSnapshot(base: typeof SNAPSHOT = SNAPSHOT) {
  // The gateway the MAP draws for this frame, not C1's: the External
  // destinations chain has to name the same igw- id as the in-map IGW chip or
  // the "continuation past the IGW" claim is about some other gateway
  // (independent review, 2026-09-14). The NAT is fixture-named because the
  // captured payload carries no NAT gateway to borrow an id from, and
  // inventing a realistic-looking one would read as real.
  const frameVpc = base.vpc_topology.vpc_id as string
  const igws = (base.vpc_topology.edges.igws ?? []) as Array<{ id: string; vpc_id: string }>
  const IGW = (igws.find(gw => gw.vpc_id === frameVpc) ?? igws[0]).id
  const NAT = "nat-fixture0a1b2c3d4"
  const NAT_SUBNET = (base.vpc_topology.subnets as Array<{ id: string }>)[0].id
  // C1's i-0129135b4e4723d6d (32 distinct, 5 shown) and i-0b1a764c731dfc095
  // (3 distinct, 3 shown — the whole inventory).
  const SAMPLED = ["3.5.73.1", "3.5.72.73", "3.5.72.119", "3.5.69.34", "3.5.67.254"]
  const COMPLETE = ["54.217.69.183", "54.217.245.46", "3.253.225.145"]
  // An address the leg ALREADY samples. The attributed bucket must add a
  // SERVICE to the lane without adding an ADDRESS to the leg: a sixth sampled
  // host turned "5 of 32 shown" into "6 of 32 shown" and dropped that leg out
  // of the semantics spec's "5 of" filter, 8 legs becoming 7 (run
  // 34866364811). De-duplication then leaves the summary layer untouched and
  // the destination map still gains its one attributed node.
  const ATTRIBUTED_HOST = SAMPLED[0]
  const ATTRIBUTED_SERVICE = "S3"
  type Edge = Record<string, unknown> & { target_id: string; external_destinations?: number | null }
  const edges = base.traffic_edges as Edge[]
  const isEgress = (edge: Edge) => edge.target_id === "__igw__"
  const legs = edges.filter(isEgress)
  let completeLegs = 0
  // The attributed destination goes on a leg that is ALREADY sampled, never on
  // the complete one. Putting it on the complete leg added a sixth address to a
  // three-of-three inventory, flipped sampleIsComplete false, and broke the
  // semantics spec's "addresses complete" claim — a fixture change silently
  // rewriting an unrelated assertion (proof run 34865304377).
  const attributedLeg = legs.length > 1 ? 1 : -1
  const traffic_edges = edges.map(edge => {
    if (!isEgress(edge)) return edge
    const legIndex = legs.indexOf(edge)
    const first = legIndex === 0
    const distinct = first
      ? COMPLETE.length
      : typeof edge.external_destinations === "number"
        ? edge.external_destinations
        : null
    const sample = first ? COMPLETE : SAMPLED
    if (first) completeLegs += 1
    return {
      ...edge,
      external_destinations: distinct,
      egress_hops: [
        { kind: "nat", id: NAT, subnet_id: NAT_SUBNET },
        { kind: "igw", id: IGW },
      ],
      structural_route: "NAT",
      via_nat_id: NAT,
      via_igw_id: IGW,
      route_basis: "structural_default_egress",
      destinations: [],
      egress_breakdown: [
        { kind: "external", count: distinct ?? 0, sample_hosts: sample },
        // ONE authoritatively attributed destination, on the first leg only.
        // C1 carries no attribution today, so without this the fixture could
        // never exercise the branch that draws a service NAME — and the rule
        // that an un-attributed address stays an address would be untested
        // against a payload where attribution is possible at all.
        // `aws_service` is the field VPC Flow Logs v5 `pkt-dst-aws-service`
        // lands in; `kind` alone must never produce a service label.
        ...(legIndex === attributedLeg
          ? [{ kind: "s3", count: 2, sample_hosts: [ATTRIBUTED_HOST], aws_service: ATTRIBUTED_SERVICE }]
          : []),
      ],
    }
  })
  const expectedUpperBound = (traffic_edges as Edge[])
    .filter(isEgress)
    .reduce(
      (sum, leg) => sum + (typeof leg.external_destinations === "number" ? leg.external_destinations : 0),
      0,
    )
  return {
    snapshot: { ...base, traffic_edges },
    legCount: legs.length,
    completeLegs,
    expectedUpperBound,
    natId: NAT,
    /** Distinct destination LABELS the lane may draw: the complete leg's three
     *  addresses, the five sampled addresses every other leg repeats (one
     *  node, not one per leg), and the attributed service. */
    expectedNamed: COMPLETE.length + SAMPLED.length + (attributedLeg >= 0 ? 1 : 0),
    /** The one destination the payload attributes a service to. */
    attributedService: ATTRIBUTED_SERVICE,
    /** The frame's own gateway — the chain must name this exact id. */
    igwId: IGW,
    hopCaption: `NAT ${NAT} \u2192 IGW ${IGW}`,
  }
}

/** Backend a41a2646's exact v11 external-destination projection, layered over
 *  the full captured topology needed by the Estate browser page. The primary
 *  IGW id is replaced with the contract's exact gateway so the test proves the
 *  frontend joins only matching identities. Existing legacy egress legs are
 *  removed: v11 must be the only destination authority in this response. */
export function v11ExternalDestinationSnapshot(base: typeof SNAPSHOT = SNAPSHOT) {
  const contract = JSON.parse(JSON.stringify(RAW_V11_ESTATE_CONTRACT))
  const exactIgwId = contract.external_destination_projection.edges[0].source_id as string
  // The executable contract is intentionally a minimal slice and does not
  // include its i-web workload node. Browser scoping correctly drops edges
  // whose source node is absent, so map that one fixture placeholder onto a
  // real captured EC2 id. Destination ids, evidence and exact gateway identity
  // remain byte-for-byte the backend contract; the unit suite covers the raw
  // i-web shape directly.
  const browserSourceId = (base.nodes as Array<{ id: string; type: string }>).find(
    node => node.type === "EC2",
  )!.id
  for (const edge of contract.traffic_edges as Array<Record<string, unknown>>) {
    if (edge.source_id === "i-web") edge.source_id = browserSourceId
  }
  for (const node of contract.external_destination_projection.nodes as Array<{ source_workload_ids: string[] }>) {
    node.source_workload_ids = node.source_workload_ids.map(id => id === "i-web" ? browserSourceId : id)
  }
  for (const edge of contract.external_destination_projection.edges as Array<{ source_workload_ids: string[] }>) {
    edge.source_workload_ids = edge.source_workload_ids.map(id => id === "i-web" ? browserSourceId : id)
  }
  const nonEgressEdges = (base.traffic_edges as Array<Record<string, unknown>>).filter(
    edge => edge.target_id !== "__igw__" && !String(edge.target_id ?? "").startsWith("igw-"),
  )
  const igws = (base.vpc_topology.edges.igws as Array<Record<string, unknown>>).map((igw, index) =>
    index === 0 ? { ...igw, id: exactIgwId, name: exactIgwId } : igw,
  )
  return {
    snapshot: {
      ...base,
      response_contract_version: contract.response_contract_version,
      traffic_edges: [...nonEgressEdges, ...contract.traffic_edges],
      external_destination_projection: contract.external_destination_projection,
      vpc_topology: {
        ...base.vpc_topology,
        edges: { ...base.vpc_topology.edges, igws },
      },
    },
    contract,
    exactIgwId,
    browserSourceId,
  }
}

/** The negative case: a payload in which nothing leaves the VPC, so the map
 *  must draw no External destinations node at all. Every other edge stays, so
 *  a spec that finds no node cannot be passing because the map failed to
 *  render. */
export function noEgressSnapshot(base: typeof SNAPSHOT = SNAPSHOT) {
  type Edge = { target_id: string; edge_class?: string | null }
  const traffic_edges = (base.traffic_edges as Edge[]).filter(
    edge => edge.target_id !== "__igw__" && !String(edge.target_id).startsWith("igw-"),
  )
  return {
    snapshot: { ...base, traffic_edges },
    remainingEdges: traffic_edges.length,
  }
}

/** Six EventBridge rules firing six Lambdas, recorded under BOTH spellings —
 *  the C1 shape that drew `TARGETS ×6` stacked on `TRIGGERS ×6` over one set
 *  of endpoints (production inventory, run 34832847455).
 *
 *  Also narrows the payload's S3 access to FOUR of those six functions, with
 *  `observed_actions: []` on each, which is what the C1 capture holds: the
 *  edge is observed evidence, no operation is named on it, and the other two
 *  functions have no recorded S3 edge. The rules are named for the functions
 *  they fire, as C1's are. */
export function triggerBundleSnapshot(base: typeof SNAPSHOT = SNAPSHOT) {
  const schedules = ["frequent", "every_6h", "daily", "nightly_burst", "weekly", "monthly"]
  const allLambdas = (base.nodes as PayloadNode[]).filter(node => node.type === "Lambda")
  // Only functions the placement authority leaves in the lane: one of the
  // captured payload's sixteen resolves into a subnet and is therefore drawn
  // in the grid, so counting it as a lane function would make "of 6" wrong by
  // one in a way nothing on screen explains.
  const lambdas = allLambdas.filter(node => !node.subnet_id).slice(0, schedules.length)
  // The lane must hold SIX functions for "4 of 6" to be the fixture's own
  // truth: a panel reading "4 of 16" would exercise the code while asserting a
  // shape C1 does not have. The surplus functions and every edge that names
  // one leave with them, so the payload keeps no edge pointing at a node the
  // map was not handed.
  const keptLambdas = new Set(lambdas.map(node => node.id))
  const dropped = new Set(
    allLambdas.filter(node => !keptLambdas.has(node.id)).map(node => node.id),
  )
  const buckets = (base.nodes as PayloadNode[]).filter(node => node.type === "S3")
  const bucket = buckets[0]
  const rules = lambdas.map((lambda, i) => ({
    id: `arn:aws:events:eu-west-1:745783559495:rule/fixture-${schedules[i]}`,
    name: `fixture-${schedules[i]}`,
    type: "EventBridge",
    resource_label: "EventBridge",
    subnet_id: null,
    subnet_ids: [],
    vpc_id: null,
    account_id: base.account_id,
    region: base.region,
    placement_tier: null,
    score: null,
    stale: null,
    is_jewel: false,
    security_group_ids: [],
  }))
  const ruleEdge = (protocol: string) =>
    rules.map((rule, i) => ({
      edge_class: "internal",
      source_id: rule.id,
      target_id: lambdas[i].id,
      port: null,
      protocol,
      last_seen: null,
      external_destinations: null,
      evidence_type: "configured",
      evidence_source: "aws_configuration",
      authority_state: "configured",
      path_basis: "configured_route",
    }))
  // Four of six, with no action named on any of them.
  const s3Functions = lambdas.slice(0, 4)
  const s3Edges = s3Functions.map(lambda => ({
    edge_class: "edge_service",
    source_id: lambda.id,
    target_id: bucket.id,
    port: null,
    protocol: "ACTUAL_S3_ACCESS",
    last_seen: "2026-09-12T04:00:00Z",
    external_destinations: null,
    observed_actions: [],
  }))
  type Edge = { source_id: string; target_id: string; protocol?: string | null }
  const keptEdges = (base.traffic_edges as Edge[]).filter(
    edge =>
      (edge.protocol ?? "") !== "ACTUAL_S3_ACCESS" &&
      !dropped.has(edge.source_id) &&
      !dropped.has(edge.target_id),
  )
  const nodes = [...(base.nodes as PayloadNode[]).filter(node => !dropped.has(node.id)), ...rules]
  const traffic_edges = [...keptEdges, ...ruleEdge("TARGETS"), ...ruleEdge("TRIGGERS"), ...s3Edges]
  // Re-derive the coverage block from the NARROWED node list. Left alone it
  // still described sixteen functions, so the pill read "Lambda 16 unknown"
  // three inches from a lane header reading "LAMBDA RUNTIME (6)" — two numbers
  // for one fact, on one screen, which is the defect class this whole change
  // is about (measured in the fixture screenshots, run 34850178365).
  const laneCoverage = laneCoverageFromSnapshot(
    nodes as Array<{ type: string; resource_label?: string | null }>,
  )
  return {
    snapshot: {
      ...base,
      nodes,
      traffic_edges,
      traffic_authority: {
        ...base.traffic_authority,
        authoritative_endpoint_count: nodes.length,
        endpoint_count: nodes.length,
        projected_edge_count: traffic_edges.length,
        lane_coverage: laneCoverage,
      },
    },
    rules,
    lambdas,
    s3Functions,
    bucket,
    /** Unique directed rule → function connections: the number one badge may print. */
    expectedPairs: rules.length,
    /** Edge rows behind them, which is what the two spellings sum to. */
    expectedEdgeRows: rules.length * 2,
  }
}
