import fs from "node:fs"
import path from "node:path"
import { expect, test, type Page } from "@playwright/test"
import { seedAuthCookie } from "./live-auth"

const SYSTEM = "alon-prod"
const ESTATE_URL = `/topology/v0.2-estate?systemName=${SYSTEM}`
const SNAPSHOT = JSON.parse(
  fs.readFileSync(
    path.join(process.cwd(), "docs/mocks/topology-snapshot-alon-prod.json"),
    "utf8",
  ),
)

async function routeSnapshot(page: Page) {
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

test("fullscreen platform map shows named Lambda, protected AZ labels, directional flow, legend, and e2e service path", async ({
  context,
  page,
}) => {
  test.setTimeout(120_000)
  await seedAuthCookie(context)
  await routeSnapshot(page)
  await page.setViewportSize({ width: 2048, height: 1100 })
  await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })

  await expect(page.getByRole("heading", { name: "Service index" })).toBeVisible()
  await expect(page.getByText("Next worst")).toHaveCount(0)

  const dependencies = page.getByRole("button", { name: "Dependencies" }).first()
  await dependencies.click()
  await expect(dependencies).toHaveAttribute("aria-pressed", "true")
  const legend = page.getByTestId("topology-flow-legend").first()
  await expect(legend).toBeVisible()
  await expect(legend).toContainText("Service call")
  await expect(legend).toContainText("AWS data service")
  await expect(legend).toContainText("VPC endpoint")
  await expect(legend).toContainText("Internet egress")
  await expect(legend).toContainText("Database")

  await page.getByTestId("topology-estate-map-enlarge").click()
  const fullscreen = page.getByTestId("topology-estate-map-fullscreen")
  await expect(fullscreen).toBeVisible()

  const lambda = fullscreen.getByRole("button", { name: /alon-prod-continuous-traffic/i })
  await expect(lambda).toBeVisible()
  const lambdaBox = await lambda.boundingBox()
  expect(lambdaBox).not.toBeNull()
  expect(lambdaBox!.x).toBeGreaterThanOrEqual(0)
  expect(lambdaBox!.y).toBeGreaterThanOrEqual(0)
  expect(lambdaBox!.x + lambdaBox!.width).toBeLessThanOrEqual(2048)
  expect(lambdaBox!.y + lambdaBox!.height).toBeLessThanOrEqual(1100)

  const movingPacket = fullscreen.getByTestId("topology-flow-packet").first()
  await expect(movingPacket).toBeAttached()
  const firstPosition = await movingPacket.evaluate(packet => {
    const rect = packet.getBoundingClientRect()
    return { x: rect.x, y: rect.y }
  })
  await page.waitForTimeout(550)
  const secondPosition = await movingPacket.evaluate(packet => {
    const rect = packet.getBoundingClientRect()
    return { x: rect.x, y: rect.y }
  })
  expect(
    Math.abs(firstPosition.x - secondPosition.x) + Math.abs(firstPosition.y - secondPosition.y),
  ).toBeGreaterThan(2)

  const azLabels = fullscreen.locator('[data-flow-obstacle="az-header-row"] [title^="eu-west-1"]')
  const azCount = await azLabels.count()
  expect(azCount).toBeGreaterThanOrEqual(2)
  for (let index = 0; index < azCount; index += 1) {
    const label = azLabels.nth(index)
    const isTopmost = await label.evaluate(element => {
      const rect = element.getBoundingClientRect()
      const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      return top === element || element.contains(top)
    })
    expect(isTopmost).toBe(true)
  }

  await lambda.click()
  const detail = page.getByTestId("topology-service-detail-panel")
  await expect(detail).toBeVisible()
  await expect(detail.getByText("Service inspector")).toBeVisible()
  await expect(detail.getByText("AWS-managed runtime · not VPC-attached").first()).toBeVisible()
  const pathMap = detail.getByTestId("topology-service-path-map")
  await expect(pathMap).toBeVisible()
  await expect(pathMap).toContainText("Neo4j graph")
  await expect(pathMap).toContainText("alon-prod-continuous-traffic")
  await expect(pathMap).toContainText("alon-demo-data-bucket-745783559495")
  await expect(pathMap.locator("svg text").first()).toHaveText("S3 access")
  await expect(pathMap.getByTestId("topology-inspector-flow-packet").first()).toBeAttached()
  await expect(detail.getByText("alon-demo-data-bucket-745783559495").last()).toBeVisible()
  await expect(detail.getByText("S3 · ACTUAL_S3_ACCESS")).toBeVisible()

  await page.screenshot({
    path: "test-results/topology-platform-map-fullscreen.png",
    fullPage: false,
  })
})
