import { describe, expect, it } from "vitest"
import { readJsonCache, writeJsonCache } from "@/lib/browser-cache"

class FakeStorage {
  values = new Map<string, string>()
  quotaFailures = 0

  getItem(key: string) { return this.values.get(key) ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) {
    if (this.quotaFailures > 0) {
      this.quotaFailures -= 1
      const error = new Error("Storage quota exceeded")
      error.name = "QuotaExceededError"
      throw error
    }
    this.values.set(key, value)
  }
}

describe("browser JSON cache", () => {
  it("stores and reads a complete payload", () => {
    const storage = new FakeStorage()
    expect(writeJsonCache(storage, "findings", [{ id: 1 }])).toEqual({ stored: true, reason: "stored" })
    expect(readJsonCache(storage, "findings")).toEqual([{ id: 1 }])
  })

  it("does not cache a partial or oversized findings list", () => {
    const storage = new FakeStorage()
    storage.values.set("findings", "old")
    expect(writeJsonCache(storage, "findings", "too large", { maxBytes: 2 })).toEqual({
      stored: false,
      reason: "oversized",
    })
    expect(storage.getItem("findings")).toBeNull()
  })

  it("evicts only the target and retries once after quota pressure", () => {
    const storage = new FakeStorage()
    storage.values.set("unrelated", "keep")
    storage.quotaFailures = 1
    expect(writeJsonCache(storage, "findings", [1, 2, 3])).toEqual({ stored: true, reason: "stored" })
    expect(storage.getItem("unrelated")).toBe("keep")
    expect(readJsonCache(storage, "findings")).toEqual([1, 2, 3])
  })

  it("degrades without throwing when quota remains exhausted", () => {
    const storage = new FakeStorage()
    storage.quotaFailures = 2
    expect(writeJsonCache(storage, "findings", [1])).toEqual({ stored: false, reason: "quota" })
    expect(storage.getItem("findings")).toBeNull()
  })
})
