/**
 * The Least Privilege tab shows a held Apply and offers an explicit, operator-driven Resolve.
 *
 * Everything shown comes from the backend (#2141): the holder, its state and a
 * live per-policy reconciliation. Nothing resolves on its own; Resolve sends
 * the operation id the backend reported and the selected role's ARN and
 * incarnation, and the backend re-checks the holder. Resolution stays held.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const read = vi.fn()
const resolve = vi.fn()
vi.mock("@/lib/lp-held-mutation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/lp-held-mutation")>()
  return {
    ...actual,
    // The resolution FLOW with the release switch on (it is false in source); the held control is
    // lp-held-controls-send-nothing.test.tsx, with the real submitter and a network spy.
    LP_RESOLVE_ENABLED: true,
    fetchLpOutstanding: (...args: unknown[]) => read(...args),
    submitLpResolve: (...args: unknown[]) => resolve(...args),
  }
})

import { LpOutstandingPanel } from "@/components/iam-lp/LpOutstandingPanel"

const ROLE_ARN = "arn:aws:iam::111111111111:role/cyntro-tb-prod-web-role"
const PLAN = { roleArn: ROLE_ARN, roleId: "AROAWEBROLE", planHead: "head-1" }
const PARTIAL = {
  operationId: "op-apply-1", state: "PARTIALLY_APPLIED", attempt: 1, resolvable: true,
  verdict: "partial", perPolicy: { CreatePolicy: "intended", ReadPolicy: "preimage" },
}

afterEach(() => {
  read.mockReset()
  resolve.mockReset()
})

async function shown(outstanding: unknown, onResolved = () => {}) {
  read.mockResolvedValue(outstanding)
  const view = render(<LpOutstandingPanel plan={PLAN} onResolved={onResolved} />)
  await act(async () => {})
  return view
}

describe("the held-operation panel", () => {
  it("shows nothing when the backend reports nothing outstanding", async () => {
    const { container } = await shown(null)
    expect(container.innerHTML).toBe("")
    expect(read).toHaveBeenCalledWith(PLAN)
  })

  it("shows the held state and the live per-policy reconciliation, and never resolves by itself", async () => {
    await shown(PARTIAL)

    expect(screen.getByText(/This role is held: operation op-apply-1/)).toBeTruthy()
    expect(screen.getByText(/wrote some of its changes and then failed/)).toBeTruthy()
    expect(screen.getByText(/some intended changes, the rest at their preimage/)).toBeTruthy()
    expect(screen.getByText("CreatePolicy: intended")).toBeTruthy()
    expect(screen.getByText("ReadPolicy: preimage")).toBeTruthy()
    expect(resolve).not.toHaveBeenCalled()
  })

  it("explains that an Apply with no recorded outcome is fenced first", async () => {
    await shown({ ...PARTIAL, state: "PLANNED", verdict: "applied" })
    expect(screen.getByText(/recorded no outcome.*only fences it/)).toBeTruthy()
  })

  it.each([
    ["a verified Apply (Restore handles it)", { ...PARTIAL, state: "VERIFIED", resolvable: false }],
  ])("shows nothing for %s", async (_label, outstanding) => {
    const { container } = await shown(outstanding)
    expect(container.innerHTML).toBe("")
  })

  it("offers no Resolve for an operation the backend says is not resolvable", async () => {
    await shown({ ...PARTIAL, state: "RESOLVED_PARTIAL", resolvable: false })
    expect(screen.getByText(/Resolved as partially applied/)).toBeTruthy()
    expect(screen.queryByText("Resolve from live state")).toBeNull()
  })

  it("resolves only on an explicit click, with the backend's operation and the selected role", async () => {
    resolve.mockResolvedValue({ ok: false, status: 503, code: "RESOLVE_HELD", cloud_writes: 0 })
    await shown(PARTIAL)

    await act(async () => {
      fireEvent.click(screen.getByText("Resolve from live state"))
    })

    expect(resolve).toHaveBeenCalledTimes(1)
    expect(resolve).toHaveBeenCalledWith({ operationId: "op-apply-1", roleArn: ROLE_ARN, roleId: "AROAWEBROLE" })
    expect(screen.getByRole("status").textContent).toContain("Resolution stays off")
  })

  it("after a proven resolution, reloads the status and the receipt", async () => {
    const onResolved = vi.fn()
    resolve.mockResolvedValue({ ok: true, status: 200, body: { code: "RESOLVED", state: "RESOLVED_PARTIAL" } })
    await shown(PARTIAL, onResolved)

    await act(async () => {
      fireEvent.click(screen.getByText("Resolve from live state"))
    })

    expect(onResolved).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2))
    expect(screen.getByRole("status").textContent).toContain("Resolved: RESOLVED_PARTIAL")
  })

  it("says the role stays held when the backend does not resolve it", async () => {
    const onResolved = vi.fn()
    resolve.mockResolvedValue({ ok: false, status: 409, body: { detail: { code: "RESOLUTION_DIVERGED" } } })
    await shown(PARTIAL, onResolved)

    await act(async () => {
      fireEvent.click(screen.getByText("Resolve from live state"))
    })

    expect(onResolved).not.toHaveBeenCalled()
    expect(screen.getByRole("status").textContent).toContain("RESOLUTION_DIVERGED")
    expect(screen.getByRole("status").textContent).toContain("stays held")
  })

  it("reads again for the newly selected role", async () => {
    read.mockResolvedValue(null)
    const { rerender } = render(<LpOutstandingPanel plan={PLAN} onResolved={() => {}} />)
    await act(async () => {})
    const other = { ...PLAN, roleArn: "arn:aws:iam::111111111111:role/other", roleId: "AROAOTHER" }
    rerender(<LpOutstandingPanel plan={other} onResolved={() => {}} />)
    await act(async () => {})

    expect(read).toHaveBeenLastCalledWith(other)
  })
})

describe("the tab wiring", () => {
  const tab = readFileSync(join(process.cwd(), "components/LeastPrivilegeTab.tsx"), "utf8")
  const lib = readFileSync(join(process.cwd(), "lib/lp-held-mutation.ts"), "utf8")

  it("renders the panel for the selected IAM role and reloads the receipt after a resolution", () => {
    expect(tab).toContain("<LpOutstandingPanel")
    expect(tab).toContain("onResolved={() => setLpReceiptReload((value) => value + 1)}")
  })

  it("keeps resolution held and out of browser storage", () => {
    expect(lib).toContain("export const LP_RESOLVE_ENABLED = false")
    expect(lib).not.toMatch(/sessionStorage|localStorage|indexedDB/)
  })
})
