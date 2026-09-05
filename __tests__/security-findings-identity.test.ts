import { afterEach, describe, expect, it, vi } from "vitest"

import { fetchSecurityFindings } from "@/lib/api-client"

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("security finding identity boundary", () => {
  it("normalizes supported backend ID aliases and withholds rows without an ID", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    vi.spyOn(console, "log").mockImplementation(() => undefined)
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          findings: [
            { finding_id: " finding-1 ", title: "Canonical" },
            { id: "finding-2", title: "Legacy alias" },
            { title: "must-not-render", resourceId: "customer-resource-marker" },
          ],
        }),
      ),
    )

    const findings = await fetchSecurityFindings("testbed-webshop")

    expect(findings.map((finding) => finding.id)).toEqual(["finding-1", "finding-2"])
    expect(findings.map((finding) => finding.finding_id)).toEqual(["finding-1", "finding-2"])
    expect(findings.some((finding) => finding.title === "must-not-render")).toBe(false)
    expect(warn).toHaveBeenCalledOnce()
    expect(warn).toHaveBeenCalledWith(
      "[api-client] Withheld 1 finding(s) without a canonical backend ID",
    )
    expect(JSON.stringify(warn.mock.calls)).not.toContain("customer-resource-marker")
  })

  it("returns an empty collection when every row lacks a canonical ID", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    vi.spyOn(console, "log").mockImplementation(() => undefined)
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ findings: [{ title: "No identity" }] })),
    )

    await expect(fetchSecurityFindings()).resolves.toEqual([])
  })
})
