/**
 * LIVE QA — Estate Map VPC scope picker + topology-risk vpc_id param.
 * Requires BE deploy with available_vpcs / ?vpc_id= support.
 */
import { test, expect } from "@playwright/test"
import { authedApi, liveGetWithRetry, seedAuthCookie } from "./live-auth"

const SYSTEM = "alon-prod"
const TOPOLOGY_URL = `/systems?systemName=${SYSTEM}&tab=dependency-map`
const ESTATE_URL = `/topology/v0.2-estate?systemName=${SYSTEM}`

test.describe("estate map VPC scope e2e", () => {
  test.beforeEach(async ({ context }) => {
    test.setTimeout(240_000)
    await seedAuthCookie(context)
  })

  test("topology-risk proxy returns available_vpcs for alon-prod", async ({
    playwright,
  }) => {
    const request = await authedApi(playwright)
    const res = await liveGetWithRetry(
      request,
      `/api/proxy/topology-risk/${SYSTEM}`,
    )
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.system).toBe(SYSTEM)
    expect(Array.isArray(body.available_vpcs)).toBe(true)
    expect(body.available_vpcs.length).toBeGreaterThan(0)
    for (const v of body.available_vpcs) {
      expect(v.vpc_id).toMatch(/^vpc-/)
      expect(typeof v.workload_count).toBe("number")
    }
    await request.dispose()
  })

  test("topology-risk vpc_id param scopes response", async ({ playwright }) => {
    const request = await authedApi(playwright)
    const allRes = await liveGetWithRetry(
      request,
      `/api/proxy/topology-risk/${SYSTEM}`,
    )
    expect(allRes.status()).toBe(200)
    const allBody = await allRes.json()
    const targetVpc = allBody.available_vpcs?.[0]?.vpc_id
    expect(targetVpc).toBeTruthy()

    const scopedRes = await liveGetWithRetry(
      request,
      `/api/proxy/topology-risk/${SYSTEM}?vpc_id=${encodeURIComponent(targetVpc)}`,
    )
    expect(scopedRes.status()).toBe(200)
    const scopedBody = await scopedRes.json()
    expect(scopedBody.selected_vpc_id).toBe(targetVpc)
    expect(scopedBody.vpc_id).toBe(targetVpc)
    if (scopedBody.vpc_topology?.subnets?.length) {
      for (const s of scopedBody.vpc_topology.subnets) {
        expect(s.vpc_id).toBe(targetVpc)
      }
    }
    await request.dispose()
  })

  test("estate map renders VPC scope picker", async ({ page }) => {
    await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
    const unavailable = page.getByText(/Topology risk unavailable/i)
    const picker = page.getByTestId("topology-vpc-select")
    await expect(picker.or(unavailable).first()).toBeVisible({ timeout: 120_000 })
    if (await unavailable.isVisible().catch(() => false)) {
      test.skip(true, "topology-risk unavailable (cold BE)")
    }
    await expect(picker).toBeVisible({ timeout: 120_000 })
    const optionCount = await picker.locator("option").count()
    expect(optionCount).toBeGreaterThan(1)
  })

  test("VPC scope change refetches topology-risk", async ({ page }) => {
    await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
    const picker = page.getByTestId("topology-vpc-select")
    await expect(picker).toBeVisible({ timeout: 120_000 })

    const responses: string[] = []
    page.on("response", (res) => {
      const url = res.url()
      if (url.includes("/api/proxy/topology-risk/") && res.status() === 200) {
        responses.push(url)
      }
    })

    const options = picker.locator("option")
    const count = await options.count()
    if (count < 2) {
      test.skip(true, "Need at least two VPC scope options")
    }
    const secondValue = await options.nth(1).getAttribute("value")
    expect(secondValue).toBeTruthy()
    await picker.selectOption(secondValue!)
    await page.waitForTimeout(2000)
    expect(
      responses.some((u) => u.includes("vpc_id=") || u.endsWith(SYSTEM)),
    ).toBe(true)
  })

  test("serverless tier shows lambdas regardless of vpc scope", async ({ page }) => {
    await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
    const tier = page.getByTestId("topology-serverless-tier")
    await expect(tier).toBeVisible({ timeout: 120_000 })
    await expect(tier.getByText(/Serverless · outside VPC \(\d+\)/)).toBeVisible()
    const headerText = await tier.getByText(/Serverless · outside VPC \(\d+\)/).textContent()
    const expectedFromLabel = Number(headerText?.match(/\((\d+)\)/)?.[1] ?? 0)
    expect(expectedFromLabel).toBeGreaterThan(0)
    // Glance density stacks many lambdas into one tile (threshold=1).
    const stack = tier.getByTestId("topology-density-stack-tile")
    if (await stack.isVisible().catch(() => false)) {
      const stackCount = Number(await stack.getAttribute("data-stack-count"))
      expect(stackCount).toBe(expectedFromLabel)
    } else {
      expect(await tier.locator("button").count()).toBe(expectedFromLabel)
    }

    const picker = page.getByTestId("topology-vpc-select")
    await expect(picker).toBeVisible()
    const options = picker.locator("option")
    if ((await options.count()) >= 2) {
      const vpcValue = await options.nth(1).getAttribute("value")
      if (vpcValue && vpcValue !== "all") {
        await picker.selectOption(vpcValue)
        await expect(tier).toBeVisible({ timeout: 60_000 })
        await expect(tier.getByText(/Serverless · outside VPC \(\d+\)/)).toBeVisible()
        const scopedHeader = await tier
          .getByText(/Serverless · outside VPC \(\d+\)/)
          .textContent()
        const scopedLabel = Number(scopedHeader?.match(/\((\d+)\)/)?.[1] ?? 0)
        expect(scopedLabel).toBe(expectedFromLabel)
      }
    }
    await expect(tier.getByText("alon-prod-authenticator")).toBeVisible()
  })

  test("regional data tier shows edge services regardless of vpc scope", async ({ page }) => {
    await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
    const tier = page.getByTestId("topology-regional-data-tier")
    await expect(tier).toBeVisible({ timeout: 120_000 })
    // The header names the families actually in the lane, so it varies by
    // account; assert its shape, never a fixed family list.
    await expect(tier.getByText(/Regional · .+ \(\d+\)/i)).toBeVisible()
    const countAll = await tier.locator("button").count()
    expect(countAll).toBeGreaterThanOrEqual(1)

    const picker = page.getByTestId("topology-vpc-select")
    await expect(picker).toBeVisible()
    const options = picker.locator("option")
    if ((await options.count()) >= 2) {
      const vpcValue = await options.nth(1).getAttribute("value")
      if (vpcValue && vpcValue !== "all") {
        await picker.selectOption(vpcValue)
        await expect(tier).toBeVisible({ timeout: 60_000 })
        const countScoped = await tier.locator("button").count()
        expect(countScoped).toBeGreaterThanOrEqual(1)
        expect(countScoped).toBe(countAll)
      }
    }
    // RDS (alon-prod-db) belongs in VPC database tier (BE-11), not regional S3/DDB/KMS rail.
    // Accessible name is "alon-prod-db" + type sublabel — match the DB name.
    await expect(page.getByRole("button", { name: /alon-prod-db/i })).toBeVisible()
  })

  test("dependency-map estate tab loads without hard error", async ({ page }) => {
    await page.goto(TOPOLOGY_URL, { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("button", { name: "Cloud map" })).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.getByText(/Topology risk unavailable/i)).not.toBeVisible({
      timeout: 120_000,
    })
    await expect(page.getByTestId("topology-vpc-select")).toBeVisible({
      timeout: 120_000,
    })
  })

  test("flow overlay toggle switches all access and attack paths", async ({ page }) => {
    await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
    const toggle = page.getByTestId("topology-flow-mode-toggle")
    await expect(toggle).toBeVisible({ timeout: 120_000 })
    await expect(toggle.getByRole("button", { name: /All access/i })).toHaveAttribute("aria-pressed", "true")
    await toggle.getByRole("button", { name: /Attack paths only/i }).click()
    await expect(toggle.getByRole("button", { name: /Attack paths only/i })).toHaveAttribute("aria-pressed", "true")
    await toggle.getByRole("button", { name: /All access/i }).click()
    await expect(toggle.getByRole("button", { name: /All access/i })).toHaveAttribute("aria-pressed", "true")
  })
})
