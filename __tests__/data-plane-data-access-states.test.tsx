import { cleanup, render, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/components/s3-remediation-modal", () => ({ S3RemediationModal: () => null }))

import { DataPlane } from "@/components/nhi-profile/data-plane"

function respond(status: number, body: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })))
}
function mount() {
  return render(<DataPlane identityName="role-x" detail={{}} identity={{}} onRemediate={() => {}} />)
}
const byTestId = (c: HTMLElement, id: string) => c.querySelector(`[data-testid="${id}"]`)

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const serviceLevelS3 = {
  name: "S3 resources (from permissions)", type: "S3", granularity: "service", resourceName: null,
  allowedOperations: ["READ", "WRITE"], observedOperations: ["READ"], unusedOperations: ["WRITE"],
  accessLevel: "WRITE", recommendation: "Tighten to READ only.",
}

describe("Data Plane: data-access states", () => {
  it("shows a load failure as unknown, never as 'no access'", async () => {
    respond(502, { error: "IDENTITY_DETAIL_UNAVAILABLE" })
    const { container } = mount()
    await waitFor(() => expect(byTestId(container, "data-plane-load-error")).not.toBeNull())
    expect(byTestId(container, "data-plane-no-data-permissions")).toBeNull()
    expect(container.textContent).not.toMatch(/No data store access detected/)
  })

  it("shows permissions that were not computed as such", async () => {
    respond(200, { dataStores: [], dataStoresStatus: { available: false, reason: "PERMISSIONS_NOT_COMPUTED" },
                   tableAccess: [], tableAccessStatus: { available: false } })
    const { container } = mount()
    await waitFor(() => expect(byTestId(container, "data-plane-not-computed")).not.toBeNull())
    expect(byTestId(container, "data-plane-no-data-permissions")).toBeNull()
  })

  it("renders service-level stores, offers no per-bucket action, and names the table-access gap", async () => {
    respond(200, { dataStores: [serviceLevelS3], dataStoresStatus: { available: true },
                   tableAccess: [], tableAccessStatus: { available: false, reason: "TABLE_ACCESS_NOT_SERVED_BY_BACKEND" },
                   summary: { totalDataStores: 1, totalObservedOps: 1, totalAllowedOps: 2 } })
    const { container } = mount()
    await waitFor(() => expect(container.textContent).toContain("S3 resources (from permissions)"))
    // No real bucket, so no Remediate: it would otherwise hand the placeholder name to the S3 modal.
    expect([...container.querySelectorAll("button")].some((b) => b.textContent?.includes("Remediate"))).toBe(false)
    expect(byTestId(container, "data-plane-table-access-unavailable")).not.toBeNull()
  })

  it("keeps per-bucket Remediate for a store that names a real resource", async () => {
    respond(200, { dataStores: [{ ...serviceLevelS3, name: "payments-bucket", granularity: "resource", resourceName: "payments-bucket" }],
                   dataStoresStatus: { available: true }, tableAccess: [], tableAccessStatus: { available: false } })
    const { container } = mount()
    await waitFor(() => expect(container.textContent).toContain("payments-bucket"))
    expect([...container.querySelectorAll("button")].some((b) => b.textContent?.includes("Remediate"))).toBe(true)
  })

  it("says 'no data-service permissions' only for a computed, genuinely empty profile", async () => {
    respond(200, { dataStores: [], dataStoresStatus: { available: true }, tableAccess: [], tableAccessStatus: { available: false } })
    const { container } = mount()
    await waitFor(() => expect(byTestId(container, "data-plane-no-data-permissions")).not.toBeNull())
  })
})
