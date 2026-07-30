/**
 * The WIRING, not the helper.
 *
 * PR #466 shipped 9 green, mutation-checked tests for `attachNetworkPosture` and
 * still did not fix the bug, because every one of them tested the helper in
 * isolation while the defect was that no caller invoked it on this path. The
 * renderer therefore fell through to `?? true` and production kept rendering
 * `data-network-banner-reason=null`.
 *
 * Deleting the caller's call is invisible to helper tests — confirmed by
 * reverting `architectureWithPosture` to `architecture` and watching all 14 pass.
 * So the wiring gets its own assertion, in the same source-reading style the repo
 * already uses for contracts that cannot be unit-mounted.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = join(__dirname, "..", "..")
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")

/** Source with comments removed.
 *
 * An assertion about user-visible COPY must not be satisfied — or broken — by an
 * explanatory comment. My first version of the two claim guards below failed
 * against my own comment saying `Never "IAM is the only gate"`, which is the
 * same trap as a test matching a docstring instead of the code it describes. */
const readCode = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")

const LANE_MAP = "components/attack-paths-v2/attack-path-lane-flow-map.tsx"
const TFM = "components/dependency-map/traffic-flow-map.tsx"
const FAN_IN = "components/attack-paths-v2/zoom0-fan-in-panel.tsx"

describe("network-posture wiring", () => {
  it("the attacker map passes a posture-bearing architecture, not the raw one", () => {
    const src = read(LANE_MAP)
    expect(src).toContain("attachLoadStatePosture")
    // The exact regression: handing TFM the untouched architecture.
    expect(src).toMatch(/architectureOverride=\{architectureWithPosture \?\? undefined\}/)
    expect(src).not.toMatch(/architectureOverride=\{architecture \?\? undefined\}/)
  })

  it("the posture is derived from the same signal that drives the partial chip", () => {
    // If these ever diverge, the banner and the "Partial view" chip would
    // disagree about whether the topology has finished loading.
    const src = read(LANE_MAP)
    expect(src).toMatch(/attachLoadStatePosture\(\s*architecture,\s*architectureLoading/)
    expect(src).toContain("Partial view")
  })

  it("the shared architecture memo still attaches posture for path-DTO views", () => {
    const src = read(TFM)
    expect(src).toContain("attachNetworkPosture(arch, spotlightPaths")
  })

  it("the renderer surfaces the reason, so a missing posture is visible", () => {
    // data-network-banner-reason is the only external signal that a posture was
    // actually supplied. It is how the #466 gap was caught at all.
    const src = read(TFM)
    expect(src).toContain("data-network-banner-reason")
    expect(src).toContain("Hop detail:")
  })

  it("only the verified state is styled as a finding", () => {
    const src = read(TFM)
    expect(src).toContain("Network Posture Not Verified")
    expect(src).toContain("No Network Checkpoints Represented")
    // ShieldOff is the amber alarm; it must be gated on isFinding, which the
    // resolver sets ONLY for verified-non-vpc. An observation about our own
    // projection is not a security finding.
    expect(src).toMatch(/state\.isFinding \?\s*\(\s*<ShieldOff/)
    expect(src).toMatch(/state\.isFinding\s*\?\s*"border-amber/)
  })

  it("the banner never claims IAM is the only gate", () => {
    // Wrong even where network genuinely does not apply: resource policy, KMS
    // key policy and IAM conditions gate the same reach. Naming only IAM
    // understates the control surface. Shipped in #467; removed here.
    expect(readCode(TFM)).not.toContain("IAM is the only gate")
  })

  it("the banner never asserts network defenses do not apply from absence", () => {
    // The original #465 defect. The only permitted form of this claim is the
    // verified-non-vpc branch, which requires an explicit server verdict.
    const code = readCode(TFM)
    // Exactly two in rendered copy: the verified headline and its evidence-cited
    // prose. Both live behind the verified-non-vpc branch.
    expect(code.split("do not apply").length - 1).toBe(2)
    expect(code).toContain("resolveNetworkBannerState")
  })

  it("the state decision is delegated, not inlined", () => {
    // It has overclaimed three times; the decision belongs in a tested module.
    const src = read(TFM)
    expect(src).toContain('from "@/lib/attack-paths/network-banner-state"')
    expect(src).toMatch(/data-network-banner=\{state\.kind\}/)
    expect(src).toMatch(/data-network-banner-reason=\{state\.reason\}/)
  })

  // ── composed feasibility verdict (the "configured chain ≠ attack path" fix) ──

  it("the fan-in composes and RENDERS a feasibility verdict", () => {
    // A tested composer nothing calls is the #466 mistake. Assert the wiring.
    const src = read(FAN_IN)
    expect(src).toContain("composePathVerdict")
    expect(src).toMatch(/data-testid="zoom0-path-verdict"/)
    expect(src).toMatch(/data-path-feasibility=\{pathVerdict\.feasibility\}/)
  })

  it("the specific route verdict is passed, not just the coarse gate", () => {
    // route_gate=OPEN_CONFIG must not be the only routing signal supplied.
    const code = readCode(FAN_IN)
    expect(code).toContain("extractRouteVerdictToken(verdictPath.route_verdict)")
    expect(code).toContain("routeGate:")
  })

  it("all three checkpoints reach the DOM with their state", () => {
    const src = read(FAN_IN)
    expect(src).toMatch(/data-checkpoint=\{c\.key\}/)
    expect(src).toMatch(/data-checkpoint-state=\{c\.state\}/)
  })

  it("the verdict is only amber when the composer says it is a finding", () => {
    const code = readCode(FAN_IN)
    expect(code).toMatch(/pathVerdict\.isFinding\s*\?\s*\n?\s*"border-amber/)
  })

  it("an uncomposed path is never called an attack path", () => {
    // Vocabulary discipline: candidate / configured access chain until composed.
    const code = readCode(FAN_IN)
    expect(code).toContain("Candidate path")
    expect(code).toContain("not proven reachable")
  })

  // ── edge direction + line occlusion ──────────────────────────────────────

  it("edges carry an arrowhead so direction is unambiguous", () => {
    // There was NO marker anywhere in this component before: every edge was
    // undirected, so role->S3 and S3->role rendered identically.
    const code = readCode(TFM)
    expect(code).toContain("<marker")
    expect(code).toMatch(/markerEnd=\{renderMode === 'lines' \? `url\(#\$\{ARROW_MARKER_ID\}\)`/)
  })

  it("the arrowhead is drawn only on the lines pass", () => {
    // The labels pass repaints the same geometry; two markers doubles the head.
    expect(readCode(TFM)).toContain("renderMode === 'lines' ?")
  })

  it("the arrowhead inherits each edge's own stroke colour", () => {
    // One def for every palette entry — plane colours, attack red, lateral grey.
    expect(readCode(TFM)).toContain('fill="context-stroke"')
  })

  it("the network banner is OPAQUE so edges cannot show through the prose", () => {
    // The banner was already above the lines layer in stacking order; both
    // variants were ~5-20% alpha, so the edge beneath showed through the text.
    const code = readCode(TFM)
    expect(code).toMatch(/border-dashed bg-card/)
    expect(code).not.toContain('border-border bg-muted/20"')
  })
})
