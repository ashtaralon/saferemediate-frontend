import { expect, test, type Page } from "@playwright/test"
import { liveBaseUrl, seedAuthCookie } from "./live-auth"

const SYSTEM = "testbed-webshop"
const JEWEL = "arn:aws:s3:::cyntro-tb-prod-appdata-1c8276f5"
const PATH = "path-2bdb5b15ecea"
const COMPUTE = "i-039d362b9862180c9"

function currentUrl(): string {
  const query = new URLSearchParams({
    system: SYSTEM,
    customer_id: SYSTEM,
    jewel: JEWEL,
    path: PATH,
    mode: "attack-path",
  })
  return `${liveBaseUrl()}/?${query.toString()}`
}

async function openCurrentPath(page: Page): Promise<void> {
  await page.goto(currentUrl(), { waitUntil: "domcontentloaded" })
  await expect(page.getByTestId("zoom0-current-access-tfm")).toBeVisible({
    timeout: 90_000,
  })
}

async function assertNoVerticalOverlap(page: Page): Promise<void> {
  const map = await page.getByTestId("zoom0-current-access-tfm").boundingBox()
  const detail = await page.getByTestId("zoom0-current-access-below-map").boundingBox()
  expect(map, "Attack Map must have a rendered box").not.toBeNull()
  expect(detail, "Current Access detail must have a rendered box").not.toBeNull()
  expect(map!.y + map!.height).toBeLessThanOrEqual(detail!.y + 1)
}

test.describe("Cyntro current Attack Paths live E2E", () => {
  test.beforeEach(async ({ context }) => {
    test.setTimeout(180_000)
    await seedAuthCookie(context)
  })

  test("Current Access starts at compute, draws the path, and exposes exact S3 evidence", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await openCurrentPath(page)

    await expect(page.getByText(COMPUTE, { exact: true }).first()).toBeVisible()
    await expect(
      page.getByRole("button", {
        name: "Crown Jewel S3 cyntro-tb-prod-appdata-1c8276f5 S3",
      }),
    ).toBeVisible()
    await expect(page.getByTestId("data-scope-explorer")).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText("catalog/items.json", { exact: true })).toBeVisible({
      timeout: 30_000,
    })
    await assertNoVerticalOverlap(page)
  })

  test("Crown Jewel selection binds catalog and orders independently", async ({ page }) => {
    await openCurrentPath(page)
    await page
      .getByRole("button", {
        name: "Crown Jewel S3 cyntro-tb-prod-appdata-1c8276f5 S3",
      })
      .click()

    const drawer = page.getByTestId("damage-scope-drawer")
    await expect(drawer).toBeVisible({ timeout: 60_000 })
    await expect(drawer.getByText("Read on /catalog/", { exact: true })).toBeVisible({
      timeout: 60_000,
    })
    await expect(drawer.getByText("Operation: Read", { exact: true })).toBeVisible()

    await drawer
      .getByRole("button", {
        name: "orders/ cyntro-tb-prod-appdata-1c8276f5 Write",
      })
      .click()
    await expect(drawer.getByText("Write on /orders/", { exact: true })).toBeVisible()
    await expect(drawer.getByText("Operation: Write", { exact: true })).toBeVisible()
    await expect(drawer.getByText(/These IAM permissions belong to the path identity/)).toBeVisible()
    await expect(drawer.getByText(/s3:\* still permits delete actions/)).toBeVisible()
    await expect(drawer.getByText(/ec2messages:/i)).toHaveCount(0)
  })

  test("Lateral and Exfiltration render evidence-rich, correctly qualified maps", async ({
    page,
  }) => {
    await openCurrentPath(page)

    await page.getByRole("tab", { name: "Lateral" }).click()
    await expect(page.getByRole("heading", { name: "Lateral Movement Map" })).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.getByText(/replay-validated attack chains/i).first()).toBeVisible()
    await expect(page.getByText("Not observed traffic", { exact: true })).toBeVisible()
    await expect(page.getByText(/S3 GETOBJECT DATA ACCESS/i)).toBeVisible()

    await page.getByRole("tab", { name: "Exfiltration" }).click()
    await expect(page.getByText(/EXFIL VIEW · where the data leaves/i)).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.getByText(/\d+ exfil paths · \d+ observed readers/i)).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.getByRole("heading", { name: /Exfil path · Direct API/i })).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.getByText(/does not prove exfiltration/i)).toBeVisible()
  })

  test("fullscreen Crown Jewel drawer remains inside the fullscreen canvas", async ({ page }) => {
    await openCurrentPath(page)
    await page.getByRole("button", { name: "Open map fullscreen" }).click()
    await page.waitForFunction(() => Boolean(document.fullscreenElement), null, {
      timeout: 15_000,
    })
    await page
      .getByRole("button", {
        name: "Crown Jewel S3 cyntro-tb-prod-appdata-1c8276f5 S3",
      })
      .click()
    const drawer = page.getByTestId("damage-scope-drawer")
    await expect(drawer).toBeVisible({ timeout: 60_000 })
    expect(
      await page.evaluate(() => {
        const fullscreen = document.fullscreenElement
        const scope = document.querySelector('[data-testid="damage-scope-drawer"]')
        return Boolean(fullscreen && scope && fullscreen.contains(scope))
      }),
    ).toBe(true)
  })

  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
  ]) {
    test(`map and Current Access do not overlap at ${viewport.width}×${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      await openCurrentPath(page)
      await assertNoVerticalOverlap(page)
      const overflow = await page.evaluate(() => ({
        client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }))
      expect(overflow.scroll).toBeLessThanOrEqual(overflow.client + 1)
    })
  }
})
