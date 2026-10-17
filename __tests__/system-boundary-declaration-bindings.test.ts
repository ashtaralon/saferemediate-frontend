/**
 * A7 rev 4 C-B: the declaration builder with stacks and per-resource decisions (lib/system-boundary-declaration.ts).
 *
 * WRITTEN 2026-10-08 UNDER ALON'S BUILD-NOW RULE: NOT EXECUTED.
 */
import { describe, expect, it } from "vitest"
import type { DeclarationsView, ResourceDecision, StackBinding } from "@/lib/system-boundary-authoring"
import { buildDeclaration, type DraftDeclaration } from "@/lib/system-boundary-declaration"

const ACCOUNT = "111111111111"
const STACK = `arn:aws:cloudformation:eu-west-1:${ACCOUNT}:stack/shop/0f0f0f0f-1111-4222-8333-444455556666`

const LIMITS = {
  max_roots: 36, max_new_cells: 10, max_write_accounts: 10, max_move_targets: 4, max_display_name: 120,
  max_environment_raw: 64, max_resource_uid: 1024, criticalities: ["LOW"], environments: ["PRODUCTION"],
  max_bindings: 50, max_resource_decisions: 200, max_actions: 100, binding_kinds: ["exclusive", "several_systems",
  "shared_foundation"], decision_verdicts: ["include", "exclude"], save_envelope_level: 2,
}

function view(limits: Partial<typeof LIMITS> = {}): DeclarationsView {
  return { completed_revision: 3, source: "SNAPSHOT", protocol_phase: "ACTIVE", systems: [], deployments: [], roots: [],
           stack_bindings: [], resource_decisions: [], limits: { ...LIMITS, ...limits } }
}

function binding(stackId = STACK, kind: StackBinding["kind"] = "exclusive"): StackBinding {
  return { account_id: ACCOUNT, region: "eu-west-1", stack_id: stackId, kind,
           selection: { census: { generation: 3, source_identity: "v1:x" }, stack_status: "CREATE_COMPLETE" } }
}

function decision(uid: string, verdict: ResourceDecision["verdict"] = "include"): ResourceDecision {
  return { account_id: ACCOUNT, region: "eu-west-1", resource_uid: uid, verdict,
           selection: { row_key: uid, stack_id: STACK, census: { generation: 3 } } }
}

function draft(over: Partial<DraftDeclaration> = {}): DraftDeclaration {
  return { roots: [], system: { mode: "new", displayName: "Payments", criticality: null },
           deployment: { mode: "new", deploymentKey: "prod", environment: "PRODUCTION", environmentRaw: "" },
           stacks: [{ binding: binding(), label: "shop" }], decisions: [], ...over }
}

describe("a declaration with stacks", () => {
  it("binds stacks with no root, covers their cells, and sends the new lists only when present", () => {
    const built = buildDeclaration(draft({ decisions: [{ decision: decision("uid:1"), label: "web" }] }), view())
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.declaration.roots).toEqual([])
    expect(built.declaration.bindings).toEqual([binding()])
    expect(built.declaration.resource_decisions).toEqual([decision("uid:1")])
    expect(built.declaration.deployment).toMatchObject({ mode: "new", scopes: [{ account_id: ACCOUNT, region: "eu-west-1" }] })
    const plain = buildDeclaration(draft({ stacks: [], decisions: [] }), view())
    expect(plain.ok ? [] : plain.problems).toEqual(["Pick at least one resource as a root, or bind a stack."])
  })

  it("refuses locally what the served limits rule out", () => {
    const tooMany = buildDeclaration(draft({ stacks: [1, 2, 3].map((n) => ({
      binding: binding(STACK.replace("444455556666", `00000000000${n}`)), label: String(n) })) }), view({ max_bindings: 2 }))
    expect(tooMany.ok ? [] : tooMany.problems).toContain("Bind at most 2 stacks in one save.")
    const big = buildDeclaration(draft({ decisions: Array.from({ length: 45 }, (_, n) => ({ decision: decision(`uid:${n}`),
      label: String(n) })) }), view())
    expect(big.ok ? [] : big.problems).toContain(
      "This save is too large for one transaction; save the stacks first, then the per-resource decisions.")
    const old = buildDeclaration(draft(), view({ save_envelope_level: undefined, max_bindings: undefined }))
    expect(old.ok ? [] : old.problems).toEqual(["This installation does not take stack bindings or per-resource decisions."])
    const twice = buildDeclaration(draft({ stacks: [{ binding: binding(), label: "a" }, { binding: binding(), label: "b" }] }), view())
    expect(twice.ok ? [] : twice.problems).toContain("A stack is chosen twice.")
  })

  it("leaves a roots-only declaration exactly as it always was", () => {
    const rootsOnly = buildDeclaration({ ...draft(), stacks: undefined, decisions: undefined }, view())
    expect(rootsOnly.ok ? [] : rootsOnly.problems).toEqual(["Pick at least one resource as a root."])
  })
})

describe("S1b (SW-S1B-20261013-02): the save level is read as exactly 2 or 3, and the single shape is unchanged at 3", () => {
  it("builds the SAME single-Deployment declaration at level 2 and level 3 -- never `deployments`", () => {
    const two = buildDeclaration(draft({ decisions: [{ decision: decision("uid:1"), label: "web" }] }), view({ save_envelope_level: 2 }))
    const three = buildDeclaration(draft({ decisions: [{ decision: decision("uid:1"), label: "web" }] }), view({ save_envelope_level: 3 }))
    expect(two.ok && three.ok).toBe(true)
    if (!two.ok || !three.ok) return
    expect(JSON.stringify(three.declaration)).toBe(JSON.stringify(two.declaration))
    expect(Object.keys(three.declaration)).not.toContain("deployments")
    expect(three.declaration.deployment).toMatchObject({ mode: "new", deployment_key: "prod" })
  })

  it("refuses stacks and decisions against any other level, older, newer or unknown", () => {
    for (const level of [1, 4, 99, undefined]) {
      const built = buildDeclaration(draft(), view({ save_envelope_level: level }))
      expect(built.ok ? [] : built.problems, String(level)).toEqual(["This installation does not take stack bindings or per-resource decisions."])
    }
  })
})
