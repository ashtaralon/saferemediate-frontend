/**
 * #511 — the Security Findings panel must not invent zeros or mistype findings.
 *
 * Production rendered 16 rows of "0 unused permissions - 0% confidence" beside a
 * card header reading "36 unused permissions out of 4...", because the mapper
 * emitted `unused_actions_count` while the card read `unusedCount`, and every
 * numeric fell through `||` to 0. `type` was dropped entirely, so S3, SG and
 * NACL findings all rendered as IAM unused-permission cards.
 *
 * The distinction these tests defend: a measured 0 and an unmeasured value are
 * different claims. On a security surface only one of them means "clean".
 */

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import {
  asCount,
  deriveFindingType,
  normalizeSecurityFinding,
  severityRank,
} from "@/lib/security-finding-normalize"
import { FindingCard } from "@/components/FindingCard"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// 1. `??` not `||` — a measured zero survives
// ---------------------------------------------------------------------------

describe("asCount", () => {
  it("keeps a real 0 and rejects only genuine absence", () => {
    // The whole defect in one assertion: `0 || fallback` loses the measurement.
    expect(asCount(0)).toBe(0)
    expect(asCount("0")).toBe(0)

    expect(asCount(null)).toBeNull()
    expect(asCount(undefined)).toBeNull()
    expect(asCount("")).toBeNull()
    expect(asCount("abc")).toBeNull()
    expect(asCount(NaN)).toBeNull()
  })
})

describe("normalizeSecurityFinding — counts", () => {
  it("carries a real gapCount through instead of zeroing it", () => {
    const n = normalizeSecurityFinding({
      resourceType: "IAMRole", resourceName: "alon-demo-ec2-role",
      finding_id: "f-1", gapCount: 36, allowedCount: 46, severity: "HIGH",
    })

    expect(n.unusedCount).toBe(36)
    expect(n.allowedCount).toBe(46)
    expect(n.type).toBe("iam_unused_permissions")
  })

  it("a measured zero stays 0; an absent count stays null", () => {
    const measured = normalizeSecurityFinding({
      resourceType: "IAMRole", resourceName: "r", finding_id: "f", gapCount: 0,
    })
    expect(measured.unusedCount).toBe(0)

    const absent = normalizeSecurityFinding({
      resourceType: "IAMRole", resourceName: "r", finding_id: "f",
    })
    expect(absent.unusedCount).toBeNull()
  })

  it("does not substitute an empty array's length for a count", () => {
    const n = normalizeSecurityFinding({
      resourceType: "IAMRole", resourceName: "r", finding_id: "f",
      unusedActions: [],
    })
    // `unusedActions.length || 0` used to turn "no list supplied" into 0.
    expect(n.unusedCount).toBeNull()
  })

  it("keeps confidence, including a real 0", () => {
    expect(normalizeSecurityFinding({ confidence: 87 }).confidence).toBe(87)
    expect(normalizeSecurityFinding({ confidence: 0 }).confidence).toBe(0)
    expect(normalizeSecurityFinding({}).confidence).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 2. Mixed finding types — nothing silently becomes IAM
// ---------------------------------------------------------------------------

describe("deriveFindingType", () => {
  it("does not default non-IAM resources to unused-permission", () => {
    expect(deriveFindingType({ resourceType: "S3Bucket" })).toBe("s3_exposure")
    expect(deriveFindingType({ resourceType: "SecurityGroup" })).toBe("sg_exposure")
    expect(deriveFindingType({ resourceType: "NetworkACL" })).toBe("nacl_overly_permissive")
  })

  it("an unrecognised resource is unknown, not IAM", () => {
    expect(deriveFindingType({ resourceType: "RDSInstance" })).toBe("unknown")
    expect(deriveFindingType({})).toBe("unknown")
  })

  it("an IAM row with no gap evidence is not an unused-permissions finding", () => {
    expect(deriveFindingType({ resourceType: "IAMRole" })).toBe("unknown")
    expect(deriveFindingType({ resourceType: "IAMRole", gapCount: 0 })).toBe(
      "iam_unused_permissions",
    )
  })

  it("honours an explicit backend type", () => {
    expect(deriveFindingType({ type: "admin_user_no_mfa" })).toBe("admin_user_no_mfa")
    expect(deriveFindingType({ type: "unused_permission" })).toBe("iam_unused_permissions")
    expect(deriveFindingType({ type: "something_new" })).toBe("unknown")
  })
})

// ---------------------------------------------------------------------------
// 3. Remediation is withheld without evidence
// ---------------------------------------------------------------------------

describe("normalizeSecurityFinding — remediability", () => {
  it("is remediable with a backend id and a measured count", () => {
    const n = normalizeSecurityFinding({
      resourceType: "IAMRole", resourceName: "r", finding_id: "f-1", gapCount: 12,
    })
    expect(n.isRemediable).toBe(true)
    expect(n.notRemediableReason).toBeNull()
  })

  it("is NOT remediable without a backend finding id", () => {
    const n = normalizeSecurityFinding({
      resourceType: "IAMRole", resourceName: "r", gapCount: 12,
    })
    expect(n.isRemediable).toBe(false)
    expect(n.notRemediableReason).toMatch(/finding id/i)
  })

  it("is NOT remediable when the count was never measured", () => {
    const n = normalizeSecurityFinding({
      resourceType: "IAMRole", resourceName: "r", finding_id: "f-1", gapCount: 5,
      type: "iam_unused_permissions",
    })
    expect(n.isRemediable).toBe(true)

    const unmeasured = normalizeSecurityFinding({
      type: "iam_unused_permissions", resourceName: "r", finding_id: "f-1",
    })
    expect(unmeasured.isRemediable).toBe(false)
    expect(unmeasured.notRemediableReason).toMatch(/not measured/i)
  })
})

// ---------------------------------------------------------------------------
// 4. CRITICAL sorts first
// ---------------------------------------------------------------------------

describe("severityRank", () => {
  it("ranks CRITICAL ahead of everything — the `|| 4` regression", () => {
    // `severityOrder[s] || 4` mapped CRITICAL(0) to 4, sorting it behind LOW.
    expect(severityRank("CRITICAL")).toBe(0)
    expect(severityRank("CRITICAL")).toBeLessThan(severityRank("LOW"))
    expect(severityRank("CRITICAL")).toBeLessThan(severityRank("MEDIUM"))
  })

  it("sorts a mixed list most-severe first", () => {
    const order = ["LOW", "CRITICAL", "MEDIUM", "HIGH", "WEIRD"]
      .sort((a, b) => severityRank(a) - severityRank(b))
    expect(order).toEqual(["CRITICAL", "HIGH", "MEDIUM", "LOW", "WEIRD"])
  })

  it("an unknown severity ranks last, not first", () => {
    expect(severityRank(undefined)).toBe(4)
    expect(severityRank("NOPE")).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// 5. Component level — what the operator actually reads
// ---------------------------------------------------------------------------

/** The evidence lives in the collapsed CardContent; open it first. */
function renderExpanded(finding: unknown) {
  const out = render(<FindingCard finding={finding as never} />)
  fireEvent.click(screen.getByRole("button", { name: /expand finding details/i }))
  return out
}

describe("FindingCard — missing evidence renders unknown, never zero", () => {
  it("renders a real count", () => {
    const finding = normalizeSecurityFinding({
      resourceType: "IAMRole", resourceName: "alon-demo-ec2-role",
      finding_id: "f-1", gapCount: 36, allowedCount: 46, severity: "HIGH",
    })
    renderExpanded(finding)

    expect(screen.getByTestId("unused-count").textContent).toBe("36")
  })

  it("renders 'unknown' — not 0 — when the count was never measured", () => {
    const finding = normalizeSecurityFinding({
      type: "iam_unused_permissions", resourceType: "IAMRole",
      resourceName: "r", finding_id: "f-1",
    })
    renderExpanded(finding)

    const cell = screen.getByTestId("unused-count")
    expect(cell.textContent).toBe("unknown")
    expect(cell.textContent).not.toBe("0")
  })

  it("a measured zero still renders 0 — it is a real result", () => {
    const finding = normalizeSecurityFinding({
      resourceType: "IAMRole", resourceName: "r", finding_id: "f-1", gapCount: 0,
    })
    renderExpanded(finding)

    expect(screen.getByTestId("unused-count").textContent).toBe("0")
  })

  it("a non-IAM finding does not render IAM unused-permission wording", () => {
    const finding = normalizeSecurityFinding({
      resourceType: "S3Bucket", resourceName: "alon-demo-data-bucket",
      finding_id: "f-2", severity: "CRITICAL",
    })
    // Rendered collapsed on purpose: this asserts an ABSENCE, and the default
    // card (which non-IAM findings fall to) has its own toggle markup.
    render(<FindingCard finding={finding as never} />)

    // The IAM branch's dedicated count cell must not appear at all.
    expect(screen.queryByTestId("unused-count")).toBeNull()
    expect(screen.queryByText(/unused permissions/i)).toBeNull()
  })

  it("withholds Simulate when there is nothing to simulate against", () => {
    const finding = normalizeSecurityFinding({
      resourceType: "IAMRole", resourceName: "r", gapCount: 5, // no finding_id
    })
    expect(finding.isRemediable).toBe(false)

    renderExpanded(finding)
    const button = screen.getByRole("button", { name: /simulate/i })
    expect(button).toHaveProperty("disabled", true)
  })
})


describe("FindingCard — an untyped finding must not be assumed IAM", () => {
  it("a finding with NO type does not render the IAM unused-permission card", () => {
    // Not everything reaches the card through the normalizer: a cached payload
    // or a legacy caller can arrive without `type`. The card used to read
    // `(finding as any).type || "unused_permission"`, so an untyped S3 finding
    // rendered IAM wording, an IAM count cell, and an IAM Simulate action.
    const untyped = {
      id: "arn:aws:s3:::alon-demo-data-bucket",
      finding_id: "f-legacy",
      title: "S3Bucket: alon-demo-data-bucket",
      severity: "CRITICAL",
      description: "Bucket policy allows public read",
      resource: "alon-demo-data-bucket",
      resourceType: "S3Bucket",
      category: "S3Bucket",
      discoveredAt: "2026-08-01T00:00:00Z",
      status: "open",
    }

    render(<FindingCard finding={untyped as never} />)

    expect(screen.queryByTestId("unused-count")).toBeNull()
    expect(screen.queryByText(/unused permissions/i)).toBeNull()
    // The real S3 description must survive, not be replaced by IAM copy.
    expect(screen.getByText(/Bucket policy allows public read/i)).toBeTruthy()
  })
})
