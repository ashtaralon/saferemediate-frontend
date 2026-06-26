/**
 * LIVE Chrome QA — Topology tab + Crown Jewel Spotlight on cyntro.io.
 * Covers the regression: "Spotlight failed — Backend slow — no response in 55s".
 */
import { test, expect } from "@playwright/test"
import { authedApi, seedAuthCookie } from "./live-auth"

const SYSTEM = "alon-prod"
const SAM_BUCKET = "aws-sam-cli-managed-default-samclisourcebucket-zpixwbu9coth"
const SAM_ARN = `arn:aws:s3:::${SAM_BUCKET}`

const TOPOLOGY_URL = `/systems?systemName=${SYSTEM}&tab=dependency-map`
const SPOTLIGHT_URL = `${TOPOLOGY_URL}&cj=${encodeURIComponent(SAM_BUCKET)}`

async function waitForTopologyReady(page: import("@playwright/test").Page) {
  await expect(page.getByRole("button", { name: "Graph View" })).toBeVisible({
    timeout: 60_000,
  })
}

test.describe("topology + crown jewel spotlight QA", () => {
  test.beforeEach(async ({ context }) => {
    test.setTimeout(240_000)
    await seedAuthCookie(context)
  })

  test("topology tab loads graph view without hard error", async ({ page }) => {
    const failed: string[] = []
    page.on("response", (res) => {
      const url = res.url()
      if (
        url.includes("/api/proxy/dependency-map/full") &&
        res.status() >= 500
      ) {
        failed.push(`${res.status()} ${url}`)
      }
    })

    await page.goto(TOPOLOGY_URL, { waitUntil: "domcontentloaded" })
    await waitForTopologyReady(page)

    expect(
      page.getByText(/Failed to fetch dependency map/i),
    ).not.toBeVisible()
    expect(failed).toEqual([])
  })

  test("crown jewel picker loads and lists jewels", async ({ page }) => {
    await page.goto(TOPOLOGY_URL, { waitUntil: "domcontentloaded" })
    await waitForTopologyReady(page)

    // Picker renders when IAP jewels fetch succeeds (may take a few seconds).
    const picker = page.getByText(/Crown Jewel/i).first()
    await expect(picker).toBeVisible({ timeout: 90_000 })

    await expect(page.getByText(/couldn't load/i)).not.toBeVisible()
    await expect(page.getByText(/COULDN'T LOAD/i)).not.toBeVisible()
  })

  test("SAM bucket spotlight deep-link loads paths (no timeout error)", async ({
    page,
  }) => {
    const summaryWait = page.waitForResponse(
      (res) =>
        res.url().includes("/by-crown-jewel/summary") &&
        res.request().method() === "GET",
      { timeout: 120_000 },
    )

    await page.goto(SPOTLIGHT_URL, { waitUntil: "domcontentloaded" })
    await waitForTopologyReady(page)

    await expect(page.getByText("Crown Jewel Spotlight")).toBeVisible({
      timeout: 30_000,
    })

    const summaryRes = await summaryWait
    expect(summaryRes.status()).toBe(200)

    // Wait for populated or error state (not stuck on spinner forever).
    await expect(
      page
        .getByText(/observed path|path total|paths total|\d+ path/i)
        .or(page.getByText("Spotlight failed"))
        .first(),
    ).toBeVisible({ timeout: 120_000 })

    await expect(page.getByText("Spotlight failed")).not.toBeVisible()
    await expect(page.getByText(/Backend slow — no response in 55s/i)).not.toBeVisible()
  })

  test("picker → SAM bucket opens TFM spotlight (stays on topology)", async ({ page }) => {
    await page.goto(TOPOLOGY_URL, { waitUntil: "domcontentloaded" })
    await waitForTopologyReady(page)

    await expect(page.getByText("Crown Jewels in this system")).toBeVisible({
      timeout: 120_000,
    })

    const trigger = page.getByRole("button", { name: /Pick a crown jewel/i })
    await trigger.click({ timeout: 30_000 })

    const samRow = page.getByText(SAM_BUCKET).first()
    if ((await samRow.count()) === 0) {
      const s3Row = page.getByText(/sam-cli|zpixwbu9coth/i).first()
      if ((await s3Row.count()) === 0) {
        test.skip(true, "SAM bucket not in crown jewel picker")
      }
      await s3Row.click()
    } else {
      await samRow.click()
    }

    // CJ pick stays on Topology / TFM — inline Spotlight with path list.
    await expect(page).toHaveURL(/tab=dependency-map/, { timeout: 60_000 })
    await expect(page).toHaveURL(/cj=/, { timeout: 60_000 })
    await expect(page).not.toHaveURL(/attack-paths-v2/)
    await expect(page.getByText("Crown Jewel Spotlight")).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.getByTestId("cj-spotlight-path-list")).toBeVisible({
      timeout: 60_000,
    })
  })

  test("spotlight summary proxy returns 200 for SAM bucket", async ({
    playwright,
  }) => {
    const request = await authedApi(playwright)
    const res = await request.get(
      `/api/proxy/attack-paths/${SYSTEM}/by-crown-jewel/summary?cj_name=${encodeURIComponent(SAM_BUCKET)}`,
    )
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.paths_total ?? body.paths?.length ?? 0).toBeGreaterThan(0)
    await request.dispose()
  })

  test("dep-map proxy returns nodes for alon-prod", async ({ playwright }) => {
    const request = await authedApi(playwright)
    const res = await request.get(
      `/api/proxy/dependency-map/full?systemName=${SYSTEM}&includeUnused=true&maxNodes=300`,
    )
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect((body.nodes ?? []).length).toBeGreaterThan(0)
    await request.dispose()
  })
})
