import { afterEach, describe, expect, it } from "vitest"
import { requireBackendUrl } from "@/lib/backend-url"

const KEYS = [
  "BACKEND_URL_OVERRIDE",
  "BACKEND_URL",
  "NEXT_PUBLIC_BACKEND_URL",
  "NEXT_PUBLIC_API_URL",
] as const

const original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]))

afterEach(() => {
  for (const key of KEYS) {
    const value = original[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe("requireBackendUrl", () => {
  it("remains fail-closed when no deployment backend is configured", () => {
    for (const key of KEYS) delete process.env[key]
    expect(() => requireBackendUrl()).toThrow(/Backend URL not configured/)
  })

  it("normalizes an explicitly configured backend URL", () => {
    process.env.BACKEND_URL = "https://backend.example///"
    expect(requireBackendUrl()).toBe("https://backend.example")
  })
})
