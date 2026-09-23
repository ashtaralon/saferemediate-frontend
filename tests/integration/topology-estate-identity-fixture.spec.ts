import fs from "node:fs"
import path from "node:path"
import { expect, test, type Page } from "@playwright/test"
import { seedAuthCookie } from "./live-auth"
import {
  ESTATE_URL,
  ORGANIZATION,
  SNAPSHOT,
  SYSTEM,
  chromeTextDefects,
  railHeaderBadgeOverlaps,
  routeSnapshot,
} from "./topology-fixture"

/**
 * CF01 — the Identity & access lens as a 1:1 twin of the Network view, in a
 * real browser: the IAM roles lane, the trust entrances in the strip, one
 * coloured line per kind of access, motion only on observed use, and the
 * honesty footer — measured at three viewports.
 *
 * The identity block is the backend emitter's own v1 + graph fixture
 * (__tests__/fixtures/estate-identity-access.json, provenance in the file)
 * remapped onto the captured alon-prod topology snapshot this harness
 * already serves: same account, region and VPC as the snapshot, the role
 * bound to one EC2 chip the snapshot draws, plus one outside-account trust
 * statement so an entrance exists. Fixture data in a test file — the product
 * never sees it outside the spec.
 */

const IDENTITY_FIXTURE = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "__tests__/fixtures/estate-identity-access.json"), "utf8"),
)
const EMITTER_ACCOUNT = "416651950952"
const EMITTER_VPC = "vpc-1"
const OUTSIDE_ACCOUNT = "999988887777"

/** The EC2 chip in the snapshot's own VPC that the role will run as. */
function boundWorkload(): { id: string; name: string } {
  const node = (SNAPSHOT.nodes as Array<{ id: string; name: string; type: string; vpc_id?: string | null }>).find(
    n => n.type === "EC2" && n.vpc_id === SNAPSHOT.vpc_id,
  )
  if (!node) throw new Error("snapshot carries no EC2 chip in its own VPC")
  return { id: node.id, name: node.name }
}

function identitySnapshot() {
  const account = String(SNAPSHOT.account_id)
  const region = String(SNAPSHOT.region)
  const vpc = String(SNAPSHOT.vpc_id)
  const workload = boundWorkload()
  const remapped = JSON.parse(
    JSON.stringify(IDENTITY_FIXTURE.ready).split(EMITTER_ACCOUNT).join(account).split(JSON.stringify(EMITTER_VPC)).join(JSON.stringify(vpc)),
  )
  remapped.scope = { customer_id: ORGANIZATION.customer_id, system_name: SYSTEM, account_id: account, region, vpc_id: vpc }
  remapped.roles = remapped.roles.map((role: { workload_ids: string[] }) => ({ ...role, workload_ids: [workload.id] }))
  const graph = remapped.identity_graph
  graph.scope = {
    level: "account",
    customer_id: ORGANIZATION.customer_id,
    account_id: account,
    inventory_generation: remapped.inventory_authority.generation,
    region: null,
    system_name: null,
    vpc_id: null,
  }
  const serviceTrust = graph.edges.find(
    (edge: { family: string; source: { node_kind: string } }) => edge.family === "ROLE_TRUST_POLICY" && edge.source.node_kind === "service_principal",
  )
  if (!serviceTrust) throw new Error("emitter fixture carries no service-principal trust statement to mirror")
  graph.edges.push({
    ...serviceTrust,
    source: {
      node_kind: "aws_account_principal",
      arn: `arn:aws:iam::${OUTSIDE_ACCOUNT}:root`,
      name: `arn:aws:iam::${OUTSIDE_ACCOUNT}:root`,
      resource_uid: null,
      resolved: false,
      unresolved_reason: "ENDPOINT_NOT_A_PROJECTED_RESOURCE",
    },
    effect: "Allow",
    has_conditions: true,
    is_wildcard_principal: false,
    principal_kind: "AWS",
  })
  graph.edges_total = graph.edges.length
  return { snapshot: { ...SNAPSHOT, identity_access: remapped }, workload }
}

const VIEWPORTS = [
  { name: "1024x720", width: 1024, height: 720 },
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1600x900", width: 1600, height: 900 },
] as const

const KIND_COLOR = { runs_as: "#4338CA", may_assume: "#7C3AED", data: "#1E8E3E" } as const

async function strokeOf(page: Page, family: string): Promise<string | null> {
  return page.locator(`g[data-flow-family="${family}"] path[data-flow-line="stroke"]`).first().getAttribute("stroke")
}

for (const vp of VIEWPORTS) {
  test(`the identity lens is the Network frame with identity inputs at ${vp.name} · glance`, async ({ context, page }) => {
    test.setTimeout(150_000)
    const { snapshot, workload } = identitySnapshot()
    await seedAuthCookie(context)
    await routeSnapshot(page, snapshot)
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
    await expect(page.getByTestId("topology-estate-view-map")).toBeVisible({ timeout: 60_000 })
    await page.getByRole("tab", { name: "Identity & access" }).click()
    await page.getByTestId("topology-estate-density-glance").click()

    // --- the SAME frame, with identity inputs --------------------------------
    await expect(page.getByTestId("topology-vpc-frame").first()).toBeVisible()
    const lane = page.getByTestId("topology-iam-roles-tier")
    await expect(lane, `no IAM roles lane at ${vp.name}`).toBeVisible()
    await expect(lane).toContainText("IAM · Roles (1)")
    const roleChips = lane.locator("[data-flow-id]")
    await expect(roleChips).toHaveCount(1)
    await expect(roleChips.first().locator("img")).toHaveCount(1)
    await expect(page.locator(`[data-flow-id="${workload.id}"]`).first()).toBeVisible()
    await expect(page.getByTestId("topology-internet-node")).toHaveCount(0)

    // --- trust entrances in the strip ----------------------------------------
    const principals = page.getByTestId("topology-identity-principals")
    await expect(principals).toContainText("Trust entrances")
    const entrance = page.locator('[data-testid="topology-identity-principal"]')
    await expect(entrance).toHaveCount(1)
    await expect(entrance.first()).toHaveAttribute("data-principal-class", "other_account")
    await expect(entrance.first()).toContainText("other account")

    // --- one line per kind of access, colour by kind, motion only on observed --
    await expect(page.locator('g[data-flow-family="WORKLOAD_USES_ROLE"]')).toHaveCount(1, { timeout: 30_000 })
    await expect(page.locator('g[data-flow-family="ROLE_TRUST_POLICY"]')).toHaveCount(1)
    await expect(page.locator('g[data-flow-family="ROLE_ACTION_DECISION"]')).toHaveCount(1)
    expect(await strokeOf(page, "WORKLOAD_USES_ROLE")).toBe(KIND_COLOR.runs_as)
    expect(await strokeOf(page, "ROLE_TRUST_POLICY")).toBe(KIND_COLOR.may_assume)
    expect(await strokeOf(page, "ROLE_ACTION_DECISION")).toBe(KIND_COLOR.data)
    const runsAs = page.locator('g[data-flow-family="WORKLOAD_USES_ROLE"]').first()
    await expect(runsAs).toHaveAttribute("data-flow-motion", "none")
    await expect(runsAs).toHaveAttribute("data-flow-source", workload.id)
    await expect(runsAs.locator("text").first()).toHaveText("instance profile")
    const trust = page.locator('g[data-flow-family="ROLE_TRUST_POLICY"]').first()
    await expect(trust).toHaveAttribute("data-flow-motion", "none")
    await expect(trust.locator("text").first()).toHaveText("may assume · conditioned")
    const reach = page.locator('g[data-flow-family="ROLE_ACTION_DECISION"]').first()
    await expect(reach).toHaveAttribute("data-flow-plane", "observed")
    await expect(reach).toHaveAttribute("data-flow-motion", "authoritative")
    await expect(reach.locator('[data-testid="topology-flow-running-track"]')).toHaveCount(1)
    await expect(reach.locator("text").first()).toHaveText("s3 · explicit 1 · used 1")
    // The reach ends on a SERVICE anchor, never on a named bucket the row cannot name.
    await expect(reach).toHaveAttribute("data-flow-target", "__identity:service:s3__")
    await expect(page.locator('[data-flow-id="__identity:service:s3__"]').first()).toBeVisible()

    // --- legend and honesty footer -------------------------------------------
    const legend = page.getByTestId("identity-lens-legend")
    await expect(legend).toContainText("Colour · kind of access")
    await expect(legend).toContainText("Style · evidence")
    await expect(legend).toContainText("Moving = observed with a named generation")
    const footer = page.getByTestId("identity-twin-footer")
    await expect(footer).toContainText("1 role bound to a workload on this canvas")
    await expect(page.getByTestId("topology-flow-legend")).toHaveCount(0)

    // --- no clipped or overlapping chrome in the lane header, no badge on a header --
    const defects = await chromeTextDefects(page, '[data-testid="topology-iam-roles-tier"] [data-flow-obstacle="iam-roles-tier-header"]')
    expect(defects.overlaps, `overlapping lane header text at ${vp.name}`).toEqual([])
    expect(defects.collapsed, `collapsed lane header text at ${vp.name}`).toEqual([])
    expect(await railHeaderBadgeOverlaps(page), `a badge sits on a rail header at ${vp.name}`).toEqual([])

    await page.screenshot({ path: `test-results/estate-identity-default-${vp.name}.png`, fullPage: false })

    // --- selecting the role: the panel is the shared one --------------------
    await roleChips.first().click()
    const panel = page.getByTestId("topology-service-detail-panel")
    await expect(panel).toBeVisible()
    await expect(panel).toContainText("Identity & access")
    await page.screenshot({ path: `test-results/estate-identity-selected-${vp.name}.png`, fullPage: false })
  })
}
