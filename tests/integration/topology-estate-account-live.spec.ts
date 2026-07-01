/**
 * LIVE QA — Estate Map account + region scope (PR 1 multi-account).
 * Requires BE #265 deployed with available_accounts / ?account_id= / ?region=.
 */
import { test, expect } from "@playwright/test"
import { authedApi, liveGetWithRetry, seedAuthCookie } from "./live-auth"

const SYSTEM = "alon-prod"
const ESTATE_URL = `/topology/v0.2-estate?systemName=${SYSTEM}`

function assertNoCrossAccountLeakage(
  body: Record<string, unknown>,
  accountId: string,
  region?: string,
) {
  const nodes = (body.nodes ?? []) as Array<{ account_id?: string; region?: string }>
  for (const node of nodes) {
    if (node.account_id) expect(node.account_id).toBe(accountId)
    if (region && node.region) expect(node.region).toBe(region)
  }
  const subnets = ((body.vpc_topology as { subnets?: Array<{ az?: string }> } | undefined)
    ?.subnets ?? []) as Array<{ az?: string }>
  if (region) {
    for (const s of subnets) {
      if (s.az && s.az.length > 1) expect(s.az.slice(0, -1)).toBe(region)
    }
  }
}

test.describe("estate map account + region scope e2e", () => {
  test.beforeEach(async ({ context }) => {
    test.setTimeout(240_000)
    await seedAuthCookie(context)
  })

  test("topology-risk proxy returns available_accounts for alon-prod", async ({
    playwright,
  }) => {
    const request = await authedApi(playwright)
    const res = await liveGetWithRetry(request, `/api/proxy/topology-risk/${SYSTEM}`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.system).toBe(SYSTEM)
    expect(Array.isArray(body.available_accounts)).toBe(true)
    expect(body.available_accounts.length).toBeGreaterThan(0)
    for (const a of body.available_accounts) {
      expect(a.account_id).toMatch(/^\d{12}$/)
      expect(typeof a.workload_count).toBe("number")
    }
    await request.dispose()
  })

  test("account_id param scopes response with no cross-account leakage", async ({
    playwright,
  }) => {
    const request = await authedApi(playwright)
    const allRes = await liveGetWithRetry(request, `/api/proxy/topology-risk/${SYSTEM}`)
    expect(allRes.status()).toBe(200)
    const allBody = await allRes.json()
    const targetAccount = allBody.available_accounts?.[0]?.account_id
    expect(targetAccount).toBeTruthy()

    const scopedRes = await liveGetWithRetry(
      request,
      `/api/proxy/topology-risk/${SYSTEM}?account_id=${encodeURIComponent(targetAccount)}`,
    )
    expect(scopedRes.status()).toBe(200)
    const scopedBody = await scopedRes.json()
    expect(scopedBody.selected_account_id).toBe(targetAccount)
    assertNoCrossAccountLeakage(scopedBody, targetAccount)
    await request.dispose()
  })

  test("region param scopes response subnets and nodes", async ({ playwright }) => {
    const request = await authedApi(playwright)
    const allRes = await liveGetWithRetry(request, `/api/proxy/topology-risk/${SYSTEM}`)
    expect(allRes.status()).toBe(200)
    const allBody = await allRes.json()
    const targetAccount = allBody.available_accounts?.[0]?.account_id
    const targetRegion =
      allBody.available_regions?.[0] ??
      allBody.available_accounts?.[0]?.regions?.[0]
    test.skip(!targetAccount || !targetRegion, "Need account + region inventory")

    const scopedRes = await liveGetWithRetry(
      request,
      `/api/proxy/topology-risk/${SYSTEM}?account_id=${encodeURIComponent(targetAccount)}&region=${encodeURIComponent(targetRegion)}`,
    )
    expect(scopedRes.status()).toBe(200)
    const scopedBody = await scopedRes.json()
    expect(scopedBody.selected_region_id).toBe(targetRegion)
    assertNoCrossAccountLeakage(scopedBody, targetAccount, targetRegion)
    await request.dispose()
  })

  test("estate map renders account picker when multiple accounts", async ({ page }) => {
    await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
    await expect(page.getByText(/Topology risk unavailable/i)).not.toBeVisible({
      timeout: 120_000,
    })
    const accountPicker = page.getByTestId("topology-account-select")
    const vpcPicker = page.getByTestId("topology-vpc-select")
    await expect(vpcPicker).toBeVisible({ timeout: 120_000 })
    const accountVisible = await accountPicker.isVisible().catch(() => false)
    if (accountVisible) {
      const optionCount = await accountPicker.locator("option").count()
      expect(optionCount).toBeGreaterThan(1)
    }
  })

  test("account scope change refetches topology-risk with account_id", async ({ page }) => {
    await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
    const accountPicker = page.getByTestId("topology-account-select")
    const visible = await accountPicker.isVisible({ timeout: 120_000 }).catch(() => false)
    test.skip(!visible, "Single-account system — no account picker")

    const responses: string[] = []
    page.on("response", (res) => {
      const url = res.url()
      if (url.includes("/api/proxy/topology-risk/") && res.status() === 200) {
        responses.push(url)
      }
    })

    const options = accountPicker.locator("option")
    const count = await options.count()
    if (count < 2) test.skip(true, "Need at least two account options")
    const secondValue = await options.nth(1).getAttribute("value")
    expect(secondValue).toBeTruthy()
    await accountPicker.selectOption(secondValue!)
    await page.waitForTimeout(2000)
    expect(responses.some((u) => u.includes("account_id="))).toBe(true)
  })
})
