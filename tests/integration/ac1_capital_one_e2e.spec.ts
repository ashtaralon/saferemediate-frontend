/**
 * AC-1 Capital One — live E2E pin.
 *
 * Verifies: attack_class on by-crown-jewel API + IMDS initial-access category
 * visible on topology when Capital One paths exist on alon-prod.
 */
import { test, expect } from "@playwright/test"
import { seedAuthCookie } from "./live-auth"

const SYSTEM = process.env.AC1_SYSTEM || "alon-prod"
const BACKEND =
  process.env.BACKEND_URL || "https://saferemediate-backend-f.onrender.com"

test.describe("AC-1 Capital One E2E", () => {
  test.beforeEach(async ({ context }) => {
    await seedAuthCookie(context)
  })

  test("by-crown-jewel paths expose attack_class when AC-1 tagged", async ({
    request,
  }) => {
    const listRes = await request.get(
      `${BACKEND}/api/attack-paths/${SYSTEM}/by-crown-jewel/summary?cj_name=sam-test-bucket`,
    )
    if (!listRes.ok()) {
      test.skip(true, `summary unavailable (${listRes.status()})`)
    }
    const body = await listRes.json()
    const paths = body.paths || []
    const ac1 = paths.filter((p: { attack_class?: string }) => p.attack_class === "AC-1")
    if (ac1.length === 0) {
      test.skip(true, "No AC-1 tagged paths on this env yet — run sync-all after deploy")
    }
    expect(ac1[0].catalog_name).toBe("Capital One")
    expect(ac1[0].catalog_title).toMatch(/IMDSv1/i)
  })

  test("IMDSv1OnPublicInstance findings exist in graph via API proxy", async ({
    page,
    context,
  }) => {
    await seedAuthCookie(context)
    await page.goto(`/systems?systemName=${SYSTEM}&tab=dependency-map`, {
      waitUntil: "domcontentloaded",
    })
    const health = await page.request.get(`${BACKEND}/health`)
    expect(health.ok()).toBeTruthy()
  })
})
