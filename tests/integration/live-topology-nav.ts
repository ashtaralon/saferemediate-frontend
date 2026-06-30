/**
 * Shared navigation helpers for live Topology / dependency-map e2e.
 *
 * Tab rename (2026-06): "Graph View" → "Traffic map"; default shell is
 * "Risk inventory" (estate map). Tests that need TFM / CJ picker must open
 * Traffic map explicitly.
 */
import { expect, type Page } from "@playwright/test"

/** Dependency-map shell loaded on the Topology tab. */
export async function waitForTopologyTabShell(page: Page) {
  await expect(page.getByRole("button", { name: "Risk inventory" })).toBeVisible({
    timeout: 60_000,
  })
}

/** Opens Traffic map and waits for dependency-map/full (200 when available). */
export async function openTrafficMapAndWait(page: Page) {
  await waitForTopologyTabShell(page)
  const trafficMap = page.getByRole("button", { name: "Traffic map" })
  await expect(trafficMap).toBeVisible()
  const depMapWait = page
    .waitForResponse(
      (res) =>
        res.url().includes("/api/proxy/dependency-map/full") &&
        res.request().method() === "GET" &&
        res.status() === 200,
      { timeout: 90_000 },
    )
    .catch(() => {})
  await trafficMap.click()
  await depMapWait
  await page.waitForTimeout(500)
}
