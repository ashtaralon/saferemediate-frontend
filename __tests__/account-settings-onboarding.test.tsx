import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/components/left-sidebar-nav", () => ({ LeftSidebarNav: () => null }))

import { AddAccountDialog } from "@/app/settings/accounts/page"

function operation(status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "BLOCKED" | "FAILED", operationType: "REGISTER_METADATA" | "VALIDATE_ACCESS" = "REGISTER_METADATA") {
  const terminal = ["SUCCEEDED", "BLOCKED", "FAILED"].includes(status)
  return {
    contract_version: "account-onboarding/v1",
    operation_id: "aon-1234567890abcdef12345678",
    request_id: expect.any(String),
    idempotency_key: expect.any(String),
    customer_id: "acme",
    account_id: "111111111111",
    operation_type: operationType,
    command_digest: `sha256:${"a".repeat(64)}`,
    requested_by: { identity_source: "identity_not_enforced", actor: null },
    status,
    requested_at: "2026-09-15T10:00:00+00:00",
    updated_at: "2026-09-15T10:00:01+00:00",
    started_at: status === "QUEUED" ? null : "2026-09-15T10:00:00+00:00",
    finished_at: terminal ? "2026-09-15T10:00:01+00:00" : null,
    attempt_count: status === "QUEUED" ? 0 : 1,
    lifecycle_state: status === "SUCCEEDED" ? (operationType === "REGISTER_METADATA" ? "INSTALLING" : "PROVISIONING") : null,
    steps: [{
      step_id: status === "SUCCEEDED" ? "registry.metadata" : status === "RUNNING" ? "worker.claimed" : "command.accepted",
      status: status === "FAILED" ? "FAILED" : status,
      recorded_at: "2026-09-15T10:00:01+00:00",
      detail: status === "SUCCEEDED" ? "Account display and scope metadata registered" : `${status} detail`,
      evidence: status === "SUCCEEDED" ? { mutation_enabled: false } : {},
    }],
    failure: status === "BLOCKED" || status === "FAILED" ? {
      code: status === "BLOCKED" ? "aws_validation_not_wired" : "handler_failed",
      message: `${status} detail`,
      retryable: false,
    } : null,
  }
}

function materialize(value: ReturnType<typeof operation>, requestBody: Record<string, unknown>) {
  return {
    ...value,
    request_id: requestBody.request_id,
    idempotency_key: requestBody.idempotency_key,
  }
}

async function fillAndReview() {
  fireEvent.change(screen.getByLabelText("Account name"), { target: { value: "Production" } })
  fireEvent.change(screen.getByLabelText("AWS account ID"), { target: { value: "111111111111" } })
  fireEvent.click(screen.getByRole("button", { name: "Review installation" }))
  expect(screen.getByText("Automated StackSet installation is unavailable")).toBeInTheDocument()
}

describe("AWS account onboarding Settings dialog", () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("keeps every access permission off and reports registration success only after SUCCEEDED", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const requestBody = JSON.parse(String(init?.body))
      return Response.json({
        accepted: true,
        replayed: false,
        operation: materialize(operation("SUCCEEDED"), requestBody),
      }, { status: 202 })
    })
    vi.stubGlobal("fetch", fetchMock)
    render(<AddAccountDialog customerId="acme" onClose={vi.fn()} onCreated={vi.fn()} />)

    await fillAndReview()
    expect(screen.getAllByText("OFF")).toHaveLength(3)
    fireEvent.click(screen.getByRole("button", { name: "Register metadata" }))

    expect(await screen.findByText("Metadata registration: succeeded")).toBeInTheDocument()
    expect(screen.getByText("Metadata is registered; access is still off")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Validate access" })).toBeEnabled()
    const sent = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(sent.operation_type).toBe("REGISTER_METADATA")
    expect(sent.command).toMatchObject({
      read_enabled: false,
      verification_enabled: false,
      mutation_enabled: false,
    })
  })

  it("renders queued then running while polling the exact scoped operation", async () => {
    vi.useFakeTimers()
    let requestBody: Record<string, unknown> = {}
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        requestBody = JSON.parse(String(init.body))
        return Response.json({ accepted: true, replayed: false, operation: materialize(operation("QUEUED"), requestBody) }, { status: 202 })
      }
      return Response.json({ operation: materialize(operation("RUNNING"), requestBody) })
    })
    vi.stubGlobal("fetch", fetchMock)
    const view = render(<AddAccountDialog customerId="acme" onClose={vi.fn()} onCreated={vi.fn()} />)

    await fillAndReview()
    fireEvent.click(screen.getByRole("button", { name: "Register metadata" }))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(screen.getByText("Metadata registration: queued")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Close account onboarding" })).toBeDisabled()

    await act(async () => { await vi.advanceTimersByTimeAsync(1_250) })
    expect(screen.getByText("Metadata registration: running")).toBeInTheDocument()
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      "/onboarding-operations/aon-1234567890abcdef12345678?customer_id=acme&account_id=111111111111",
    )
    view.unmount()
  })

  it.each(["BLOCKED", "FAILED"] as const)("shows terminal %s without a success claim", async (status) => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const requestBody = JSON.parse(String(init?.body))
      return Response.json({ accepted: true, replayed: false, operation: materialize(operation(status), requestBody) }, { status: 202 })
    })
    vi.stubGlobal("fetch", fetchMock)
    render(<AddAccountDialog customerId="acme" onClose={vi.fn()} onCreated={vi.fn()} />)

    await fillAndReview()
    fireEvent.click(screen.getByRole("button", { name: "Register metadata" }))
    expect(await screen.findByText(`Metadata registration: ${status.toLowerCase()}`)).toBeInTheDocument()
    expect(screen.queryByText("Metadata is registered; access is still off")).not.toBeInTheDocument()
  })

  it("renders backend 503 as setup unavailable and never as registration success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      detail: { error: "account_onboarding_commands_unavailable", contract_version: "account-onboarding/v1" },
    }, { status: 503 })))
    render(<AddAccountDialog customerId="acme" onClose={vi.fn()} onCreated={vi.fn()} />)

    await fillAndReview()
    fireEvent.click(screen.getByRole("button", { name: "Register metadata" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Account setup is unavailable")
    expect(screen.getByRole("alert")).toHaveTextContent("Nothing was marked successful")
    expect(screen.queryByText("Metadata is registered; access is still off")).not.toBeInTheDocument()
  })

  it("submits validation as a separate empty command after metadata succeeds", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const requestBody = JSON.parse(String(init?.body))
      const type = requestBody.operation_type as "REGISTER_METADATA" | "VALIDATE_ACCESS"
      return Response.json({
        accepted: true,
        replayed: false,
        operation: materialize(operation("SUCCEEDED", type), requestBody),
      }, { status: 202 })
    })
    vi.stubGlobal("fetch", fetchMock)
    render(<AddAccountDialog customerId="acme" onClose={vi.fn()} onCreated={vi.fn()} />)

    await fillAndReview()
    fireEvent.click(screen.getByRole("button", { name: "Register metadata" }))
    await screen.findByRole("button", { name: "Validate access" })
    fireEvent.click(screen.getByRole("button", { name: "Validate access" }))

    expect(await screen.findByText("Access validation: succeeded")).toBeInTheDocument()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const validation = JSON.parse(String(fetchMock.mock.calls[1][1]?.body))
    expect(validation).toMatchObject({
      operation_type: "VALIDATE_ACCESS",
      customer_id: "acme",
      account_id: "111111111111",
      command: {},
    })
  })

  it("reuses one request and idempotency key after an ambiguous response failure", async () => {
    const bodies: Record<string, unknown>[] = []
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      bodies.push(requestBody)
      if (bodies.length === 1) throw new TypeError("connection closed after submit")
      return Response.json({
        accepted: true,
        replayed: false,
        operation: materialize(operation("SUCCEEDED"), requestBody),
      }, { status: 202 })
    })
    vi.stubGlobal("fetch", fetchMock)
    render(<AddAccountDialog customerId="acme" onClose={vi.fn()} onCreated={vi.fn()} />)

    await fillAndReview()
    fireEvent.click(screen.getByRole("button", { name: "Register metadata" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("connection closed after submit")
    fireEvent.click(screen.getByRole("button", { name: "Review and retry" }))
    fireEvent.click(screen.getByRole("button", { name: "Register metadata" }))
    expect(await screen.findByText("Metadata registration: succeeded")).toBeInTheDocument()

    expect(bodies).toHaveLength(2)
    expect(bodies[1].request_id).toBe(bodies[0].request_id)
    expect(bodies[1].idempotency_key).toBe(bodies[0].idempotency_key)
  })

  it("aborts polling when the dialog unmounts", async () => {
    vi.useFakeTimers()
    let requestBody: Record<string, unknown> = {}
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") requestBody = JSON.parse(String(init.body))
      return init?.method === "POST"
        ? Response.json({ accepted: true, replayed: false, operation: materialize(operation("QUEUED"), requestBody) }, { status: 202 })
        : Response.json({ operation: materialize(operation("QUEUED"), requestBody) })
    })
    vi.stubGlobal("fetch", fetchMock)
    const view = render(<AddAccountDialog customerId="acme" onClose={vi.fn()} onCreated={vi.fn()} />)
    await fillAndReview()
    fireEvent.click(screen.getByRole("button", { name: "Register metadata" }))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(screen.getByText("Metadata registration: queued")).toBeInTheDocument()

    view.unmount()
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("starts a new intent after a verified terminal failure", async () => {
    const bodies: Record<string, unknown>[] = []
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      bodies.push(requestBody)
      const status = bodies.length === 1 ? "FAILED" : "SUCCEEDED"
      return Response.json({
        accepted: true,
        replayed: false,
        operation: materialize(operation(status), requestBody),
      }, { status: 202 })
    })
    vi.stubGlobal("fetch", fetchMock)
    render(<AddAccountDialog customerId="acme" onClose={vi.fn()} onCreated={vi.fn()} />)

    await fillAndReview()
    fireEvent.click(screen.getByRole("button", { name: "Register metadata" }))
    expect(await screen.findByText("Metadata registration: failed")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Review and retry" }))
    fireEvent.click(screen.getByRole("button", { name: "Register metadata" }))
    expect(await screen.findByText("Metadata registration: succeeded")).toBeInTheDocument()

    expect(bodies[1].request_id).not.toBe(bodies[0].request_id)
    expect(bodies[1].idempotency_key).not.toBe(bodies[0].idempotency_key)
  })
})
