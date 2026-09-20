import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {} }) }))

import { DataPlane } from "@/components/nhi-profile/data-plane"
import { NHITab } from "@/components/identities/nhi-tab"
import {
  RESIDENT_HEADERS,
  ROLE_ARN,
  ROLE_NAME,
  backendSocket,
  captured,
  mutatedCapture,
  routeResponse,
  startServer,
  stopServer,
  type CapturedName,
  type Reply,
  type Sent,
} from "./fixtures/semantic-identity-data-access-fe16eb0b/route-chain"

// Every data-access answer rendered here is a captured producer body (or a labelled mutation of one) that
// went through the REAL proxy route, under the real startup hook and proof selection. Only the backend
// socket is replaced.

const saved = { ...process.env }
let sent: Sent[] = []
let pageCalls: string[] = []
let reply: () => Reply
// Host-page scaffolding for NHITab only (its list and detail calls); never a data-access answer.
let hostPage: (url: URL) => Response | undefined = () => undefined

beforeEach(async () => {
  sent = []
  pageCalls = []
  hostPage = () => undefined
  vi.stubGlobal("fetch", backendSocket(() => reply(), sent, async (url) => {
    pageCalls.push(`${url.pathname}${url.search}`)
    if (url.pathname.startsWith("/api/proxy/identities/data-access/")) {
      const name = decodeURIComponent(url.pathname.split("/").pop()!)
      return routeResponse({ name, arn: url.searchParams.get("arn"), headers: RESIDENT_HEADERS })
    }
    const answered = hostPage(url)
    if (answered) return answered
    throw new TypeError(`unexpected page fetch ${url.pathname}`)
  }))
  await startServer("customer_resident")
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  stopServer(saved)
  process.env = { ...saved }
})

const use = (name: CapturedName) => { reply = () => captured(name) }
const byTestId = (c: HTMLElement, id: string) => c.querySelector(`[data-testid="${id}"]`)
function mount(identity: Record<string, unknown> = { arn: ROLE_ARN }) {
  return render(<DataPlane identityName={ROLE_NAME} detail={{}} identity={identity} onRemediate={() => {}} />)
}
async function settled(c: HTMLElement) {
  await waitFor(() => expect(byTestId(c, "data-access-loading")).toBeNull())
}
/** No action is ever offered from this answer: it observes access and authorizes nothing. */
function assertNoAction(c: HTMLElement) {
  const labels = [...c.querySelectorAll("button")].map((b) => b.textContent ?? "")
  expect(labels.filter((l) => /remediat|analy[sz]e|review|apply|fix/i.test(l))).toEqual([])
}

describe("Data Plane: identity.data_access answers, as captured", () => {
  it("01 populated: the bucket, its pinned evidence, the inferred table row and verified provenance", async () => {
    use("01-ready-populated")
    const { container } = mount()
    await settled(container)
    expect(pageCalls).toEqual([`/api/proxy/identities/data-access/${ROLE_NAME}?arn=${encodeURIComponent(ROLE_ARN)}`])
    const text = container.textContent ?? ""
    expect(text).toContain("fixture-orders-archive")
    expect(byTestId(container, "data-access-allowed-not-computed")?.textContent).toContain("DECISION_IDENTITY_DATA_ACCESS_ALLOWED_OPERATIONS_UNSUPPORTED")
    expect(text).toContain("812 hits")
    expect(byTestId(container, "data-access-table-inferred")).not.toBeNull()
    expect(byTestId(container, "data-access-tables-partial")).not.toBeNull()
    const provenance = byTestId(container, "data-access-provenance")?.textContent ?? ""
    expect(provenance).toContain("Neptune Serving Graph")
    expect(provenance).toContain("generation 42")
    expect(provenance).toContain("fresh")
    expect(byTestId(container, "data-plane-counts")?.textContent).toMatch(/^1 data store\(s\) · 3 observed operation\(s\)$/)
    expect(text).not.toMatch(/neo4j|aura/i)
    assertNoAction(container)
  })

  it("02 genuine empty: says no S3 access was observed, within the window; tables not computed", async () => {
    use("02-ready-genuine-empty")
    const { container } = mount()
    await settled(container)
    expect(byTestId(container, "data-access-stores-empty")?.textContent).toContain("2026-06-20 to 2026-09-18")
    expect(byTestId(container, "data-access-tables-not-computed")?.textContent).toContain("rds_query_logs")
    expect(byTestId(container, "data-access-store")).toBeNull()
  })

  it("08 partial with rows: shown as possibly incomplete, counted as a lower bound", async () => {
    use("08-partial-with-rows")
    const { container } = mount()
    await settled(container)
    expect(byTestId(container, "data-access-stores-partial")?.textContent).toContain("s3_access_logs")
    expect(byTestId(container, "data-access-store")).not.toBeNull()
    expect(byTestId(container, "data-plane-counts")?.textContent).toMatch(/^1\+ data store\(s\)/)
  })

  it("09 partial and empty: not established, and never rendered as zero", async () => {
    use("09-partial-empty")
    const { container } = mount()
    await settled(container)
    expect(byTestId(container, "data-access-stores-not-established")).not.toBeNull()
    expect(byTestId(container, "data-access-stores-empty")).toBeNull()
    expect(byTestId(container, "data-plane-counts")).toBeNull()
    expect(container.textContent).not.toMatch(/\b0\+? data store|No S3 data access observed/)
  })

  it.each([
    ["04-identity-unknown", "DECISION_IDENTITY_DATA_ACCESS_IDENTITY_NOT_FOUND"],
    ["05-out-of-scope", "DECISION_IDENTITY_DATA_ACCESS_SCOPE_MISMATCH"],
    ["06-lifecycle-refusal", "TENANT_LIFECYCLE_OFFBOARDED"],
  ] as const)("%s: a refusal is shown with its code, never as no access", async (name, code) => {
    use(name)
    const { container } = mount()
    await settled(container)
    expect(byTestId(container, "data-access-not-answered")?.textContent).toContain(code)
    expect(byTestId(container, "data-access-stores-empty")).toBeNull()
    expect(byTestId(container, "data-plane-counts")).toBeNull()
  })

  it("07: an unauthenticated backend is a load failure, never no access", async () => {
    use("07-unauthenticated-401")
    const { container } = mount()
    await settled(container)
    expect(byTestId(container, "data-access-load-error")?.textContent).toContain("IDENTITY_DATA_ACCESS_UNAUTHENTICATED")
  })

  it("a tampered answer is withheld whole: no bucket, no count, no provenance (mutation of body 01)", async () => {
    const tampered = mutatedCapture("01-ready-populated", (b) => { b.provenance.evidence_sources = ["Neo4j Aura"] })
    reply = () => tampered
    const { container } = mount()
    await settled(container)
    expect(byTestId(container, "data-access-withheld")?.textContent).toContain("IDENTITY_DATA_ACCESS_PROVENANCE_UNVERIFIED")
    expect(container.textContent).not.toContain("fixture-orders-archive")
    expect(container.textContent).not.toMatch(/neo4j|aura/i)
    expect(byTestId(container, "data-plane-counts")).toBeNull()
  })

  it("a stale generation is labelled stale (consistent mutation of body 01)", async () => {
    const stale = mutatedCapture("01-ready-populated", (b) => {
      b.result.serving_generation.freshness_status = "stale"
      b.result.serving_generation.age_seconds = 50000
      b.provenance.freshness.serving_graph.status = "stale"
      b.provenance.freshness.serving_graph.age_seconds = 50000
    })
    reply = () => stale
    const { container } = mount()
    await settled(container)
    expect(byTestId(container, "data-access-stale")).not.toBeNull()
    expect(byTestId(container, "data-access-provenance")?.textContent).not.toMatch(/·\s*fresh/)
  })

  it("asks nothing without the identity's ARN", async () => {
    const { container } = mount({})
    await settled(container)
    expect(byTestId(container, "data-access-load-error")?.textContent).toContain("IDENTITY_ARN_REQUIRED")
    expect(pageCalls).toEqual([])
    expect(sent).toEqual([])
  })

  it("offers no action from any captured ready answer", async () => {
    for (const name of ["01-ready-populated", "03-ready-table-not-computed", "08-partial-with-rows"] as const) {
      use(name)
      const { container, unmount } = mount()
      await settled(container)
      expect(byTestId(container, "data-access-store"), name).not.toBeNull()
      assertNoAction(container)
      unmount()
    }
  })
})

describe("Identities tab: the same answer, asked by the listed identity's ARN", () => {
  it("renders the captured answer in the Data Access tab and asks with nhi.arn", async () => {
    hostPage = (url) => {
      if (url.pathname === "/api/proxy/identities/nhi") {
        return Response.json([{
          name: ROLE_NAME, arn: ROLE_ARN, sub_type: "IAM Role", permissions_count: 0, unused_permissions_count: 0, gap_percentage: 0,
        }])
      }
      if (url.pathname === `/api/proxy/identities/detail/${ROLE_NAME}`) return Response.json({})
      return undefined
    }
    use("01-ready-populated")
    const { container, findByText } = render(<NHITab onRequestRemediation={() => {}} />)
    fireEvent.click(await findByText(ROLE_NAME))
    fireEvent.click(await findByText("Data Access"))
    await waitFor(() => expect(byTestId(container, "data-access-store")).not.toBeNull())
    expect(pageCalls).toContain(`/api/proxy/identities/data-access/${ROLE_NAME}?arn=${encodeURIComponent(ROLE_ARN)}`)
    expect(container.textContent).toContain("fixture-orders-archive")
    expect(byTestId(container, "data-access-table-inferred")).not.toBeNull()
  })
})
