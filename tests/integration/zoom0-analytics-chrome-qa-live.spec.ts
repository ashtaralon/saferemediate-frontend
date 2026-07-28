/**
 * LIVE Chrome QA — analytics jewel (the one in Alon's screenshot).
 * Asserts rule counts from hop DTO, cardinality N-of-M, and pin→dossier.
 */
import { test, expect } from "@playwright/test"
import { liveBaseUrl, seedAuthCookie } from "./live-auth"
import { ALON_PROD } from "./live-attack-path-pins"

const SYSTEM = process.env.ZOOM0_SYSTEM || ALON_PROD
const JEWEL = encodeURIComponent(
  process.env.ZOOM0_JEWEL_ARN ||
    "arn:aws:s3:::cyntro-demo-analytics-745783559495",
)
const READY_MS = 90_000

test.describe("Zoom0 analytics Chrome QA (live)", () => {
  test.setTimeout(120_000)

  test.beforeEach(async ({ context }) => {
    await seedAuthCookie(context)
  })

  test("fan-in shows collected rules + N-of-M; pin opens dossier", async ({
    page,
    context,
  }) => {
    // Match the desktop operator canvas used for Attack Map review.
    await page.setViewportSize({ width: 2048, height: 1152 })
    await seedAuthCookie(context)
    await page.goto(
      `${liveBaseUrl()}/systems?systemName=${SYSTEM}&tab=attack-paths&jewel=${JEWEL}`,
      { waitUntil: "domcontentloaded" },
    )
    const url = new URL(page.url())
    if (url.searchParams.has("path")) {
      url.searchParams.delete("path")
      await page.goto(url.toString(), { waitUntil: "domcontentloaded" })
    }

    await expect(page.getByTestId("zoom0-fan-in")).toBeVisible({
      timeout: READY_MS,
    })
    await expect(page.getByTestId("zoom0-path-details-loading")).toHaveCount(0, {
      timeout: READY_MS,
    })

    const map = page.getByTestId("zoom0-attack-map-slot")
    await expect(map).toBeVisible()

    // Server cardinality must surface (not a vague "N Neo4j paths").
    const cardinality = page.getByTestId("zoom0-path-cardinality")
    await expect(cardinality).toContainText(/\d+ eligible/, {
      timeout: READY_MS,
    })
    await expect(cardinality).toContainText(/\d+ returned/)
    await expect(cardinality).toContainText(/\d+ drawn/)
    await expect(cardinality).toContainText(/\d+ omitted/)
    await expect(map.getByText(/Compressed evidence view/i)).toBeVisible()
    await expect(map.getByText(/\d+ eligible|\d+ drawn/i)).toBeVisible()

    // Hop DTO has COLLECTED rules for this jewel's EC2 path — must not lie.
    const body = await page.locator("body").innerText()
    const notCollected = (body.match(/rules not collected/gi) || []).length
    const ruleCounts = body.match(/\b\d+\s+rules?\b/gi) || []
    console.log(
      "analytics_qa",
      JSON.stringify({ notCollected, ruleCounts: ruleCounts.slice(0, 12) }),
    )
    expect(
      notCollected,
      "SG/NACL still say rules not collected despite COLLECTED hop DTO",
    ).toBe(0)
    expect(ruleCounts.length).toBeGreaterThan(0)

    await page.screenshot({
      path: "test-results/analytics-fan-in-chrome-qa.png",
      fullPage: true,
    })
    const expand = page.getByRole("button", { name: /expand/i }).first()
    if (await expand.isVisible()) {
      await expand.click()
      await expect(map).toBeVisible()
    }
    await map.screenshot({
      path: "test-results/analytics-fan-in-map-chrome-qa.png",
    })
    const collapse = page.getByRole("button", { name: /collapse canvas/i })
    if (await collapse.isVisible()) {
      await collapse.click()
      await expect(page.getByTestId("zoom0-path-row").first()).toBeVisible()
    }

    // Pin → dossier
    await page.getByTestId("zoom0-path-row").first().click()
    await expect(page.getByTestId("zoom0-fan-in")).toBeVisible()
    await expect(page.getByTestId("current-access-dossier")).toBeVisible({
      timeout: READY_MS,
    })
    for (const kind of [
      "credential",
      "execution_network",
      "authorization",
      "data_operation",
      "damage",
      "cut",
    ]) {
      await expect(page.getByTestId(`dossier-checkpoint-${kind}`)).toBeVisible()
    }

    await page.screenshot({
      path: "test-results/analytics-chrome-qa.png",
      fullPage: true,
    })
  })
})
