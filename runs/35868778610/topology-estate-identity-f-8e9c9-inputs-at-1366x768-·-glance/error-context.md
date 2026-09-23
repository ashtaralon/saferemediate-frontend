# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-estate-identity-fixture.spec.ts >> the identity lens is the Network frame with identity inputs at 1366x768 · glance
- Location: tests/integration/topology-estate-identity-fixture.spec.ts:102:7

# Error details

```
Error: expect(locator).toHaveAttribute(expected) failed

Locator:  locator('[data-testid="topology-identity-principal"]').first()
Expected: "other_account"
Received: "org_management"
Timeout:  5000ms

Call log:
  - Expect "toHaveAttribute" with timeout 5000ms
  - waiting for locator('[data-testid="topology-identity-principal"]').first()
    14 × locator resolved to <button type="button" data-principal-class="org_management" data-testid="topology-identity-principal" data-flow-id="__identity:aws_account_principal:arn:aws:iam::999988887777:root__" data-node-id="__identity:aws_account_principal:arn:aws:iam::999988887777:root__" class="relative flex flex-col items-center gap-0.5 min-w-[68px] max-w-[112px] px-1.5 py-1 rounded-md transition-all shrink-0" title="acct 9999…7777 · org management · arn:aws:iam::999988887777:root — may assume a role on this canvas — click f…>…</button>
       - unexpected value "org_management"

```

```yaml
- button "acct 9999…7777 · org management"
```

# Test source

```ts
  30  | const IDENTITY_FIXTURE = JSON.parse(
  31  |   fs.readFileSync(path.join(process.cwd(), "__tests__/fixtures/estate-identity-access.json"), "utf8"),
  32  | )
  33  | const EMITTER_ACCOUNT = "416651950952"
  34  | const EMITTER_VPC = "vpc-1"
  35  | const OUTSIDE_ACCOUNT = "999988887777"
  36  | 
  37  | /** The EC2 chip in the snapshot's own VPC that the role will run as. */
  38  | function boundWorkload(): { id: string; name: string } {
  39  |   const node = (SNAPSHOT.nodes as Array<{ id: string; name: string; type: string; vpc_id?: string | null }>).find(
  40  |     n => n.type === "EC2" && n.vpc_id === SNAPSHOT.vpc_id,
  41  |   )
  42  |   if (!node) throw new Error("snapshot carries no EC2 chip in its own VPC")
  43  |   return { id: node.id, name: node.name }
  44  | }
  45  | 
  46  | function identitySnapshot() {
  47  |   const account = String(SNAPSHOT.account_id)
  48  |   const region = String(SNAPSHOT.region)
  49  |   const vpc = String(SNAPSHOT.vpc_id)
  50  |   const workload = boundWorkload()
  51  |   const remapped = JSON.parse(
  52  |     JSON.stringify(IDENTITY_FIXTURE.ready).split(EMITTER_ACCOUNT).join(account).split(JSON.stringify(EMITTER_VPC)).join(JSON.stringify(vpc)),
  53  |   )
  54  |   remapped.scope = { customer_id: ORGANIZATION.customer_id, system_name: SYSTEM, account_id: account, region, vpc_id: vpc }
  55  |   remapped.roles = remapped.roles.map((role: { workload_ids: string[] }) => ({ ...role, workload_ids: [workload.id] }))
  56  |   const graph = remapped.identity_graph
  57  |   graph.scope = {
  58  |     level: "account",
  59  |     customer_id: ORGANIZATION.customer_id,
  60  |     account_id: account,
  61  |     inventory_generation: remapped.inventory_authority.generation,
  62  |     region: null,
  63  |     system_name: null,
  64  |     vpc_id: null,
  65  |   }
  66  |   const serviceTrust = graph.edges.find(
  67  |     (edge: { family: string; source: { node_kind: string } }) => edge.family === "ROLE_TRUST_POLICY" && edge.source.node_kind === "service_principal",
  68  |   )
  69  |   if (!serviceTrust) throw new Error("emitter fixture carries no service-principal trust statement to mirror")
  70  |   graph.edges.push({
  71  |     ...serviceTrust,
  72  |     source: {
  73  |       node_kind: "aws_account_principal",
  74  |       arn: `arn:aws:iam::${OUTSIDE_ACCOUNT}:root`,
  75  |       name: `arn:aws:iam::${OUTSIDE_ACCOUNT}:root`,
  76  |       resource_uid: null,
  77  |       resolved: false,
  78  |       unresolved_reason: "ENDPOINT_NOT_A_PROJECTED_RESOURCE",
  79  |     },
  80  |     effect: "Allow",
  81  |     has_conditions: true,
  82  |     is_wildcard_principal: false,
  83  |     principal_kind: "AWS",
  84  |   })
  85  |   graph.edges_total = graph.edges.length
  86  |   return { snapshot: { ...SNAPSHOT, identity_access: remapped }, workload }
  87  | }
  88  | 
  89  | const VIEWPORTS = [
  90  |   { name: "1024x720", width: 1024, height: 720 },
  91  |   { name: "1366x768", width: 1366, height: 768 },
  92  |   { name: "1600x900", width: 1600, height: 900 },
  93  | ] as const
  94  | 
  95  | const KIND_COLOR = { runs_as: "#4338CA", may_assume: "#7C3AED", data: "#1E8E3E" } as const
  96  | 
  97  | async function strokeOf(page: Page, family: string): Promise<string | null> {
  98  |   return page.locator(`g[data-flow-family="${family}"] path[data-flow-line="stroke"]`).first().getAttribute("stroke")
  99  | }
  100 | 
  101 | for (const vp of VIEWPORTS) {
  102 |   test(`the identity lens is the Network frame with identity inputs at ${vp.name} · glance`, async ({ context, page }) => {
  103 |     test.setTimeout(150_000)
  104 |     const { snapshot, workload } = identitySnapshot()
  105 |     await seedAuthCookie(context)
  106 |     await routeSnapshot(page, snapshot)
  107 |     await page.setViewportSize({ width: vp.width, height: vp.height })
  108 |     await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
  109 |     await expect(page.getByTestId("topology-estate-view-map")).toBeVisible({ timeout: 60_000 })
  110 |     await page.getByRole("tab", { name: "Identity & access" }).click()
  111 |     // No density toggle on the identity lens (it is Network-only chrome; the
  112 |     // view-switch suite pins its absence) — glance is the lens's density.
  113 | 
  114 |     // --- the SAME frame, with identity inputs --------------------------------
  115 |     await expect(page.getByTestId("topology-vpc-frame").first()).toBeVisible()
  116 |     const lane = page.getByTestId("topology-iam-roles-tier")
  117 |     await expect(lane, `no IAM roles lane at ${vp.name}`).toBeVisible()
  118 |     await expect(lane).toContainText("IAM · Roles (1)")
  119 |     const roleChips = lane.locator("[data-flow-id]")
  120 |     await expect(roleChips).toHaveCount(1)
  121 |     await expect(roleChips.first().locator("img")).toHaveCount(1)
  122 |     await expect(page.locator(`[data-flow-id="${workload.id}"]`).first()).toBeVisible()
  123 |     await expect(page.getByTestId("topology-internet-node")).toHaveCount(0)
  124 | 
  125 |     // --- trust entrances in the strip ----------------------------------------
  126 |     const principals = page.getByTestId("topology-identity-principals")
  127 |     await expect(principals).toContainText("Trust entrances")
  128 |     const entrance = page.locator('[data-testid="topology-identity-principal"]')
  129 |     await expect(entrance).toHaveCount(1)
> 130 |     await expect(entrance.first()).toHaveAttribute("data-principal-class", "other_account")
      |                                    ^ Error: expect(locator).toHaveAttribute(expected) failed
  131 |     await expect(entrance.first()).toContainText("other account")
  132 | 
  133 |     // --- one line per kind of access, colour by kind, motion only on observed --
  134 |     await expect(page.locator('g[data-flow-family="WORKLOAD_USES_ROLE"]')).toHaveCount(1, { timeout: 30_000 })
  135 |     await expect(page.locator('g[data-flow-family="ROLE_TRUST_POLICY"]')).toHaveCount(1)
  136 |     await expect(page.locator('g[data-flow-family="ROLE_ACTION_DECISION"]')).toHaveCount(1)
  137 |     expect(await strokeOf(page, "WORKLOAD_USES_ROLE")).toBe(KIND_COLOR.runs_as)
  138 |     expect(await strokeOf(page, "ROLE_TRUST_POLICY")).toBe(KIND_COLOR.may_assume)
  139 |     expect(await strokeOf(page, "ROLE_ACTION_DECISION")).toBe(KIND_COLOR.data)
  140 |     const runsAs = page.locator('g[data-flow-family="WORKLOAD_USES_ROLE"]').first()
  141 |     await expect(runsAs).toHaveAttribute("data-flow-motion", "none")
  142 |     await expect(runsAs).toHaveAttribute("data-flow-source", workload.id)
  143 |     await expect(runsAs.locator("text").first()).toHaveText("instance profile")
  144 |     const trust = page.locator('g[data-flow-family="ROLE_TRUST_POLICY"]').first()
  145 |     await expect(trust).toHaveAttribute("data-flow-motion", "none")
  146 |     await expect(trust.locator("text").first()).toHaveText("may assume · conditioned")
  147 |     const reach = page.locator('g[data-flow-family="ROLE_ACTION_DECISION"]').first()
  148 |     await expect(reach).toHaveAttribute("data-flow-plane", "observed")
  149 |     await expect(reach).toHaveAttribute("data-flow-motion", "authoritative")
  150 |     await expect(reach.locator('[data-testid="topology-flow-running-track"]')).toHaveCount(1)
  151 |     await expect(reach.locator("text").first()).toHaveText("s3 · explicit 1 · used 1")
  152 |     // The reach ends on a SERVICE anchor, never on a named bucket the row cannot name.
  153 |     await expect(reach).toHaveAttribute("data-flow-target", "__identity:service:s3__")
  154 |     await expect(page.locator('[data-flow-id="__identity:service:s3__"]').first()).toBeVisible()
  155 | 
  156 |     // --- legend and honesty footer -------------------------------------------
  157 |     const legend = page.getByTestId("identity-lens-legend")
  158 |     await expect(legend).toContainText("Colour · kind of access")
  159 |     await expect(legend).toContainText("Style · evidence")
  160 |     await expect(legend).toContainText("Moving = observed with a named generation")
  161 |     const footer = page.getByTestId("identity-twin-footer")
  162 |     await expect(footer).toContainText("1 role bound to a workload on this canvas")
  163 |     await expect(page.getByTestId("topology-flow-legend")).toHaveCount(0)
  164 | 
  165 |     // --- no clipped or overlapping chrome in the lane header, no badge on a header --
  166 |     const defects = await chromeTextDefects(page, '[data-testid="topology-iam-roles-tier"] [data-flow-obstacle="iam-roles-tier-header"]')
  167 |     expect(defects.overlaps, `overlapping lane header text at ${vp.name}`).toEqual([])
  168 |     expect(defects.collapsed, `collapsed lane header text at ${vp.name}`).toEqual([])
  169 |     expect(await railHeaderBadgeOverlaps(page), `a badge sits on a rail header at ${vp.name}`).toEqual([])
  170 | 
  171 |     await page.screenshot({ path: `test-results/estate-identity-default-${vp.name}.png`, fullPage: false })
  172 | 
  173 |     // --- selecting the role: the panel is the shared one --------------------
  174 |     await roleChips.first().click()
  175 |     const panel = page.getByTestId("topology-service-detail-panel")
  176 |     await expect(panel).toBeVisible()
  177 |     await expect(panel).toContainText("Identity & access")
  178 |     await page.screenshot({ path: `test-results/estate-identity-selected-${vp.name}.png`, fullPage: false })
  179 |   })
  180 | }
  181 | 
```