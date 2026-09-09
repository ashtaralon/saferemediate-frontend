import { afterEach, describe, expect, it, vi } from "vitest"

import { fetchSecurityFindings } from "@/lib/api-client"
import { normalizeFindingIdentities } from "@/lib/security-finding-identity"

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("security finding identity boundary", () => {
  it("repairs persisted finding rows before stale-while-revalidate rendering", () => {
    const result = normalizeFindingIdentities([
      { finding_id: " canonical-1 ", title: "valid" },
      { id: "", title: "legacy invalid", resourceId: "customer-resource-marker" },
    ])

    expect(result.withheldCount).toBe(1)
    expect(result.findings).toEqual([
      { id: "canonical-1", finding_id: "canonical-1", title: "valid" },
    ])
    expect(JSON.stringify(result.findings)).not.toContain("customer-resource-marker")
  })

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
