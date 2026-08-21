import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SharedResourcesListView } from "@/components/shared-resources/shared-resources-list-view"

vi.mock("@/lib/scoped-system-catalog", () => ({
  catalogSystemName: (requested: string | null, available: string[]) =>
    available.find((name) => name.toLowerCase() === String(requested || "").toLowerCase()) || null,
  useScopedSystemCatalog: () => ({
    url: "/api/proxy/systems",
    scopeKey: "testbed-webshop|all|all|all",
    ready: true,
    available: true,
  }),
}))

const push = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}))

const isolation = (kind: "iam_role" | "security_group", automationAllowed = true) => ({
  resource_kind: kind,
  strategy:
    kind === "iam_role"
      ? "dedicated_role_per_workload_group"
      : "dedicated_sg_per_workload_group",
  customer_value: "Reduce the shared blast radius with dedicated controls.",
  protection: {
    level: automationAllowed ? "customer_managed" : "aws_service_linked",
    automation_allowed: automationAllowed,
    reason: automationAllowed ? null : "AWS owns this service-linked role.",
  },
  evidence: {
    configured_count: 10,
    observed_count: 4,
    unconfirmed_count: 6,
    investigation_count: 0,
    coverage_state: "collecting",
    absence_claim_allowed: false,
  },
  capabilities: {
    preview: automationAllowed,
    create_scoped_controls: automationAllowed,
    staged_migration: automationAllowed,
    staged_scope: "supported_workload_groups",
    snapshot: true,
    history_checkpoints: true,
    verification: true,
    restore: true,
    permission_narrowing: automationAllowed,
  },
  readiness: {
    plan: automationAllowed,
    create: false,
    migrate: false,
    blocked_reasons: [],
  },
})

const iamResponse = {
  shared_roles: [
    {
      role_arn: "arn:aws:iam::123456789012:role/customer-role",
      role_name: "customer-role",
      resource_type: "IAMRole",
      consumer_count: 3,
      consumer_kinds: { LambdaFunction: 2, EC2Instance: 1 },
      system_tags: ["alon-prod"],
      cross_system: false,
      allowed_count: 10,
      keep_count: 4,
      narrow_count: 6,
      investigation_count: 0,
      narrowable_pct: 60,
      headline_state: "narrowing_available",
      is_platform_owned: false,
      sort_score: 65,
      has_active_plan: false,
      active_plan_id: null,
      isolation: isolation("iam_role"),
    },
    {
      role_arn:
        "arn:aws:iam::123456789012:role/aws-service-role/securityhub.amazonaws.com/AWSServiceRoleForSecurityHub",
      role_name: "AWSServiceRoleForSecurityHub",
      resource_type: "IAMRole",
      consumer_count: 2,
      consumer_kinds: { AWSService: 2 },
      system_tags: ["alon-prod"],
      cross_system: false,
      allowed_count: 5,
      keep_count: 2,
      narrow_count: 3,
      investigation_count: 0,
      narrowable_pct: 60,
      headline_state: "narrowing_available",
      is_platform_owned: true,
      sort_score: 10,
      has_active_plan: false,
      active_plan_id: null,
      isolation: isolation("iam_role", false),
    },
  ],
}

const sgResponse = {
  shared_sgs: [
    {
      sg_id: "sg-123",
      sg_name: "orders-shared-sg",
      vpc_id: "vpc-1",
      owner_id: "123456789012",
      consumer_count: 2,
      consumer_preview: [
        { name: "orders-api", id: "fn-orders-api", kind: "LambdaFunction", system_name: "alon-prod" },
        { name: "orders-worker", id: "fn-orders-worker", kind: "LambdaFunction", system_name: "alon-prod" },
      ],
      consumer_breakdown: { lambda: 2 },
      rule_summary: {
        inbound: 3,
        outbound: 1,
        unused: 2,
        high_risk: 0,
        has_public_ingress: false,
      },
      topology: { systems: ["alon-prod"], vpcs: ["vpc-1"] },
      freshness: { ingress_hash: "i", egress_hash: "e", last_synced: "2026-08-14" },
      verdict: {
        discovery_candidate: true,
        proposal_allowed: true,
        create_only_allowed: true,
        staged_allowed: true,
        blocked_reasons: [],
      },
      has_active_plan: false,
      active_plan_id: null,
      isolation: isolation("security_group"),
      narrowing: {
        allowed_count: 4,
        keep_count: 2,
        narrow_count: 2,
        investigation_count: 0,
        narrowable_pct: 50,
        headline_state: "narrowing_available",
        is_platform_owned: false,
        sort_score: 35,
        traffic_ports_observed: 2,
      },
    },
  ],
}

const narrowingDiff = {
  resource_type: "iam-role",
  allowed_count: 10,
  keep_count: 4,
  narrow_count: 6,
  investigation_count: 0,
  narrowable_pct: 60,
  keep: [{ action: "s3:GetObject", call_count: 4 }],
  narrow_away: [{ action: "s3:DeleteBucket", reason: "no_evidence_no_dependency" }],
  investigate: [],
  evidence_quality: { aggregate_c_source: 70, weakest_source: "cloudtrail", writer: "behavioral" },
  substrate_metadata: {},
}

const sgNarrowingDiff = {
  resource_type: "security-group",
  resource_id: "sg-123",
  allowed_count: 2,
  keep_count: 2,
  narrow_count: 0,
  investigation_count: 0,
  narrowable_pct: 0,
  keep: [
    {
      direction: "inbound",
      protocol: "tcp",
      from_port: 443,
      to_port: 443,
      cidr: "10.0.0.0/8",
      matched_traffic_count: 0,
      last_observed_at: null,
      match_reason: "behavioral_authority_unavailable",
    },
    {
      direction: "outbound",
      protocol: "all",
      from_port: -1,
      to_port: -1,
      cidr: "0.0.0.0/0",
      matched_traffic_count: 0,
      last_observed_at: null,
      match_reason: "outbound_analysis_pending",
    },
  ],
  narrow_away: [],
  investigate: [],
  evidence_quality: { aggregate_c_source: 30, weakest_source: "unknown", writer: "behavioral" },
  substrate_metadata: {},
}

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  }))
}

beforeEach(() => {
  push.mockReset()
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.includes("/api/proxy/iam/shared-roles?") && !init?.method) return json(iamResponse)
    if (url.includes("/api/proxy/sg/shared-sgs?") && !init?.method) return json(sgResponse)
    if (url.includes("/sg/shared-sgs/") && url.includes("/narrowing-diff")) {
      return json(sgNarrowingDiff)
    }
    if (url.includes("/narrowing-diff")) return json(narrowingDiff)
    if (url.includes("/split-plan") && init?.method === "POST") {
      return json({ plan_id: "iam-plan-123", state: "PROPOSED" })
    }
    return json({ error: `unexpected ${url}` }, 404)
  }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("Shared Access Isolation", () => {
  it("renders IAM and SG controls scoped to the selected system without unsafe absence claims", async () => {
    render(<SharedResourcesListView systemName="alon-prod" embedded />)

    expect(await screen.findByText("customer-role")).toBeInTheDocument()
    expect(screen.getByText("orders-shared-sg")).toBeInTheDocument()
    expect(screen.getByText("AWSServiceRoleForSecurityHub")).toBeInTheDocument()
    expect(screen.getAllByText("Protected by design")).toHaveLength(1)

    const calls = vi.mocked(fetch).mock.calls.map(([input]) => String(input))
    expect(calls).toContain("/api/proxy/iam/shared-roles?system_name=alon-prod")
    expect(calls).toContain("/api/proxy/sg/shared-sgs?system_name=alon-prod")
    expect(document.body.textContent).not.toMatch(/safe to remove/i)
    expect(document.body.textContent).not.toMatch(/not ready/i)
  })

  it("shows evidence, before/after isolation, checkpoints and restore before opening a plan", async () => {
    render(<SharedResourcesListView systemName="alon-prod" embedded />)
    const roleName = await screen.findByText("customer-role")
    fireEvent.click(roleName.closest("button") as HTMLButtonElement)

    expect(await screen.findByText("Blast-radius preview")).toBeInTheDocument()
    expect(screen.getByText("Not observed ≠ unused")).toBeInTheDocument()
    expect(screen.getByText(/Snapshot the current role attachments/)).toBeInTheDocument()
    expect(screen.getByText(/restore from the checkpoint/i)).toBeInTheDocument()
    expect(await screen.findByText("s3:GetObject")).toBeInTheDocument()
    expect(screen.getByText("Unconfirmed")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Preview isolation plan" }))
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/iam/shared-roles/by-plan/iam-plan-123")
    })
  })

  it("never labels fail-closed SG rules as observed when zero flows support them", async () => {
    render(<SharedResourcesListView systemName="alon-prod" embedded />)
    const sgName = await screen.findByText("orders-shared-sg")
    const article = sgName.closest("article") as HTMLElement
    fireEvent.click(sgName.closest("button") as HTMLButtonElement)

    expect(
      await within(article).findByText(
        "Traffic evidence is not authoritative yet; this rule stays in place",
      ),
    ).toBeInTheDocument()
    expect(
      within(article).getByText(
        "Outbound traffic analysis is still in progress; this rule stays in place",
      ),
    ).toBeInTheDocument()
    expect(within(article).getAllByText("0 observed").length).toBeGreaterThan(0)
    expect(within(article).getAllByText("2 unconfirmed").length).toBeGreaterThan(0)
    expect(article.textContent).not.toMatch(/matched 0 flows/i)
  })
})
