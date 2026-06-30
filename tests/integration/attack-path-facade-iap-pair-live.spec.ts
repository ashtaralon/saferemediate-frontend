import { test, expect } from "@playwright/test"
import { authedApi, liveGetWithRetry } from "./live-auth"
import {
  ALON_PROD,
  FACADE_IAP_QUERY,
} from "./live-attack-path-pins"

/**
 * Prove the attack-path facade resolves a correctly paired IAP row.
 * Uses the same IAP query limits as the facade (8×8) so the probe row
 * is guaranteed to be in the truncated set the facade sees.
 */
export async function probeFacadeIapPair(playwright: import("@playwright/test").Playwright) {
  const api = await authedApi(playwright)
  try {
    const iapRes = await liveGetWithRetry(
      api,
      `/api/proxy/identity-attack-paths/${ALON_PROD}${FACADE_IAP_QUERY}`,
    )
    expect(iapRes.ok(), `IAP ${iapRes.status()}`).toBe(true)
    const iap = (await iapRes.json()) as {
      paths?: Array<{ id: string; crown_jewel_id: string; attack_path_id?: string }>
    }
    const row = (iap.paths ?? []).find(
      (p) => p.id && p.crown_jewel_id && p.id.startsWith("path-"),
    )
    expect(row, "IAP 8×8 window must contain at least one path row").toBeTruthy()

    const jewelEnc = encodeURIComponent(row!.crown_jewel_id)
    const facadeRes = await liveGetWithRetry(
      api,
      `/api/proxy/attack-path/${ALON_PROD}/${jewelEnc}?path_id=${encodeURIComponent(row!.id)}`,
      3,
      12_000,
    )
    expect(
      facadeRes.status(),
      `facade ${facadeRes.status()} ${await facadeRes.text().then((t) => t.slice(0, 200))}`,
    ).toBe(200)
    const body = await facadeRes.json()
    expect(body.path_id).toBe(row!.id)
    expect(body.system_name).toBe(ALON_PROD)
  } finally {
    await api.dispose()
  }
}

test.describe("attack-path facade IAP pair probe", () => {
  test("correctly paired (path_id, crown_jewel_id) resolves — not path_not_found", async ({
    playwright,
  }) => {
    test.setTimeout(180_000)
    await probeFacadeIapPair(playwright)
  })
})
