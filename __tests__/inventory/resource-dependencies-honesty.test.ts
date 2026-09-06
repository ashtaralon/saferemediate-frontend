import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// The Dependencies tab is the plan's first customer checkpoint, and every
// property below is one that, if it broke, would make the tab read as a
// stronger claim than the evidence supports. These are source assertions
// rather than render tests on purpose: each one pins a contract between the
// tab and the bounded backend projection, and a render test would pass just as
// happily against a tab wired to a different endpoint.

const ROOT = join(__dirname, "..", "..")
const read = (path: string) => readFileSync(join(ROOT, path), "utf8")

const DOSSIER = read("components/inventory/resource-dossier.tsx")
const HOOK = read("components/inventory/use-resource-dependencies.ts")
const PROXY = read("app/api/proxy/resource-dependencies/[systemName]/route.ts")

describe("Dependencies tab reads the bounded, resource-anchored projection", () => {
  it("calls the per-resource endpoint, not a system-wide graph scan", () => {
    expect(HOOK).toContain("/api/proxy/resource-dependencies/")
    expect(HOOK).toContain("resource_id")
    // dependency-map* answers a different question: a system-wide graph in
    // which security groups and IAM roles are badges rather than resources.
    expect(HOOK).not.toContain("/api/proxy/dependency-map")
  })

  it("has a proxy route, because the browser never calls the backend directly", () => {
    expect(PROXY).toContain("getBackendBaseUrl")
    expect(PROXY).toContain("/api/resource-dependencies/")
  })

  it("forwards only declared query parameters", () => {
    // A blanket search passthrough would let an unknown filter reach the
    // backend and be ignored, so the URL would claim a narrowing the answer
    // does not apply.
    expect(PROXY).toContain("const FORWARDED")
    for (const param of [
      "resource_id",
      "account_id",
      "perspective",
      "mechanism",
      "basis",
      "include_stale",
      "cursor",
      "page_size",
    ]) {
      expect(PROXY).toContain(`"${param}"`)
    }
  })

  it("preserves the backend status rather than collapsing every failure to 500", () => {
    // 409 is a moved generation and 404 is an unresolved resource; the tab
    // renders those differently from a backend fault.
    expect(PROXY).toContain("status: response.status")
  })
})

describe("the tab never turns absence into a negative claim", () => {
  it("says an empty result is not proof that dependencies do not exist", () => {
    expect(DOSSIER).toContain(
      "This is not proof that dependencies do not exist",
    )
  })

  it("uses the plan's collected-scope wording rather than a completeness claim", () => {
    expect(DOSSIER).toContain("Known dependencies within collected scope")
  })

  it("renders a read failure as a failure, never as an empty dependency list", () => {
    expect(DOSSIER).toContain("Dependencies could not be read")
  })

  it("makes no prediction or decision claim in the tab", () => {
    const tab = DOSSIER.slice(
      DOSSIER.indexOf('{tab === "dependencies" ?'),
      DOSSIER.indexOf('{data && tab === "evidence" ?'),
    )
    expect(tab.length).toBeGreaterThan(0)
    for (const forbidden of ["will break", "safe to remove", "predicted", "recommend"]) {
      expect(tab.toLowerCase()).not.toContain(forbidden)
    }
  })
})

describe("counts and paging state what they are", () => {
  it("shows loaded-of-total rather than a bare number", () => {
    // A page count presented as the resource's dependency count understates it.
    expect(DOSSIER).toContain("Showing {bounded.rows.length} of {bounded.data.page.total}")
  })

  it("offers explicit paging instead of silently truncating a large set", () => {
    expect(DOSSIER).toContain("Load more")
    expect(HOOK).toContain("next_cursor")
  })

  it("says when a list is complete for its generation", () => {
    expect(DOSSIER).toContain("Complete for this generation")
  })
})

describe("perspective, provenance and scope survive to the screen", () => {
  it("renders Uses and Used by as separate sections", () => {
    expect(DOSSIER).toContain('"USES"')
    expect(DOSSIER).toContain('"USED_BY"')
    expect(DOSSIER).toContain('"Uses"')
    expect(DOSSIER).toContain('"Used by"')
  })

  it("labels a derived row as derived so it cannot read as direct attachment", () => {
    expect(DOSSIER).toContain("Derived — not a direct attachment")
  })

  it("shows the projection generation the rows came from", () => {
    expect(DOSSIER).toContain("bounded.data.scope.generation")
  })

  it("surfaces coverage state and the sources that are missing", () => {
    expect(DOSSIER).toContain("bounded.data.coverage.missing_sources")
  })

  it("keeps the evidence drawer on every fact", () => {
    expect(DOSSIER).toContain("EvidenceRefList")
    expect(DOSSIER).toContain("fact.evidence_refs")
  })
})

describe("a moved generation is distinguished from a failure", () => {
  it("has its own state rather than being reported as an error", () => {
    expect(HOOK).toContain("generationMoved")
    expect(HOOK).toContain("response.status === 409")
    expect(DOSSIER).toContain("The projection advanced while this list was paging")
  })

  it("does not stitch pages across generations", () => {
    // The reload resets the cursor rather than continuing from a token minted
    // against a generation that no longer exists.
    expect(HOOK).toContain("setCursor(null)")
  })
})

describe("no mock data anywhere in the new path", () => {
  it("ships no fixture, sample or placeholder rows", () => {
    for (const source of [DOSSIER, HOOK, PROXY]) {
      expect(source).not.toMatch(/MOCK_MODE/i)
      expect(source).not.toMatch(/\bsampleRows\b|\bfakeRows\b|\bplaceholderRows\b/i)
    }
  })

  it("does not fall back to the dossier ledger when the projection fails", () => {
    // Two datasets under one heading would show different numbers for the same
    // resource depending on which one answered.
    const tab = DOSSIER.slice(
      DOSSIER.indexOf('{tab === "dependencies" ?'),
      DOSSIER.indexOf('{data && tab === "evidence" ?'),
    )
    expect(tab).not.toContain("grouped[basis]")
  })
})
