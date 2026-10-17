/**
 * D42: System view > Inventory > All Services showed a "Tag Coverage" card reading "100%" and "1 tagged • 0 untagged"
 * for a system whose one member (an internet gateway) carries NO System/SystemName tag in AWS -- it is a member because
 * a person declared it as a root in the System Boundary wizard. The card counted rows whose systemName was not
 * "Untagged": that is Cyntro system MEMBERSHIP, and every served row carries a systemName, so it always read 100%.
 *
 * The served row below has the key set of the backend producer (api/system_resources.py, the `resources.append({...})`
 * row builder) with the values the live D42 evidence gives: the gateway's id, type InternetGateway, tagged_by null,
 * is_seed false, and no tags field. Values the evidence does not give are null; the id stands in for the producer's
 * clean_name, whose live value (the gateway's Name tag) is not part of the evidence.
 */
import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/components/RefreshEvidenceButton", () => ({ RefreshEvidenceButton: () => null }))

import { AllServicesTab } from "@/components/all-services-tab"

const SYSTEM = "d42-system-under-test"

const SERVED_MEMBER_ROW = {
  id: "igw-097022c2bdf8e254c",
  name: "igw-097022c2bdf8e254c",
  type: "InternetGateway",
  service: null,
  systemName: SYSTEM,
  is_seed: false,
  tagged_by: null,
  environment: null,
  region: null,
  account_id: null,
  customer_id: null,
  aws_partition: null,
  status: null,
  state: null,
  key_state: null,
  instance_state: null,
  connections: null,
  relationship_types: null,
  arn: null,
  resource_id: "igw-097022c2bdf8e254c",
  instance_id: null,
  lastSeen: null,
  lastUsedBy: null,
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

function stubFetch(systemResources: () => Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith("/api/proxy/system-resources/")) return systemResources()
      // Nothing else is part of this screen's membership answer; an unanswered read stays unanswered.
      return json(404, {})
    }),
  )
}

function membershipCard(): HTMLElement {
  const card = screen.getByText("System membership").closest('[data-slot="card"]')
  if (!(card instanceof HTMLElement)) throw new Error("the System membership card is not rendered")
  return card
}

describe("D42: All Services shows system membership, not AWS tag coverage", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("counts one served member as membership and makes no tag claim", async () => {
    stubFetch(() => json(200, { resources: [SERVED_MEMBER_ROW] }))
    render(<AllServicesTab systemName={SYSTEM} />)

    await screen.findByText("System membership")
    const card = membershipCard()

    // No tag claim anywhere on the screen: membership is not an AWS tag. (textContent joins adjacent elements with no
    // separator -- "1 tagged" + "Refresh" reads "1 taggedRefresh" -- so no word-boundary anchors here.)
    const page = document.body.textContent ?? ""
    expect(page).not.toMatch(/tag coverage/i)
    expect(page).not.toMatch(/tagged/i) // also covers "untagged"
    expect(page).not.toContain("100%")
    expect(card.textContent).not.toMatch(/tag/i)
    expect(card.textContent).not.toContain("%")

    // The membership wording, with the served count and nothing else.
    expect(card.textContent).toContain("in this system")
    expect(card.textContent?.replace("System membership", "").replace("in this system", "").trim()).toBe("1")
  })

  it("labels the per-row column as the system, not the AWS SystemName tag", async () => {
    stubFetch(() => json(200, { resources: [SERVED_MEMBER_ROW] }))
    render(<AllServicesTab systemName={SYSTEM} />)

    fireEvent.click(await screen.findByRole("button", { name: "Expand all" }))

    expect(screen.getByRole("columnheader", { name: "System" })).toBeInTheDocument()
    expect(screen.queryByRole("columnheader", { name: "SystemName" })).toBeNull()
    const rows = screen.getAllByRole("row")
    expect(rows).toHaveLength(2) // the header row and the one member
    expect(rows[1].textContent).toContain(SYSTEM)
    expect(rows[1].textContent).not.toMatch(/tagged/i)
  })

  it("shows no member count when the system's resources could not be read", async () => {
    stubFetch(() => json(404, { error: "Backend error (404): not found", resources: [] }))
    render(<AllServicesTab systemName={SYSTEM} />)

    await screen.findByText("System membership")
    const card = membershipCard()
    expect(card.textContent?.replace("System membership", "").replace("in this system", "").trim()).toBe("—")
  })
})
