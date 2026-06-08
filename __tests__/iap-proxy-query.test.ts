import { describe, expect, it } from "vitest"
import {
  buildIapIdentityAttackPathsQuery,
  IAP_PROXY_DEFAULT_LATERAL_CAP,
} from "@/lib/server/iap-proxy-query"

describe("buildIapIdentityAttackPathsQuery", () => {
  it("page load and attack-path facade share 8×8 enriched backend cache key", () => {
    const page = buildIapIdentityAttackPathsQuery({
      envelope: true,
      enriched: true,
    })
    const facade = buildIapIdentityAttackPathsQuery({ enriched: true })
    expect(page).toBe(
      "?max_jewels=8&max_paths_per_jewel=8&envelope=true&enriched=true",
    )
    expect(facade).toBe("?max_jewels=8&max_paths_per_jewel=8&enriched=true")
    expect(facade).toContain("max_jewels=8")
    expect(facade).not.toContain("max_jewels=12")
  })

  it("default lateral cap is 50 for graph-view facade", () => {
    expect(IAP_PROXY_DEFAULT_LATERAL_CAP).toBe(50)
  })
})
