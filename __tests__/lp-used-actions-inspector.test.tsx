/**
 * The live IAM-role and EC2 sidebars (ResourceConfigTab -> InsightSections) render least privilege's used-action
 * answer (``lp-used-actions/v1``) with the right attribution and labels.
 *
 * Every body is the backend's own answer (fixture ``_source``: the real resource_config and LP coverage producers,
 * the real inspector route under enforce, flag on; labelled fixture tenant). Mounted as the sidebars mount it.
 *
 * - A role's block is the role's own use; an instance's block is its instance-profile role's -- said on every card,
 *   never shown as the instance's own, and an instance never gets an unused set.
 * - The window is the decision generation's (no lookback window, no call counts): never the old "30d" default.
 * - Unknown is not unused; "not observed" is never a removal claim; unavailable shows its reason, never zero.
 * - A legacy observed section (no LP block) keeps today's rendering.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import chain from "./fixtures/lp-used-actions-inspector-chain.json"
import { ResourceConfigTab } from "@/components/inventory/resource-config-tab"

const ROLE_ARN = "arn:aws:iam::111111111111:role/acme-web-role"

function reply(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
}

async function mounted(body: unknown, resourceId: string, resourceType: string) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.startsWith("/api/proxy/inspector/")) return reply(200, body)
    return reply(404, { detail: "FIXTURE_UNROUTED" })
  })
  vi.stubGlobal("fetch", fetchMock)
  const view = render(<ResourceConfigTab resourceId={resourceId} resourceType={resourceType} />)
  await waitFor(() => expect(screen.queryByText("Loading configuration…")).toBeNull())
  return { text: view.container.textContent ?? "", fetchMock }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("the IAM role sidebar", () => {
  it("shows the role's own use, from its decision generation, with no removal claim", async () => {
    const { text, fetchMock } = await mounted(chain.role_served, ROLE_ARN, "IAMRole")
    expect(String(fetchMock.mock.calls[0][0])).toContain(`/api/proxy/inspector/${encodeURIComponent(ROLE_ARN)}`)
    expect(text).toContain("This role: 1 action(s) observed in use")
    expect(text).toContain("decision generation 4, projected through 2026-09-20; no lookback window or call counts")
    expect(text).toContain("1 action(s) attempted but denied")
    expect(text).toContain("1 configured action(s) not observed in this decision generation")
    expect(text).toContain("Not a removal verdict: removal is decided in the least-privilege review.")
    expect(text).toContain("3 configured action(s)")
    expect(text).not.toMatch(/in 30d|safe to remove|never used in the window/i)
    // The LP-served count is on the LP cards, not under the current section's graph source line.
    expect(text).not.toMatch(/allowed actions count/i)
  })

  it("never renders unknown usage as unused or as no use", async () => {
    const { text } = await mounted(chain.role_unknown, ROLE_ARN, "IAMRole")
    expect(text).toContain("This role: no action observed in use")
    expect(text).toContain("Usage unknown for 2 action(s)")
    expect(text).toContain("Unknown is not unused.")
    expect(text).toContain("Unused actions not established")
    expect(text).not.toMatch(/not observed in this decision generation|No observed usage in window/)
  })

  it("never shows an unused set when the configured set is open, however many actions were not observed", async () => {
    const { text } = await mounted(chain.role_open_set, ROLE_ARN, "IAMRole")
    expect(chain.role_open_set.observed.role_actions.totals.not_observed).toBe(1)
    expect(text).toContain("This role: 1 action(s) observed in use")
    expect(text).toContain("Configured actions not fully enumerated")
    expect(text).toContain("Unused actions not established")
    expect(text).not.toMatch(/not observed in this decision generation|configured action\(s\)\s*Every grant/)
  })

  it("shows an unavailable answer by its reason, never as zero", async () => {
    const { text } = await mounted(chain.role_unavailable, ROLE_ARN, "IAMRole")
    expect(text).toContain("Observed usage not available")
    expect(text).toContain("Not answered (NOT_PUBLISHED); nothing is shown as zero use.")
    expect(text).not.toMatch(/0 action\(s\)|No activity evidence yet/)
  })
})

describe("the EC2 sidebar", () => {
  it("shows its instance-profile role's use under the role's name, never as the instance's own", async () => {
    const { text } = await mounted(chain.ec2_served, "i-0abc123def456", "EC2")
    expect(text).toContain("Instance-profile role acme-web-role: 1 action(s) observed in use")
    expect(text).toContain("Shared by every principal using the role; not attributed to this instance.")
    expect(text).toContain("Role-level, not this instance")
    // In the Observed Activity section itself (not only the key insights above it): the role's cards.
    expect(screen.getAllByText("Instance-profile role acme-web-role: 1 action(s) observed in use")).toHaveLength(2)
    // The instance's own keys stay unanswered, and an instance never gets an unused set or removal wording.
    expect(chain.ec2_served.observed.used_actions).toBeNull()
    expect(text).not.toMatch(/No activity evidence yet|not observed in this decision generation|removal/i)
  })

  it("shows the role's unavailable answer as the role's, never as the instance having no activity", async () => {
    const { text } = await mounted(chain.ec2_unavailable, "i-0abc123def456", "EC2")
    expect(text).toContain("Instance-profile role usage not available")
    expect(text).not.toContain("No activity evidence yet")
  })
})

describe("a legacy observed section", () => {
  it("keeps today's rendering when no LP block is present", async () => {
    const legacy = {
      ...chain.role_served,
      observed: { title: "Observed Usage", source: "CloudTrail (graph)", window: "90d", available: true,
                  used_actions: ["s3:GetObject"], used_actions_count: 1 },
    }
    const { text } = await mounted(legacy, ROLE_ARN, "IAMRole")
    expect(text).toContain("1 observed action(s) in 90d")
    expect(text).not.toContain("decision generation")
  })
})
