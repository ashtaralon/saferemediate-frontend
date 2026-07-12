import { describe, expect, it } from "vitest"
import {
  SNAPSHOT_PROXY_TIMEOUT_MS,
  TOPOLOGY_RISK_PROXY_TIMEOUT_MS,
} from "@/lib/server/snapshot-proxy"

describe("snapshot proxy timeouts", () => {
  it("keeps IAP/snapshot tight by default", () => {
    expect(SNAPSHOT_PROXY_TIMEOUT_MS).toBe(5000)
  })

  it("gives topology-risk a full cold-build budget", () => {
    expect(TOPOLOGY_RISK_PROXY_TIMEOUT_MS).toBe(55_000)
  })
})
