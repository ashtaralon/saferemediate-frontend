import { describe, expect, it } from "vitest"

import {
  inventoryStatusClassName,
  reportedInventoryStatus,
} from "@/components/all-services-tab"

describe("system All Services honesty", () => {
  it("renders missing operational status as neutral UNKNOWN", () => {
    const status = reportedInventoryStatus({ is_seed: false })

    expect(status).toBe("UNKNOWN")
    expect(inventoryStatusClassName(status)).toContain("bg-gray-100")
    expect(inventoryStatusClassName(status)).not.toContain("#10b981")
  })

  it("uses a reported operational state without replacing it with provenance", () => {
    expect(
      reportedInventoryStatus({
        is_seed: true,
        instance_state: "stopped",
      }),
    ).toBe("stopped")
  })
})
