/**
 * Every rendered consumer of the LP proxies shows a failed read as a failure — never as
 * "0 rules", "no shared roles", or an empty all-clear.
 *
 * The chain is real on both sides of the proxy: the component's own fetch reaches the REAL
 * route handler (app/api/proxy/...), and that handler's fetch reaches a test backend that
 * answers an error status or never answers (the proxy's own abort timer ends it, shortened
 * here). Response bodies are test input; nothing is product data.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

import { SGGapCard } from "@/components/sg-gap-card"
import { S3RemediationCard } from "@/components/s3-remediation-card"
import { SharedResourcesListView } from "@/components/shared-resources/shared-resources-list-view"
import { PerResourceAnalysis } from "@/components/per-resource-analysis"
import IAMSharedRolesListView from "@/components/iam-shared-roles-list-view"
import SGSharedSGsListView from "@/components/sg-shared-sgs-list-view"
import { LeftSidebarNav } from "@/components/left-sidebar-nav"
import { requestLPDrawerPreview } from "@/lib/lp-drawer-preview"

vi.mock("@/lib/scoped-system-catalog", () => ({
  catalogSystemName: (requested: string | null, available: string[]) =>
    available.find((name) => name.toLowerCase() === String(requested || "").toLowerCase()) || null,
  useScopedSystemCatalog: () => ({
    url: "/api/proxy/systems",
    scopeKey: "test-system|all|all|all",
    ready: true,
    available: true,
  }),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}))

const BACKEND = "http://backend.test"
process.env.BACKEND_URL_OVERRIDE = BACKEND

type Backend = (url: string, init?: RequestInit) => Promise<Response>

/** The backend each proxy reaches. Default: nothing routed. */
let backend: Backend = async () => json({ detail: "unrouted in test" }, 599)

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

/** Accept the request and never answer; only the proxy's own AbortController ends it. */
const hang: Backend = (_url, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")))
  })

/** Answer `status` with a JSON body, for backend paths containing `match`; everything else via `rest`. */
function failing(match: string, status: number, rest: Backend = backend): Backend {
  return async (url, init) => (url.includes(match) ? json({ detail: "Internal error: boom" }, status) : rest(url, init))
}

const PROXIES: Array<[RegExp, string, (m: RegExpMatchArray) => Record<string, string> | null]> = [
  [/^\/api\/proxy\/security-groups\/([^/?]+)\/gap-analysis/, "@/app/api/proxy/security-groups/[sgId]/gap-analysis/route", (m) => ({ sgId: m[1] })],
  [/^\/api\/proxy\/s3-buckets\/([^/?]+)\/gap-analysis/, "@/app/api/proxy/s3-buckets/[bucketName]/gap-analysis/route", (m) => ({ bucketName: m[1] })],
  [/^\/api\/proxy\/iam\/shared-roles(\?|$)/, "@/app/api/proxy/iam/shared-roles/route", () => null],
  [/^\/api\/proxy\/sg\/shared-sgs(\?|$)/, "@/app/api/proxy/sg/shared-sgs/route", () => null],
]

let calls: string[] = []
/** React's act() warnings are a race detector here: state settling after an assertion. */
let actWarnings: string[] = []

beforeEach(() => {
  calls = []
  actWarnings = []
  backend = async () => json({ detail: "unrouted in test" }, 599)
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    const text = args.map(String).join(" ")
    if (text.includes("act(")) actWarnings.push(text)
  })
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
      calls.push(url)
      if (url.startsWith(BACKEND)) return backend(url, init)
      if (url.startsWith("/api/proxy/systems")) return json({ systems: [{ name: "test-system" }] })
      for (const [pattern, modulePath, params] of PROXIES) {
        const m = url.match(pattern)
        if (!m) continue
        const mod = (await import(/* @vite-ignore */ modulePath)) as {
          GET: (req: NextRequest, ctx?: unknown) => Promise<Response>
        }
        const p = params(m)
        const req = new NextRequest(`http://localhost${url}`)
        return p ? mod.GET(req, { params: Promise.resolve(p) }) : mod.GET(req)
      }
      return json({ detail: { code: "UNROUTED_IN_TEST" } }, 599)
    }),
  )
})

afterEach(() => {
  expect(actWarnings).toEqual([])
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** Shrink only the proxies' own 25-30s abort timers, so a hung backend reaches them in this test. */
function fastProxyAbort() {
  const realSetTimeout = globalThis.setTimeout
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void, ms?: number, ...rest: unknown[]) =>
    realSetTimeout(fn, ms !== undefined && ms >= 20_000 && ms <= 60_000 ? 20 : ms, ...rest)) as typeof setTimeout)
}

// ── SG gap analysis → SG gap card (SG inspector) ──────────────────────────

const SG_ID = "sg-0test0000000000"

describe("SG gap card — a failed analysis is an error, not an SG with zero rules", () => {
  it("a backend 500 renders the error state with Retry", async () => {
    backend = failing("/inspector", 500)
    render(<SGGapCard sgId={SG_ID} />)
    // The backend's allowlisted detail message, carried through the proxy's error shape.
    expect(await screen.findByText("Internal error: boom")).toBeTruthy()
    expect(screen.getByText("Retry")).toBeTruthy()
    expect(document.body.textContent).not.toContain("[object Object]")
    expect(document.body.textContent).not.toMatch(/\b0 (ENIs|rules)\b/)
  })

  it("a typed refusal renders its message, never [object Object]", async () => {
    backend = async () => json({ detail: { code: "SERVING_READ_REFUSED", message: "serving tier refused the read" } }, 503)
    render(<SGGapCard sgId={SG_ID} />)
    expect(await screen.findByText("serving tier refused the read")).toBeTruthy()
    expect(document.body.textContent).not.toContain("[object Object]")
  })

  it("the proxy's timeout renders the error state", async () => {
    backend = hang
    fastProxyAbort()
    render(<SGGapCard sgId={SG_ID} />)
    expect(await screen.findByText("Backend request timed out")).toBeTruthy()
    expect(screen.getByText("Retry")).toBeTruthy()
  })
})

// ── S3 gap analysis → S3 remediation card (NHI profile data plane) ────────

const BUCKET = "test-bucket"

describe("S3 remediation card — a failed analysis is an error, not a bucket with nothing to remove", () => {
  it.each([[404], [500]])("a backend %i renders the failure, no statements", async (status) => {
    backend = failing("/gap-analysis", status)
    render(<S3RemediationCard bucketName={BUCKET} />)
    expect(await screen.findByText(new RegExp(`Failed to load ${BUCKET}`))).toBeTruthy()
    expect(document.body.textContent).not.toContain("Policy Statements")
  })

  it("control: a real analysis renders its statement", async () => {
    backend = async () =>
      json({
        bucket_name: BUCKET,
        observation_days: 30,
        policies_analysis: [
          { policy_name: "TestStatement", policy_type: "unused", risk_level: "HIGH", recommendation: "remove",
            access_count: 0, is_public: true, actions: ["s3:GetObject"], effect: "Allow" },
        ],
      })
    render(<S3RemediationCard bucketName={BUCKET} />)
    expect(await screen.findByText("TestStatement")).toBeTruthy()
    expect(document.body.textContent).not.toContain("Failed to load")
  })
})

// ── Shared roles / SGs → every rendered reader ────────────────────────────

const IAM_ROW = {
  role_name: "test-shared-role",
  role_arn: "arn:aws:iam::000000000000:role/test-shared-role",
  headline_state: "narrowing_available",
  allowed_count: 3,
  consumer_kinds: { Lambda: 2 },
}

const emptyShared: Backend = async (url) =>
  url.includes("/api/iam/shared-roles") ? json({ shared_roles: [], count: 0, filters: {}, as_of: "test" }) : json({ shared_sgs: [] })

describe("Shared Resources list — a failed discovery is an error, not 'no shared controls'", () => {
  it("an IAM discovery timeout renders the load failure", async () => {
    backend = async (url, init) => (url.includes("/api/iam/shared-roles") ? hang(url, init) : json({ shared_sgs: [] }))
    fastProxyAbort()
    render(<SharedResourcesListView systemName="test-system" embedded />)
    expect(await screen.findByText("Shared access inventory could not be loaded")).toBeTruthy()
    expect(screen.queryByText("No shared controls match this view")).toBeNull()
  })

  it("an SG discovery 500 renders the load failure", async () => {
    backend = failing("/api/sg/shared-sgs", 500, emptyShared)
    render(<SharedResourcesListView systemName="test-system" embedded />)
    expect(await screen.findByText("Shared access inventory could not be loaded")).toBeTruthy()
    expect(screen.queryByText("No shared controls match this view")).toBeNull()
  })

  it("control: a real empty discovery is still the honest empty state", async () => {
    backend = emptyShared
    render(<SharedResourcesListView systemName="test-system" embedded />)
    expect(await screen.findByText("No shared controls match this view")).toBeTruthy()
    expect(screen.queryByText("Shared access inventory could not be loaded")).toBeNull()
  })
})

describe("Per-Resource Analysis scan — a failed discovery is an error, not 'No shared resources found'", () => {
  it("an SG discovery timeout renders the error banner", async () => {
    backend = async (url, init) => (url.includes("/api/sg/shared-sgs") ? hang(url, init) : emptyShared(url, init))
    fastProxyAbort()
    render(<PerResourceAnalysis systemName="test-system" />)
    fireEvent.click(screen.getByText("Scan AWS Account"))
    expect(await screen.findByText("Backend request timed out")).toBeTruthy()
    expect(document.body.textContent).not.toContain("No shared resources found")
  })

  it("control: a real empty discovery still says none were found", async () => {
    backend = emptyShared
    render(<PerResourceAnalysis systemName="test-system" />)
    fireEvent.click(screen.getByText("Scan AWS Account"))
    expect(await screen.findByText(/No shared resources found/)).toBeTruthy()
  })
})

describe("Shared roles / SGs list pages — a failed discovery is an error, not an empty list", () => {
  it("IAM shared roles: a timeout renders the discovery failure", async () => {
    backend = hang
    fastProxyAbort()
    render(<IAMSharedRolesListView />)
    expect(await screen.findByText("Discovery query failed")).toBeTruthy()
    expect(screen.queryByText("No shared roles match these filters.")).toBeNull()
  })

  it("SG shared SGs: a timeout renders the error, not 'No shared SGs found'", async () => {
    backend = hang
    fastProxyAbort()
    render(<SGSharedSGsListView />)
    expect(await screen.findByText("Error:")).toBeTruthy()
    expect(screen.queryByText("No shared SGs found with these filters.")).toBeNull()
  })

  it("control: a real empty SG discovery is still the honest empty state", async () => {
    backend = emptyShared
    render(<SGSharedSGsListView />)
    expect(await screen.findByText("No shared SGs found with these filters.")).toBeTruthy()
  })
})

describe("Sidebar Shared Resources badge — a half-failed read shows no count", () => {
  function sharedLink() {
    return screen.getByText("Shared Resources V2").closest("a") as HTMLElement
  }

  it("SG discovery timing out while IAM answers: no badge, not IAM's half", async () => {
    backend = async (url, init) =>
      url.includes("/api/sg/shared-sgs") ? hang(url, init) : json({ shared_roles: [IAM_ROW], count: 1 })
    fastProxyAbort()
    render(<LeftSidebarNav />)
    await waitFor(() => expect(calls.some((u) => u.startsWith(`${BACKEND}/api/sg/shared-sgs`))).toBe(true))
    // Let the aborted read settle before asserting the badge's absence.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100))
    })
    expect(sharedLink().textContent).toBe("Shared Resources V2")
  })

  it("control: both reads answering shows the real count", async () => {
    backend = async (url) =>
      url.includes("/api/sg/shared-sgs") ? json({ shared_sgs: [] }) : json({ shared_roles: [IAM_ROW], count: 1 })
    render(<LeftSidebarNav />)
    await waitFor(() => expect(sharedLink().textContent).toBe("Shared Resources V21"))
  })
})

// ── LP drawer Preview (Resource Risk drawer) ──────────────────────────────

describe("LP drawer SG Preview — a failed gap read is not an empty rule set", () => {
  const row = { id: SG_ID, resourceType: "SecurityGroup", resourceName: "test-sg" }
  const capabilities = [
    { resource_type: "SecurityGroup", display_name: "Security Groups", family: "Network", analyzers: ["security_group"],
      required_evidence: ["Security group rules"], preview_supported: true, apply_supported: false, rollback_supported: false },
  ]

  it("a null gap analysis (LeastPrivilegeTab.fetchSGGapAnalysis on a non-2xx) refuses and sends nothing", async () => {
    await expect(
      requestLPDrawerPreview(row, { capabilities: capabilities as never, sgGapAnalysis: async () => null }),
    ).rejects.toThrow("Failed to load analysis")
    expect(calls.filter((u) => u.includes("/remediation/simulate"))).toEqual([])
  })

  it("control: a real gap analysis still sends the Preview", async () => {
    const out = await requestLPDrawerPreview(row, {
      capabilities: capabilities as never,
      sgGapAnalysis: async () => ({ rules_analysis: [] }),
    })
    expect(out.kind).toBe("security_group")
    expect(calls).toContain("/api/proxy/remediation/simulate")
  })
})
