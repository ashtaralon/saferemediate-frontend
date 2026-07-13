import { describe, expect, it } from "vitest"
import {
  buildIapIdentityAttackPathsQuery,
  IAP_PROXY_DEFAULT_LATERAL_CAP,
  IAP_PROXY_DEFAULT_MAX_JEWELS,
  IAP_PROXY_DEFAULT_MAX_PATHS_PER_JEWEL,
} from "@/lib/server/iap-proxy-query"

describe("buildIapIdentityAttackPathsQuery", () => {
  const j = IAP_PROXY_DEFAULT_MAX_JEWELS
  const p = IAP_PROXY_DEFAULT_MAX_PATHS_PER_JEWEL

  // Contract: page load + attack-path facade must build the SAME backend cache
  // key, and it must equal what the backend per-system prewarm warms. If they
  // drift, the prewarm heats a key the FE never reads -> cold-key 504s +
  // duplicate snapshots (the 2026-07 incident). Assert against the exported
  // constants so this test TRACKS the source instead of going stale — it
  // previously pinned 8x8 and silently failed after the 12x8 move.
  it("page load and attack-path facade share the canonical enriched backend cache key", () => {
    const page = buildIapIdentityAttackPathsQuery({ envelope: true, enriched: true })
    const facade = buildIapIdentityAttackPathsQuery({ enriched: true })
    expect(page).toBe(
      `?max_jewels=${j}&max_paths_per_jewel=${p}&envelope=true&enriched=true`,
    )
    expect(facade).toBe(`?max_jewels=${j}&max_paths_per_jewel=${p}&enriched=true`)
    // Same jewel count on both surfaces => same snapshot key (no cache miss).
    expect(facade).toContain(`max_jewels=${j}`)
    expect(page).toContain(`max_jewels=${j}`)
  })

  // Cross-repo drift alarm. The FE default MUST stay 12x8 to match the backend
  // per-system prewarm (api/identity_attack_paths.py: PREWARM_MAX_JEWELS=12,
  // PREWARM_MAX_PATHS_PER_JEWEL=8). Changing either side without the other
  // reintroduces the cold-key / duplicate-snapshot bug — this fails loudly if
  // someone bumps the FE constant off the agreed 12x8 contract.
  it("canonical key params match the backend prewarm (12x8)", () => {
    expect(IAP_PROXY_DEFAULT_MAX_JEWELS).toBe(12)
    expect(IAP_PROXY_DEFAULT_MAX_PATHS_PER_JEWEL).toBe(8)
  })

  it("default lateral cap is 50 for graph-view facade", () => {
    expect(IAP_PROXY_DEFAULT_LATERAL_CAP).toBe(50)
  })
})
