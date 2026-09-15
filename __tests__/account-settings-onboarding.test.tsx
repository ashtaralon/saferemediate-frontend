import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AddAccountDialog } from "@/components/settings/account-onboarding-dialog"
import { OperatorSignInPanel } from "@/components/settings/operator-sign-in-panel"
import { operatorStateSchema } from "@/lib/account-onboarding"
import { ACCOUNT, MANAGEMENT, TENANT, binding, discovery, operation, operatorState } from "./fixtures/account-onboarding-v2"

type Handler = (url: URL, init: RequestInit | undefined) => { status?: number; body: unknown } | undefined
const requests: Array<{ method: string; path: string; body: Record<string, unknown> | null }> = []

function backend(handler: Handler) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://console.test")
    const body = init?.body ? JSON.parse(String(init.body)) : null
    requests.push({ method: init?.method || "GET", path: url.pathname, body })
    const answer = handler(url, init)
    if (!answer) throw new Error(`unexpected request ${init?.method || "GET"} ${url.pathname}`)
    return new Response(JSON.stringify(answer.body), { status: answer.status ?? 200, headers: { "Content-Type": "application/json" } })
  }))
}

beforeEach(() => {
  requests.length = 0
})
afterEach(() => {
  vi.unstubAllGlobals()
})

function dialog(state = operatorState()) {
  return render(
    <AddAccountDialog operator={operatorStateSchema.parse(state)} operatorLoading={false} operatorError={null} onOperatorChanged={() => {}} onClose={() => {}} onChanged={() => {}} />,
  )
}

describe("operator sign-in panel", () => {
  it("offers identity-provider sign-in when no operator session exists", () => {
    render(<OperatorSignInPanel state={operatorStateSchema.parse(operatorState({ verified: "NOT_SIGNED_IN" }))} loading={false} error={null} onChanged={() => {}} />)
    expect(screen.getByTestId("operator-panel")).toHaveAttribute("data-operator-state", "signed-out")
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/api/auth/operator/start?returnTo=%2Fsettings%2Faccounts")
    expect(screen.getByText(/not the shared console password/i)).toBeInTheDocument()
  })

  it("shows server-derived roles and limits an auditor to read-only", () => {
    render(<OperatorSignInPanel state={operatorStateSchema.parse(operatorState({ roles: ["AUDITOR"], submit: false }))} loading={false} error={null} onChanged={() => {}} />)
    expect(screen.getByTestId("operator-panel")).toHaveAttribute("data-operator-state", "read-only")
    expect(screen.getByText(/AUDITOR/)).toBeInTheDocument()
    expect(screen.getByText(/cannot add accounts, retry or cancel/i)).toBeInTheDocument()
  })

  it("fails closed when sign-in cannot be verified", () => {
    render(<OperatorSignInPanel state={operatorStateSchema.parse(operatorState({ verified: "UNAVAILABLE" }))} loading={false} error={null} onChanged={() => {}} />)
    expect(screen.getByTestId("operator-panel")).toHaveAttribute("data-operator-state", "unavailable")
    expect(screen.getByText(/stay disabled until your identity is verified/i)).toBeInTheDocument()
  })

  it("reports a sign-out that could not be recorded for other devices", async () => {
    backend((url) => url.pathname === "/api/auth/operator/logout" ? { status: 503, body: { signed_in: false, revocation: "NOT_RECORDED", end_session_url: null } } : undefined)
    render(<OperatorSignInPanel state={operatorStateSchema.parse(operatorState())} loading={false} error={null} onChanged={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }))
    expect(await screen.findByText(/could not be recorded for other devices/i)).toBeInTheDocument()
  })
})

describe("add AWS accounts dialog", () => {
  it("shows no onboarding controls until the operator is verified", () => {
    dialog(operatorState({ verified: "NOT_SIGNED_IN" }))
    expect(screen.queryByTestId("single-account-onboarding")).toBeNull()
    expect(screen.queryByRole("tab", { name: /AWS Organization/ })).toBeNull()
  })

  it("runs a single account through binding, display-once ExternalId, role attach, connect, retry", async () => {
    const externalId = "cyntro-generated-external-id-0123456789abcdef"
    let current: Record<string, unknown> | null = null
    let reads = 0
    backend((url, init) => {
      const method = init?.method || "GET"
      if (url.pathname.endsWith("/access-bindings") && method === "GET") return { body: { bindings: [] } }
      if (url.pathname.endsWith("/access-bindings") && method === "POST") return { status: 201, body: { binding: binding(), external_id: externalId, external_id_display: "ONCE" } }
      if (url.pathname.includes("/installation-plans/single_account")) {
        return { body: { mode: "single_account", execution_owner: "CUSTOMER", templates: [{ template_id: "account-read-spoke", path: "deploy/customer_pilot/account-read-spoke.yaml", sha256: "b".repeat(64), template_version: "2.0.0", parameters: [{ name: "ExternalId", value: "<EXTERNAL_ID_FROM_MEMBER_READ_BINDING>" }] }], steps: [{ step_id: "deploy-read-role", title: "Deploy the Cyntro read role", commands: ["aws cloudformation deploy --parameter-overrides ExternalId=<EXTERNAL_ID_FROM_MEMBER_READ_BINDING>"], verification: "Copy the ReadRoleArn output" }], rollback: [] } }
      }
      if (url.pathname.endsWith("/access-bindings/role")) return { body: { binding: binding({ role_configured: true, status: "PENDING_VALIDATION" }) } }
      if (url.pathname.endsWith("/operations") && method === "POST") {
        current = operation({ status: "QUEUED" })
        return { status: 202, body: { accepted: true, replayed: false, operation: current } }
      }
      if (url.pathname.endsWith("/retry")) {
        current = operation({ operation_id: "aon-bbbbbbbbbbbbbbbbbbbbbbbb", status: "SUCCEEDED", retry_of: "aon-0123456789abcdef01234567", steps: [{ step_id: "inventory.bootstrap_enqueued", status: "SUCCEEDED", recorded_at: "2026-09-15T10:01:00+00:00", detail: "Inventory bootstrap requested", evidence: {} }] })
        return { status: 202, body: { accepted: true, replayed: false, operation: current } }
      }
      if (url.pathname.includes("/operations/aon-")) {
        reads += 1
        if (reads === 1 && current?.status === "QUEUED") {
          current = operation({ status: "BLOCKED", attempt_count: 1, failure: { code: "ASSUME_ROLE_DENIED", message: "Cyntro could not assume the role. Check the trust policy principal and that the ExternalId matches the one issued for this binding.", retryable: true } })
        }
        return { body: { operation: current, events: [] } }
      }
      return undefined
    })
    dialog()
    fireEvent.change(screen.getByLabelText("Account name"), { target: { value: "Payments" } })
    fireEvent.change(screen.getByLabelText("AWS account ID"), { target: { value: ACCOUNT } })
    fireEvent.click(await screen.findByRole("button", { name: /create access binding/i }))

    const once = await screen.findByTestId("external-id-once")
    expect(within(once).getByTestId("external-id-value")).toHaveTextContent(externalId)
    expect(await screen.findByTestId("installation-plan")).toHaveTextContent("<EXTERNAL_ID_FROM_MEMBER_READ_BINDING>")
    expect(screen.getByTestId("installation-plan")).not.toHaveTextContent(externalId)
    fireEvent.click(within(once).getByRole("button", { name: /i stored it/i }))
    expect(screen.queryByText(externalId)).toBeNull()

    fireEvent.change(screen.getByPlaceholderText(/arn:aws:iam::/), { target: { value: "arn:aws:iam::222222222222:role/CyntroRead-tenant-a" } })
    fireEvent.click(screen.getByRole("button", { name: /attach role/i }))
    expect(await screen.findByRole("alert")).toHaveTextContent("belongs to account 222222222222")
    expect(requests.some((request) => request.path.endsWith("/access-bindings/role"))).toBe(false)

    fireEvent.change(screen.getByPlaceholderText(/arn:aws:iam::/), { target: { value: `arn:aws:iam::${ACCOUNT}:role/CyntroRead-tenant-a` } })
    fireEvent.click(screen.getByRole("button", { name: /attach role/i }))
    fireEvent.click(await screen.findByRole("button", { name: /connect account/i }))

    const blocked = await screen.findByText(/could not assume the role/i)
    expect(blocked).toBeInTheDocument()
    expect(screen.getByTestId("onboarding-operation")).toHaveAttribute("data-operation-status", "BLOCKED")
    fireEvent.click(screen.getByRole("button", { name: /retry/i }))
    await waitFor(() => expect(screen.getByTestId("onboarding-operation")).toHaveAttribute("data-operation-status", "SUCCEEDED"))
    expect(screen.getByText("Inventory bootstrap requested")).toBeInTheDocument()

    const submitted = requests.find((request) => request.method === "POST" && request.path.endsWith("/operations"))!
    expect(submitted.body).toMatchObject({ operation_type: "CONNECT_ACCOUNT", customer_id: TENANT, account_id: ACCOUNT, command: { display_name: "Payments", regions: ["eu-west-1"] } })
    expect(JSON.stringify(requests.map((request) => request.body))).not.toContain(externalId)
  })

  it("selects an explicit organization scope and reports per-account partial failure", async () => {
    const parentId = "aon-cccccccccccccccccccccccc"
    const children = [
      operation({ operation_id: "aon-dddddddddddddddddddddddd", account_id: "111111111111", parent_operation_id: parentId, status: "SUCCEEDED", command: { display_name: "payments" } }),
      operation({ operation_id: "aon-eeeeeeeeeeeeeeeeeeeeeeee", account_id: "222222222222", parent_operation_id: parentId, status: "BLOCKED", command: { display_name: "checkout" }, failure: { code: "ASSUME_ROLE_DENIED", message: "Cyntro could not assume the role.", retryable: true } }),
    ]
    backend((url, init) => {
      const method = init?.method || "GET"
      if (url.pathname.endsWith("/access-bindings") && method === "GET") {
        return { body: { bindings: [
          binding({ account_id: MANAGEMENT, purpose: "ORGANIZATION_DISCOVERY", status: "PENDING_VALIDATION", role_configured: true }),
          binding({ account_id: MANAGEMENT, purpose: "ORGANIZATION_MEMBER_READ", status: "PENDING_VALIDATION", role_configured: true }),
        ] } }
      }
      if (url.pathname.endsWith("/operations") && method === "POST") {
        const body = JSON.parse(String(init?.body))
        if (body.operation_type === "DISCOVER_ORGANIZATION") {
          return { status: 202, body: { accepted: true, replayed: false, operation: operation({ operation_id: "aon-aaaaaaaaaaaaaaaaaaaaaaaa", account_id: MANAGEMENT, operation_type: "DISCOVER_ORGANIZATION", status: "QUEUED" }) } }
        }
        return { status: 202, body: { accepted: true, replayed: false, operation: operation({ operation_id: parentId, account_id: MANAGEMENT, operation_type: "CONNECT_ORGANIZATION_ACCOUNTS", status: "QUEUED", command: body.command }) } }
      }
      if (url.pathname.endsWith("/operations/aon-aaaaaaaaaaaaaaaaaaaaaaaa")) {
        return { body: { operation: operation({ operation_id: "aon-aaaaaaaaaaaaaaaaaaaaaaaa", account_id: MANAGEMENT, operation_type: "DISCOVER_ORGANIZATION", status: "SUCCEEDED", result: { discovery_id: discovery().discovery_id } }), events: [] } }
      }
      if (url.pathname.includes("/discoveries/")) return { body: { discovery: discovery() } }
      if (url.pathname.endsWith(`/operations/${parentId}`)) {
        return { body: { operation: operation({ operation_id: parentId, account_id: MANAGEMENT, operation_type: "CONNECT_ORGANIZATION_ACCOUNTS", status: "PARTIALLY_SUCCEEDED", result: { accounts_in_scope: 2, children_succeeded: 1, children_blocked: 1, children_failed: 0, children_pending: 0, suspended_accounts_skipped: ["333333333333"], accounts_not_in_discovery: [] } }), events: [] } }
      }
      if (url.pathname.endsWith(`/operations/${parentId}/children`)) return { body: { parent_operation_id: parentId, total: 2, hidden_by_account_scope: 0, children } }
      return undefined
    })
    dialog()
    fireEvent.click(screen.getByRole("tab", { name: /AWS Organization/ }))
    fireEvent.change(screen.getByLabelText("Management account ID"), { target: { value: MANAGEMENT } })
    fireEvent.click(await screen.findByRole("button", { name: /discover organization/i }))

    const scope = await screen.findByTestId("organization-scope")
    fireEvent.click(within(scope).getByLabelText("Organizational unit Production"))
    expect(within(scope).getByTestId("scope-preview")).toHaveTextContent("2 accounts will be connected · 1 suspended skipped")
    expect(within(scope).getByLabelText("Account legacy 333333333333")).toBeDisabled()
    fireEvent.click(within(scope).getByRole("button", { name: /connect 2 accounts/i }))

    const table = await screen.findByTestId("organization-children")
    expect(table.querySelector('[data-child-account="222222222222"]')).toHaveAttribute("data-child-status", "BLOCKED")
    expect(within(table).getAllByRole("button", { name: "Retry" })).toHaveLength(1)
    await waitFor(() => expect(screen.getByTestId("organization-counts")).toHaveTextContent("1 connected · 1 need attention · 0 pending · suspended skipped: 333333333333"))
    const connect = requests.find((request) => request.body?.operation_type === "CONNECT_ORGANIZATION_ACCOUNTS")!
    expect(connect.body?.command).toMatchObject({ discovery_id: discovery().discovery_id, organizational_unit_ids: ["ou-ab12-prod0001"], account_ids: [], excluded_account_ids: [] })
  })
})
