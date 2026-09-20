/// <reference types="vitest/globals" />
import React from "react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"

import { IdentityAccessControl, IdentityAccessSurface } from "@/components/topology-v0-2/identity-access-panel"
import { resolveIdentityAccess } from "@/components/topology-v0-2/identity-access-contract"
import type { IdentityAccessProjection, TopologyNode } from "@/components/topology-v0-2/types"
import fixture from "./fixtures/topology-risk/estate-map-v11-contract.json"

beforeAll(() => {
  if (!("ResizeObserver" in globalThis)) {
    ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
})
afterEach(() => cleanup())

const ready = fixture.identity_access as IdentityAccessProjection
const nodes: TopologyNode[] = fixture.nodes as unknown as TopologyNode[]

function clone(): IdentityAccessProjection {
  return structuredClone(ready)
}

function renderControl(
  identityAccess: unknown = clone(),
  options: { stale?: boolean; onSelect?: (id: string) => void; version?: unknown } = {},
) {
  return render(
    <IdentityAccessControl
      responseContractVersion={options.version ?? "topology-risk/v11"}
      identityAccess={identityAccess}
      snapshotStale={options.stale ?? false}
      nodes={nodes}
      onSelect={options.onSelect ?? (() => {})}
      compact={false}
    />,
  )
}

function renderSurface(
  identityAccess: unknown = clone(),
  options: { stale?: boolean; onSelect?: (id: string) => void; version?: unknown } = {},
) {
  return render(
    <IdentityAccessSurface
      responseContractVersion={options.version ?? "topology-risk/v11"}
      identityAccess={identityAccess}
      snapshotStale={options.stale ?? false}
      nodes={nodes}
      onSelect={options.onSelect ?? (() => {})}
      expectedScope={ready.scope}
    />,
  )
}

function openPanel() {
  const trigger = screen.getByTestId("topology-identity-access-trigger")
  expect(trigger).toHaveAttribute("aria-expanded", "false")
  expect(screen.queryByTestId("topology-identity-access-panel")).toBeNull()
  fireEvent.click(trigger)
  expect(trigger).toHaveAttribute("aria-expanded", "true")
  return { trigger, panel: screen.getByTestId("topology-identity-access-panel") }
}

describe("estate-identity-access/v1 boundary", () => {
  it("accepts the exact committed backend fixture", () => {
    const result = resolveIdentityAccess("topology-risk/v11", clone())
    expect(result.state).toBe("ready")
    expect(result.projection?.roles_total).toBe(1)
    expect(result.projection?.roles[0].role_id).toBe("AROAEXAMPLECYNTRO01")
  })

  it.each([
    ["missing nested block", undefined],
    ["null nested block", null],
    ["wrong contract", { ...clone(), contract_version: "estate-identity-access/v0" }],
    ["malformed returned count", { ...clone(), roles_returned: 9 }],
    ["duplicate RoleId", (() => { const value = clone(); value.roles = [value.roles[0], structuredClone(value.roles[0])]; value.roles_total = 2; value.roles_returned = 2; return value })()],
    ["non-null effective decision", (() => { const value = clone() as unknown as { roles: Array<{ effective_authorization: { decision: unknown } }> }; value.roles[0].effective_authorization.decision = "ALLOWED"; return value })()],
    ["missing authorization layer", (() => { const value = clone() as unknown as { roles: Array<{ action_details: Array<{ authorization_layers: Record<string, string> }> }> }; delete value.roles[0].action_details[0].authorization_layers.SCP_RCP; return value })()],
  ])("treats %s as unavailable rather than empty", (_name, value) => {
    const result = resolveIdentityAccess("topology-risk/v11", value)
    expect(result.state).toBe("unavailable")
    expect(result.projection).toBeNull()
  })

  it("does not accept the nested block under an older outer response", () => {
    expect(resolveIdentityAccess("topology-risk/v10", clone()).state).toBe("unavailable")
  })

  it("rejects a block pinned to a different Estate scope", () => {
    expect(resolveIdentityAccess("topology-risk/v11", clone(), {
      account_id: "000000000000",
      region: ready.scope.region,
      system_name: ready.scope.system_name,
      vpc_id: ready.scope.vpc_id,
    }).state).toBe("unavailable")
  })

  it("rejects inconsistent exact summary counts", () => {
    const value = clone()
    value.roles[0].observed_use.successful_action_count = 2
    expect(resolveIdentityAccess("topology-risk/v11", value).state).toBe("unavailable")
  })
})

describe("Identity & access on-demand panel", () => {
  it("renders configured grants, historical observations, and effective Unknown as separate facts", () => {
    renderControl()
    const { panel } = openPanel()
    expect(within(panel).getByTestId("topology-identity-role-totals")).toHaveTextContent("1 exact role · 1 returned")
    expect(within(panel).getByTestId("topology-identity-configured-grants")).toHaveTextContent("1")
    expect(within(panel).getByTestId("topology-identity-observed-use")).toHaveTextContent("1 successful · 0 denied-only")
    expect(within(panel).getByTestId("topology-identity-coverage-counts")).toHaveTextContent("1 complete · 0 partial · 0 unknown")
    expect(within(panel).getAllByTestId("topology-identity-effective-authorization")[0]).toHaveTextContent("Effective authorization · Unknown")
    expect(within(panel).getByTestId("topology-identity-authorization-layers")).toHaveTextContent("PERMISSIONS_BOUNDARY")
    expect(within(panel).getByTestId("topology-identity-authorization-layers")).toHaveTextContent("UNKNOWN")
    expect(within(panel).getByTestId("topology-identity-role-link")).toHaveAttribute(
      "href",
      `/iam/shared-roles?system_name=${encodeURIComponent(ready.scope.system_name)}&role_ref=${encodeURIComponent(ready.roles[0].role_arn)}`,
    )
    expect(within(panel).getAllByTestId("topology-identity-effective-gap").map(item => item.textContent)).toEqual(expect.arrayContaining([
      "ACTION_AND_RESOURCE_SCOPE_REQUIRED",
      "NO_PROJECTED_EFFECTIVE_DECISION",
      "AUTHORIZATION_LAYERS_INCOMPLETE",
    ]))
    expect(within(panel).queryByText(/^Allowed$/i)).toBeNull()
    expect(within(panel).queryByText(/^Denied$/i)).toBeNull()
    expect(panel.textContent).not.toContain("unused")
    expect(panel.textContent).not.toContain("%")
  })

  it("preserves exact many-role workload links and selects the exact workload id", () => {
    const value = clone()
    const second = structuredClone(value.roles[0])
    second.role_id = "AROAEXAMPLECYNTRO02"
    second.role_arn = second.role_arn.replace("-web", "-worker")
    second.name = "cyntro-testbed-webshop-worker"
    second.workload_ids = [value.roles[0].workload_ids[0], "fn-worker"]
    value.roles.push(second)
    value.roles_total = 2
    value.roles_returned = 2
    const onSelect = vi.fn()
    renderControl(value, { onSelect })
    const { panel } = openPanel()
    expect(within(panel).getAllByTestId("topology-identity-role")).toHaveLength(2)
    const sharedWorkloadLinks = within(panel).getAllByTestId("topology-identity-workload-link")
      .filter(link => link.getAttribute("data-workload-id") === value.roles[0].workload_ids[0])
    expect(sharedWorkloadLinks).toHaveLength(2)
    fireEvent.click(sharedWorkloadLinks[1])
    expect(onSelect).toHaveBeenCalledWith(value.roles[0].workload_ids[0])
    expect(screen.queryByTestId("topology-identity-access-panel")).toBeNull()
  })

  it("renders exact empty only for a ready zero-role projection", () => {
    const value = clone()
    value.roles = []
    value.roles_total = 0
    value.roles_returned = 0
    renderControl(value)
    const { panel } = openPanel()
    expect(within(panel).getByTestId("topology-identity-access-empty")).toHaveTextContent(
      "No IAM roles are attached to resources in this Estate scope.",
    )
    expect(within(panel).queryByTestId("topology-identity-access-unavailable")).toBeNull()
  })

  it("preserves the named gap from a valid unavailable projection", () => {
    const value = clone()
    value.status = "unavailable"
    value.inventory_authority = null
    value.decision_authority = null
    value.roles_total = null
    value.roles_returned = 0
    value.roles_truncated = false
    value.roles_omitted_unresolved = null
    value.roles = []
    value.gaps = [{ code: "ACTIVE_INVENTORY_POINTER_INVALID", detail: "Active inventory pointer failed integrity validation." }]
    renderControl(value)
    const { panel } = openPanel()
    expect(within(panel).getByTestId("topology-identity-access-gap")).toHaveAttribute(
      "data-gap-code",
      "ACTIVE_INVENTORY_POINTER_INVALID",
    )
    expect(within(panel).queryByTestId("topology-identity-access-empty")).toBeNull()
  })

  it.each([
    ["missing", null],
    ["wrong version", { ...clone(), contract_version: "estate-identity-access/v2" }],
    ["malformed", { ...clone(), roles_returned: 44 }],
  ])("renders %s contract input as unavailable with no zero claim", (_name, value) => {
    renderControl(value)
    const { panel } = openPanel()
    expect(within(panel).getByTestId("topology-identity-access-unavailable")).toHaveTextContent("Identity & access unavailable")
    expect(within(panel).queryByTestId("topology-identity-access-empty")).toBeNull()
    expect(panel).toHaveTextContent("No zero-role, unused, allow, or deny conclusion is available")
  })

  it("renders partial, unresolved, role/action truncation, named gaps and unavailable counts verbatim", () => {
    const value = clone()
    value.status = "partial"
    value.roles_total = 8
    value.roles_returned = 1
    value.roles_truncated = true
    value.roles_omitted_unresolved = 2
    value.gaps = [{ code: "ROLE_ID_UNRESOLVED", detail: "Two visible attachments have no stable RoleId." }]
    value.roles[0].configured_grants = { state: "unavailable", exact_action_count: null }
    value.roles[0].observed_use = {
      state: "unavailable",
      successful_action_count: null,
      denied_only_action_count: null,
      not_observed_action_count: null,
      unknown_action_count: null,
      coverage_counts: null,
      last_success_at: null,
    }
    value.roles[0].action_details_total = null
    value.roles[0].action_details_returned = 0
    value.roles[0].action_details_truncated = false
    value.roles[0].action_details = []
    value.roles[0].gaps = [{ code: "DECISION_EVIDENCE_UNAVAILABLE", detail: "Canonical decision evidence is unavailable." }]
    renderControl(value)
    const { panel } = openPanel()
    expect(within(panel).getByTestId("topology-identity-access-partial")).toBeTruthy()
    expect(within(panel).getByTestId("topology-identity-roles-unresolved")).toHaveTextContent("2 attached roles are omitted")
    expect(within(panel).getByTestId("topology-identity-roles-truncated")).toHaveTextContent("Showing 1 of 8 exact roles")
    expect(within(panel).getAllByTestId("topology-identity-access-gap")[0]).toHaveAttribute("data-gap-code", "ROLE_ID_UNRESOLVED")
    expect(within(panel).getByTestId("topology-identity-configured-grants")).toHaveTextContent("Canonical configured grants unavailable")
    expect(within(panel).getByTestId("topology-identity-observed-use")).toHaveTextContent("Canonical observations unavailable")
  })

  it("shows bounded action detail using the exact backend total", () => {
    const value = clone()
    value.roles[0].action_details_total = 27
    value.roles[0].action_details_truncated = true
    value.roles[0].observed_use.unknown_action_count = 26
    value.roles[0].observed_use.coverage_counts!.unknown = 26
    renderControl(value)
    const { panel } = openPanel()
    fireEvent.click(within(panel).getByText("Action evidence · 27 exact"))
    expect(within(panel).getByTestId("topology-identity-actions-truncated")).toHaveTextContent(
      "Showing 1 of 27 exact action records",
    )
  })

  it.each([
    ["DENIED_ONLY", "COMPLETE", true, "Denied attempts observed"],
    ["NOT_OBSERVED", "COMPLETE", true, "No successful use observed in the stated window"],
    ["NOT_OBSERVED", "PARTIAL", false, "No successful use returned; evidence is not complete"],
    ["UNKNOWN", "UNKNOWN", false, "Historical use unknown"],
  ] as const)("keeps %s historical evidence honest", (usageState, coverageState, windowSatisfied, expectedCopy) => {
    const value = clone()
    const action = value.roles[0].action_details[0]
    action.usage_state = usageState
    action.coverage_state = coverageState
    action.window_requirement_satisfied = windowSatisfied
    action.last_success_at = null
    value.roles[0].observed_use.successful_action_count = 0
    value.roles[0].observed_use.denied_only_action_count = usageState === "DENIED_ONLY" ? 1 : 0
    value.roles[0].observed_use.not_observed_action_count = usageState === "NOT_OBSERVED" ? 1 : 0
    value.roles[0].observed_use.unknown_action_count = usageState === "UNKNOWN" ? 1 : 0
    value.roles[0].observed_use.coverage_counts = {
      complete: coverageState === "COMPLETE" ? 1 : 0,
      partial: coverageState === "PARTIAL" ? 1 : 0,
      unknown: coverageState === "UNKNOWN" ? 1 : 0,
    }
    value.roles[0].observed_use.last_success_at = null
    renderControl(value)
    const { panel } = openPanel()
    fireEvent.click(within(panel).getByText("Action evidence · 1 exact"))
    expect(within(panel).getByTestId("topology-identity-action-usage")).toHaveTextContent(expectedCopy)
    expect(panel.textContent?.toLowerCase()).not.toContain("unused")
  })

  it("labels stale authority without rewriting the projected generations", () => {
    renderControl(clone(), { stale: true })
    const { trigger, panel } = openPanel()
    expect(trigger).toHaveAttribute("data-snapshot-stale", "true")
    expect(within(panel).getByTestId("topology-identity-access-stale")).toHaveTextContent("Stale snapshot")
    expect(within(panel).getByTestId("topology-identity-authority")).toHaveTextContent("generation 31")
    expect(within(panel).getByTestId("topology-identity-authority")).toHaveTextContent("generation 12")
  })

  it("uses Radix Escape dismissal and restores focus to the trigger", async () => {
    renderControl()
    const { trigger, panel } = openPanel()
    panel.focus()
    fireEvent.keyDown(panel, { key: "Escape" })
    expect(screen.queryByTestId("topology-identity-access-panel")).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })
})

describe("Identity & access sibling surface", () => {
  it("renders every exact RoleId-to-workload relationship without changing authority semantics", () => {
    const onSelect = vi.fn()
    const value = clone()
    value.roles[0].workload_ids = [nodes[0].id, nodes[1].id]
    const secondRole = structuredClone(value.roles[0])
    secondRole.role_id = "AROAEXAMPLECYNTRO02"
    secondRole.role_arn = "arn:aws:iam::416651950952:role/cyntro-testbed-webshop-worker"
    secondRole.name = "cyntro-testbed-webshop-worker"
    secondRole.workload_ids = [nodes[0].id]
    value.roles.push(secondRole)
    value.roles_total = 2
    value.roles_returned = 2
    renderSurface(value, { onSelect })

    const surface = screen.getByTestId("topology-identity-access-surface")
    expect(surface).toHaveAttribute("data-identity-status", "ready")
    const relationshipMap = within(surface).getByTestId("topology-identity-relationship-map")
    expect(relationshipMap).toHaveAttribute("data-relationship-count", "3")
    expect(within(relationshipMap).getAllByTestId("topology-identity-relationship-row")[0]).toHaveAttribute(
      "data-role-id",
      value.roles[0].role_id,
    )
    expect(within(relationshipMap).getAllByTestId("topology-identity-relationship-row")[1]).toHaveAttribute(
      "data-role-id",
      secondRole.role_id,
    )
    const workloadLinks = within(relationshipMap).getAllByTestId("topology-identity-relationship-workload")
    expect(workloadLinks).toHaveLength(3)
    fireEvent.click(workloadLinks[1])
    expect(onSelect).toHaveBeenCalledWith(nodes[1].id)
    expect(within(surface).getAllByTestId("topology-identity-effective-authorization")[0]).toHaveTextContent(
      "Effective authorization · Unknown",
    )
  })

  it("keeps missing authority unavailable and does not render a relationship map", () => {
    renderSurface(null)
    const surface = screen.getByTestId("topology-identity-access-surface")
    expect(within(surface).getByTestId("topology-identity-access-unavailable")).toHaveTextContent(
      "was not projected",
    )
    expect(within(surface).queryByTestId("topology-identity-relationship-map")).toBeNull()
    expect(within(surface).queryByTestId("topology-identity-access-empty")).toBeNull()
  })
})
