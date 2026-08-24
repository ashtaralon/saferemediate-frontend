import { afterEach, describe, expect, it, vi } from "vitest"

import { getNeptuneRefreshBackendBaseUrl } from "@/lib/server/neptune-refresh-backend-url"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("Neptune refresh backend binding", () => {
  it("does not inherit the customer read-backend override", () => {
    vi.stubEnv("BACKEND_URL_OVERRIDE", "https://customer-read-api.example")
    vi.stubEnv("CYNTRO_SYNC_BACKEND_URL", "")

    expect(getNeptuneRefreshBackendBaseUrl()).toBe(
      "https://saferemediate-backend-f.onrender.com",
    )
  })

  it("allows a dedicated refresh-plane override", () => {
    vi.stubEnv("CYNTRO_SYNC_BACKEND_URL", "https://refresh.example/finish/")

    expect(getNeptuneRefreshBackendBaseUrl()).toBe("https://refresh.example/finish")
  })

  it("rejects localhost in a Vercel deployment", () => {
    vi.stubEnv("VERCEL_ENV", "production")
    vi.stubEnv("CYNTRO_SYNC_BACKEND_URL", "http://127.0.0.1:8000")

    expect(() => getNeptuneRefreshBackendBaseUrl()).toThrow("cannot use")
  })
})

