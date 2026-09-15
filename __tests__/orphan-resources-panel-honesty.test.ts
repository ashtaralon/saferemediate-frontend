import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import {
  anyActionSupported,
  readSupportedFamilies,
  SCOPE_NOTE,
} from "@/lib/orphan-availability"

/**
 * Source-level invariants for the orphan panel.
 *
 * These read the component rather than render it on purpose. The rules they
 * hold are about what the page DOES NOT do — it issues no request, it renders
 * no control it cannot honour, and it contains no path that could format a
 * legacy classifier's status, severity, recommendation or safe_to_delete into
 * a claim. A render test can only observe the states it thinks to construct;
 * reading the source catches the re-introduction of a fetch, a button or a
 * findings table directly.
 */
// Vitest runs from the project root (see vitest.config.ts); the same is
// true of any plain-node harness invoked there.
const ROOT = process.cwd()
const PANEL = path.join(ROOT, "components", "orphan-resources-panel.tsx")
const PAGE = path.join(ROOT, "app", "orphan-resources", "page.tsx")

const panelSource = readFileSync(PANEL, "utf8")
const pageSource = readFileSync(PAGE, "utf8")

/**
 * The source with comments removed. Prose about a thing is not the thing: the
 * header explains at length why the findings and the controls are absent, and
 * a blunt grep would fail on the explanation itself.
 */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
}

const panelCode = code(panelSource)
const pageCode = code(pageSource)

/** Every string literal handed to fetch(...). */
function fetchTargets(source: string): string[] {
  const out: string[] = []
  const re = /fetch\(\s*(["'`])([^"'`]+)\1/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) out.push(m[2])
  return out
}

describe("the page asks nothing at all", () => {
  it("has zero fetch targets", () => {
    expect(fetchTargets(panelCode)).toEqual([])
    expect(fetchTargets(pageCode)).toEqual([])
  })

  it("issues no orphan-detection request for any family", () => {
    for (const source of [panelCode, pageCode]) {
      expect(source).not.toContain("orphan-detection")
      expect(source).not.toContain("/api/proxy/")
    }
  })

  it("agrees with the contract, which supports no read", () => {
    expect(readSupportedFamilies()).toEqual([])
  })
})

describe("no path exists that could render a legacy verdict", () => {
  it("names no decision field the classifier produces", () => {
    // status/severity/recommendation/safe_to_delete/confidence are all outputs
    // of determine_status_and_severity. None of them may appear in a rendering
    // path, not even a dormant one.
    for (const field of [
      "recommendation",
      "safe_to_delete",
      "severity",
      "confidence",
      "orphan_count",
      "unused_count",
      "observedSgState",
    ]) {
      expect(panelCode, `panel must not reference ${field}`).not.toContain(field)
    }
  })

  it("defines no findings table and no finding type", () => {
    for (const symbol of [
      "SGTable",
      "IAMRoleTable",
      "S3Table",
      "PolicyTable",
      "SGFinding",
      "findings.map",
      "EmptyState",
    ]) {
      expect(panelCode, `panel must not define ${symbol}`).not.toContain(symbol)
    }
  })

  it("prints no count, because no total here is ours to print", () => {
    for (const label of [">Orphan<", ">Stale<", ">Unused<", ">Excluded<", "total:"]) {
      expect(panelCode, `panel must not render ${label}`).not.toContain(label)
    }
  })
})

describe("no dead control is rendered while every action capability is false", () => {
  it("keeps every HTTP action capability false", () => {
    expect(anyActionSupported()).toBe(false)
  })

  it("defines no ActionButtons, row-status control or override modal", () => {
    expect(panelCode).not.toContain("function ActionButtons")
    expect(panelCode).not.toContain("function RowStatusPill")
    expect(panelCode).not.toContain("Quarantine")
    expect(panelCode).not.toContain("Trash2")
    expect(panelCode).not.toContain("Pause")
    expect(panelCode).not.toContain("OverrideModalShared")
  })

  it("issues no quarantine or delete request", () => {
    // The word "quarantine" is allowed in the visible copy — the Not-available
    // state names who owns the capability. A quarantine PATH is not.
    expect(panelCode).not.toContain('method: "DELETE"')
    for (const route of ["quarantine/pre-check", "quarantine/execute", "/api/quarantine"]) {
      expect(panelCode, `must not name ${route}`).not.toContain(route)
    }
  })

  it("shows the read-only banner from the capability matrix, not a literal", () => {
    expect(panelCode).toContain("!anyActionSupported()")
    expect(panelCode).toContain("ACTION_UNAVAILABLE_NOTE")
  })
})

describe("every family renders as not available, from the declared reason", () => {
  it("reads each family's reason from the contract", () => {
    for (const family of ["iam_role", "s3_bucket", "iam_policy", "security_group"]) {
      expect(panelCode, `panel must declare ${family}`).toContain(`declaredUnavailable("${family}")`)
    }
  })

  it("renders the Not available state and nothing else for a family tab", () => {
    expect(panelCode).toContain("<UnavailableState detail={unavailable[activeTab]} />")
    expect(panelCode).toContain("function UnavailableState")
  })
})

describe("the visible scope copy does not claim account-wide", () => {
  it("makes no account-wide claim in anything the page renders", () => {
    for (const [name, source] of [["panel", panelCode], ["page", pageCode]] as const) {
      expect(source.toLowerCase(), `${name}: no account-wide claim`).not.toContain("account-wide")
      expect(source.toLowerCase(), `${name}: no account wide claim`).not.toContain("account wide")
    }
  })

  it("states the scope from the capability module, not a literal", () => {
    expect(panelCode).toContain("SCOPE_NOTE")
    expect(SCOPE_NOTE.toLowerCase()).not.toContain("account-wide")
    expect(SCOPE_NOTE).toContain("deployment scope")
  })
})
