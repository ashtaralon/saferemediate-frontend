/**
 * Settings > Evidence coverage: the per-account, per-source verified range.
 *
 * The bodies below are TEST INPUTS shaped like the backend contract
 * (`GET /api/coverage/sources`, saferemediate-backend branch
 * claude/source-coverage-record); the panel renders only what fetch returns.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SourceCoveragePanel } from "@/components/coverage/source-coverage-panel"
import {
  formatCoverageInstant,
  normalizeSourceCoverage,
  notObservedCopy,
  notObservedInDaysCopy,
  observationWindowParams,
  readEffectiveWindow,
  readObservation,
  sourceCoverageUrl,
} from "@/lib/observation-coverage"

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

const PUBLISHED = {
  tenant_id: "tenant-a",
  generated_at: "2026-10-01T12:00:00Z",
  read_model_generation: 42,
  status: "PUBLISHED",
  accounts: [
    {
      account_id: "111122223333",
      sources: [
        {
          source: "cloudtrail",
          region: "eu-west-1",
          source_scope: "organization",
          earliest_verified_at: "2026-09-28T10:00:00Z",
          earliest_verified_basis: "FIRST_SIGNED_DIGEST",
          source_began_at: null,
          source_began_basis: null,
          history_before: "UNKNOWN",
          first_verified_collection_at: "2026-09-28T10:05:00Z",
          verified_through: "2026-10-01T11:00:00Z",
          completed_windows: [
            { from: "2026-09-28T10:00:00Z", to: "2026-09-29T03:00:00Z" },
            { from: "2026-09-29T05:00:00Z", to: "2026-10-01T11:00:00Z" },
          ],
          gaps: [{ from: "2026-09-29T03:00:00Z", to: "2026-09-29T05:00:00Z", reason: "digest chain break" }],
          status: "PARTIAL",
        },
      ],
    },
    {
      account_id: "444455556666",
      sources: [
        {
          source: "vpc_flow_logs",
          region: "eu-west-1",
          source_scope: "vpc-0abc",
          earliest_verified_at: "2026-09-30T00:00:00Z",
          earliest_verified_basis: "FIRST_DELIVERED_OBJECT",
          source_began_at: "2026-09-30T00:00:00Z",
          source_began_basis: "FLOW_LOG_CREATED",
          history_before: "UNKNOWN",
          first_verified_collection_at: null,
          verified_through: "2026-10-01T10:00:00Z",
          completed_windows: [{ from: "2026-09-30T00:00:00Z", to: "2026-10-01T10:00:00Z" }],
          gaps: [],
          status: "VERIFIED",
        },
        {
          source: "aws_config",
          region: "eu-west-1",
          source_scope: null,
          earliest_verified_at: null,
          earliest_verified_basis: null,
          source_began_at: null,
          source_began_basis: null,
          history_before: "UNKNOWN",
          first_verified_collection_at: null,
          verified_through: null,
          completed_windows: [],
          gaps: [],
          status: "NOT_STARTED",
        },
      ],
    },
  ],
}

describe("SourceCoveragePanel", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("renders each account and source with its verified range, gaps and unknown history", async () => {
    const fetchMock = vi.fn(async () => json(PUBLISHED))
    vi.stubGlobal("fetch", fetchMock)

    render(<SourceCoveragePanel />)

    const platform = await screen.findByTestId("coverage-account-111122223333")
    expect(fetchMock).toHaveBeenCalledWith("/api/proxy/coverage/sources", { cache: "no-store" })

    const trail = within(platform).getByTestId("coverage-source-cloudtrail")
    expect(trail).toHaveTextContent("CloudTrail")
    expect(trail).toHaveTextContent("eu-west-1 · organization")
    expect(trail).toHaveTextContent("Partial")
    expect(trail).toHaveTextContent("Earliest verified2026-09-28 10:00 UTC")
    expect(trail).toHaveTextContent("basis: first signed digest")
    expect(trail).toHaveTextContent("Verified through2026-10-01 11:00 UTC")
    // history_before UNKNOWN: earlier activity is unknown, never absent.
    const before = within(trail).getByTestId("coverage-history-before")
    expect(before).toHaveTextContent("Before 2026-09-28 10:00 UTC: unknown.")
    expect(before).toHaveTextContent("Earlier activity is unknown, not absent.")
    // A first signed digest can also mean logging / integrity validation restarted.
    expect(before).toHaveTextContent(/logging or integrity validation restarted/)
    // Source began is shown only when provided.
    expect(within(trail).queryByText("Source began")).not.toBeInTheDocument()
    // Completed windows and the gap inside the covered period, with its reason.
    expect(trail).toHaveTextContent("Completed windows (2)")
    expect(trail).toHaveTextContent("2026-09-28 10:00 UTC → 2026-09-29 03:00 UTC")
    const gap = within(trail).getByTestId("coverage-gap")
    expect(gap).toHaveTextContent("2026-09-29 03:00 UTC → 2026-09-29 05:00 UTC")
    expect(gap).toHaveTextContent("digest chain break")

    // Member account listed under its own account id.
    const member = screen.getByTestId("coverage-account-444455556666")
    const flows = within(member).getByTestId("coverage-source-vpc_flow_logs")
    expect(flows).toHaveTextContent("VPC Flow Logs")
    expect(flows).toHaveTextContent("Verified")
    expect(flows).toHaveTextContent("Source began2026-09-30 00:00 UTC")
    expect(flows).toHaveTextContent("basis: flow log created")
    expect(flows).toHaveTextContent("No gaps recorded inside the covered period.")
    expect(flows).not.toHaveTextContent(/logging or integrity validation restarted/)

    const config = within(member).getByTestId("coverage-source-aws_config")
    expect(config).toHaveTextContent("Not started")
    expect(config).toHaveTextContent("Collection has not started for this source; no range is verified.")
    expect(config).toHaveTextContent("No verified history yet. Earlier activity is unknown, not absent.")

    // The READY clarification sits on top of the record.
    expect(screen.getByText("READY means the platform is operational, not that history is complete.")).toBeInTheDocument()
    expect(screen.getByText(/Recorded 2026-10-01 12:00 UTC/)).toBeInTheDocument()
  })

  it("scopes the request to one account when asked", async () => {
    const fetchMock = vi.fn(async () => json({ ...PUBLISHED, accounts: [PUBLISHED.accounts[1]] }))
    vi.stubGlobal("fetch", fetchMock)

    render(<SourceCoveragePanel accountId="444455556666" />)

    await screen.findByTestId("coverage-account-444455556666")
    expect(fetchMock).toHaveBeenCalledWith("/api/proxy/coverage/sources?account_id=444455556666", { cache: "no-store" })
    expect(screen.queryByTestId("coverage-account-111122223333")).not.toBeInTheDocument()
  })

  it("renders NOT_RECORDED as 'Coverage not recorded yet', not as an error or an empty success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({
      tenant_id: "tenant-a",
      generated_at: null,
      read_model_generation: null,
      status: "NOT_RECORDED",
      accounts: [],
    })))

    render(<SourceCoveragePanel />)

    const empty = await screen.findByTestId("coverage-not-recorded")
    expect(empty).toHaveTextContent("Coverage not recorded yet")
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("shows the backend's words when the coverage read fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ detail: { message: "coverage read model unavailable" } }, 503)))

    render(<SourceCoveragePanel />)

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("Evidence coverage is unavailable")
    expect(alert).toHaveTextContent("Coverage request failed (HTTP 503): coverage read model unavailable")
  })

  it("refuses an unrecognized body instead of rendering it as coverage", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ accounts: [] })))

    render(<SourceCoveragePanel />)

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("not in a recognized shape"))
  })
})

// The serving gate answers in the route's place when there is nothing to read yet. Bodies below are the backend's
// exact answers (api/source_coverage.py behind estate_read.gate_snapshot_read, executed on a control-plane web).
const NO_WORKLOADS = {
  coverage: null, graph_version: null, hold_reason: "NO_DATA_ACCOUNTS", semantic_status: "not_recorded", source_generation: null,
}

describe("SourceCoveragePanel -- the serving gate's own answers", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("a control plane with no workload account says so, not 'unrecognized shape' and not empty coverage", async () => {
    const fetchMock = vi.fn(async () => json(NO_WORKLOADS))
    vi.stubGlobal("fetch", fetchMock)
    render(<SourceCoveragePanel />)

    const held = await screen.findByTestId("coverage-held")
    expect(held).toHaveTextContent("No workload account is connected yet — connect one in Settings › Accounts")
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(screen.queryByText(/not in a recognized shape/)).not.toBeInTheDocument()
    expect(screen.queryByText(/No accounts are recorded in the coverage record/)).not.toBeInTheDocument()
    fireEvent.click(within(held).getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })

  it("an unavailable read is shown as unavailable, never as an empty record", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ semantic_status: "unavailable", hold_reason: "graph read failed" })))
    render(<SourceCoveragePanel />)
    expect(await screen.findByTestId("coverage-held")).toHaveTextContent("Unavailable — graph read failed")
  })

  it.each([
    ["a semantic_status that is not a hold", { semantic_status: "ok", accounts: [] }],
    ["a hold_reason without semantic_status", { hold_reason: "NO_DATA_ACCOUNTS" }],
  ])("%s is still not recognized", async (_label, body) => {
    vi.stubGlobal("fetch", vi.fn(async () => json(body)))
    render(<SourceCoveragePanel />)
    expect(await screen.findByRole("alert")).toHaveTextContent("The coverage response was not in a recognized shape.")
  })

  it("a foreign or platform scope stays a refusal", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ detail: { code: "INVENTORY_SCOPE_MISMATCH", reason: "CLAIM_OUTSIDE_SERVER_SCOPE" } }, 403)))
    render(<SourceCoveragePanel accountId="999999999999" />)
    expect(await screen.findByRole("alert")).toHaveTextContent("Evidence coverage is unavailable")
    expect(screen.queryByTestId("coverage-held")).not.toBeInTheDocument()
  })
})

describe("backend field names and truncation", () => {
  it("reads source_scope and says when the backend sent only part of a list", async () => {
    const body = {
      ...PUBLISHED,
      accounts: [{
        account_id: "111122223333",
        sources: [{
          source: "vpc_flow", region: "eu-west-1", source_scope: "/vpc/flowlogs/a", status: "PARTIAL",
          earliest_verified_at: "2026-10-01T00:05:00Z", verified_through: "2026-10-01T12:00:00Z",
          history_before: "UNKNOWN",
          completed_windows: [{ from: "2026-10-01T00:05:00Z", to: "2026-10-01T06:00:00Z" }], windows_truncated: true,
          gaps: [{ from: "2026-10-01T06:00:00Z", to: "2026-10-01T07:00:00Z", reason: "acquisition_held" }], gaps_truncated: true,
        }],
      }],
    }
    const report = normalizeSourceCoverage(body)
    expect(report?.accounts[0].sources[0].scope).toBe("/vpc/flowlogs/a")
    expect(report?.accounts[0].sources[0].windowsTruncated).toBe(true)
    vi.stubGlobal("fetch", vi.fn(async () => json(body)))
    render(<SourceCoveragePanel />)
    await waitFor(() => expect(screen.getByTestId("coverage-gaps-truncated")).toBeTruthy())
    expect(screen.getByTestId("coverage-windows-truncated").textContent).toContain("Only part of the list")
  })
})

describe("observation-coverage contract helpers", () => {
  it("normalizes a source without a status as status-not-recorded, never as a guessed state", () => {
    const report = normalizeSourceCoverage({
      status: "PUBLISHED",
      accounts: [{ account_id: "111122223333", sources: [{ source: "cloudtrail" }] }],
    })
    expect(report?.accounts[0].sources[0].status).toBe("UNKNOWN")
    expect(report?.accounts[0].sources[0].earliestVerifiedAt).toBeNull()
  })

  it("reads an observation block, and treats absent / null / half-open as not recorded", () => {
    expect(readObservation({})).toBeNull()
    expect(readObservation({ observation: null })).toBeNull()
    expect(readObservation({ observation: { from: "2026-09-24T00:00:00Z" } })).toBeNull()
    expect(readObservation({
      observation: {
        from: "2026-09-24T00:00:00Z",
        to: "2026-10-01T00:00:00Z",
        sources: [{ source: "vpc_flow_logs", account_id: "111122223333", region: "eu-west-1", earliest_verified_at: "2026-09-20T00:00:00Z", verified_through: "2026-10-01T00:00:00Z", gaps: [{ from: "2026-09-25T00:00:00Z", to: "2026-09-25T06:00:00Z", reason: "delivery delay" }] }],
      },
    })).toEqual({
      from: "2026-09-24T00:00:00Z",
      to: "2026-10-01T00:00:00Z",
      sources: [{
        source: "vpc_flow_logs",
        accountId: "111122223333",
        region: "eu-west-1",
        earliestVerifiedAt: "2026-09-20T00:00:00Z",
        verifiedThrough: "2026-10-01T00:00:00Z",
        gaps: [{ from: "2026-09-25T00:00:00Z", to: "2026-09-25T06:00:00Z", reason: "delivery delay" }],
      }],
    })
  })

  it("reads the effective window, and reports clamping only when the backend says so", () => {
    expect(readEffectiveWindow({
      effective_window: { from: "2026-09-28T00:00:00Z", to: "2026-10-01T00:00:00Z", requested_window: "30d", clamped: true, clamp_reason: "coverage begins 2026-09-28" },
    })).toEqual({ from: "2026-09-28T00:00:00Z", to: "2026-10-01T00:00:00Z", requested: "30d", clamped: true, reason: "coverage begins 2026-09-28" })
    expect(readEffectiveWindow({ observation: { from: "2026-09-24T00:00:00Z", to: "2026-10-01T00:00:00Z" } }))
      .toMatchObject({ from: "2026-09-24T00:00:00Z", to: "2026-10-01T00:00:00Z", clamped: false })
    expect(readEffectiveWindow({ nodes: [] })).toBeNull()
  })

  it("builds window params and labelled UTC copy", () => {
    expect(observationWindowParams({ preset: "7d" })).toEqual({ window: "7d" })
    expect(observationWindowParams({ preset: "custom", from: "2026-09-01T00:00:00Z", to: "2026-09-10T23:59:59Z" }))
      .toEqual({ window: "custom", from: "2026-09-01T00:00:00Z", to: "2026-09-10T23:59:59Z" })
    expect(sourceCoverageUrl()).toBe("/api/proxy/coverage/sources")
    expect(formatCoverageInstant("2026-10-01T14:05:30+03:00")).toBe("2026-10-01 11:05 UTC")
    expect(formatCoverageInstant(null)).toBe("not recorded")
    expect(notObservedCopy({ from: "2026-09-24T00:00:00Z", to: "2026-10-01T00:00:00Z" }))
      .toBe("Not observed between 2026-09-24 00:00 UTC and 2026-10-01 00:00 UTC")
    expect(notObservedCopy(null)).toBe("Not observed in the recorded window")
    expect(notObservedInDaysCopy(90)).toBe("Not observed in the 90-day analysis window")
    expect(notObservedInDaysCopy(0)).toBe("Not observed in the recorded window")
    expect(notObservedInDaysCopy(undefined)).toBe("Not observed in the recorded window")
  })
})
