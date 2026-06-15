/// <reference types="vitest/globals" />
//
// Visual Hierarchy Contract — acceptance criteria stubs.
//
// Pass 1 (PR #136) shipped C1 / C6 / C7. Pass 2 (this PR) lands the rest.
// These tests use unit-level helpers; DOM-level acceptance is owned by the
// Playwright spec at tests/integration/cloud-graph-hierarchy-live.spec.ts
// (added later in this PR).

import { describe, it, expect } from "vitest"
import {
  LAYOUT_ZONES,
  EDGE_ROUTING_TOKENS,
  CONTAINMENT_RULES,
  spineSequence,
  enforceContainmentOnModel,
  edgeRoutingClass,
  compareDeterminism,
} from "@/components/attack-paths-v2/cloud-graph-hierarchy"
import {
  classifyNodeSemantic,
  SEMANTIC_TOKENS,
} from "@/components/attack-paths-v2/cloud-graph-semantic"

describe("Visual Hierarchy Contract — module-level invariants", () => {
  it("LAYOUT_ZONES covers all 6 semantic classes", () => {
    expect(Object.keys(LAYOUT_ZONES).sort()).toEqual(
      ["CONTROL", "ENTRY", "IDENTITY", "JEWEL", "NETWORK", "OFF_SPINE"].sort(),
    )
  })

  it("EDGE_ROUTING_TOKENS spine carries width ≥ 2 and is animated", () => {
    expect(EDGE_ROUTING_TOKENS.spine.width).toBeGreaterThanOrEqual(2)
    expect(EDGE_ROUTING_TOKENS.spine.animated).toBe(true)
    expect(EDGE_ROUTING_TOKENS.spine.opacity).toBe(1.0)
  })

  it("EDGE_ROUTING_TOKENS infra ≤ 0.5 opacity (C6)", () => {
    expect(EDGE_ROUTING_TOKENS.infra.opacity).toBeLessThanOrEqual(0.5)
  })

  it("EDGE_ROUTING_TOKENS metadata invisible by default (C7)", () => {
    expect(EDGE_ROUTING_TOKENS.metadata.opacity).toBe(0)
  })

  it("CONTAINMENT_RULES every frame kind has hardBounds + labelInside", () => {
    for (const kind of ["cloud", "region", "vpc", "az", "subnet"] as const) {
      expect(CONTAINMENT_RULES[kind].hardBounds).toBe(true)
      expect(CONTAINMENT_RULES[kind].labelInside).toBe(true)
    }
  })

  it("SEMANTIC_TOKENS — red appears in EXACTLY one class (ENTRY)", () => {
    const isRedish = (color: string) =>
      /^#d9|^#dc|^#d83/i.test(color) || color.toLowerCase().includes("rgb(217")
    const classesWithRed: string[] = []
    for (const [name, token] of Object.entries(SEMANTIC_TOKENS)) {
      if (isRedish(token.border)) classesWithRed.push(name)
    }
    expect(classesWithRed).toEqual(["ENTRY"])
  })
})

describe("Visual Hierarchy Contract — classifier semantics", () => {
  it("FOOTHOLD badge always wins → ENTRY", () => {
    expect(
      classifyNodeSemantic({ cat: "compute", badge: "FOOTHOLD", onPath: true }),
    ).toBe("ENTRY")
  })

  it("CROWN JEWEL badge always wins → JEWEL", () => {
    expect(
      classifyNodeSemantic({ cat: "storage", badge: "CROWN JEWEL", onPath: true }),
    ).toBe("JEWEL")
  })

  it("Network conduit by title → NETWORK", () => {
    expect(
      classifyNodeSemantic({ cat: "network", title: "Internet Gateway", onPath: true }),
    ).toBe("NETWORK")
  })

  it("Network without conduit title → CONTROL", () => {
    expect(
      classifyNodeSemantic({ cat: "network", title: "alon-demo-app-sg", onPath: true }),
    ).toBe("CONTROL")
  })

  it("Sibling Lambda (on-path-flag-true but no FOOTHOLD badge) → OFF_SPINE", () => {
    expect(
      classifyNodeSemantic({ cat: "compute", title: "cyntro-decision-engine", onPath: true }),
    ).toBe("OFF_SPINE")
  })
})

describe("Visual Hierarchy Contract — edge routing class mapping", () => {
  it("path-style + path-layer → spine", () => {
    expect(
      edgeRoutingClass({
        id: "e",
        d: "",
        style: "path",
        color: "",
        layer: "path",
      } as Parameters<typeof edgeRoutingClass>[0]),
    ).toBe("spine")
  })

  it("encryption edge → infra", () => {
    expect(
      edgeRoutingClass({
        id: "e",
        d: "",
        style: "enc",
        color: "",
        layer: "ctx",
      } as Parameters<typeof edgeRoutingClass>[0]),
    ).toBe("infra")
  })

  it("private route → infra", () => {
    expect(
      edgeRoutingClass({
        id: "e",
        d: "",
        style: "priv",
        color: "",
        layer: "ctx",
      } as Parameters<typeof edgeRoutingClass>[0]),
    ).toBe("infra")
  })
})

describe("Visual Hierarchy Contract — spineSequence determinism", () => {
  it("returns empty array when report has no claims", () => {
    expect(
      spineSequence({
        report_id: "x",
        report_version: "1",
        compiler_version: "0",
        path_id: "p",
        current_state: { status: "OPEN_TODAY", source_label: "a", target_label: "b", summary: "" },
        claims: [],
        gates: {},
        attacker_steps: [],
        damage_matrix: [],
        gap: null,
        remediation_diff: null,
        safety_decision: null,
        verification_target: null,
        missing_evidence: [],
      }),
    ).toEqual([])
  })

  it("extracts claim source_refs in attacker_steps order, dedup-preserving", () => {
    const report = {
      report_id: "x",
      report_version: "1",
      compiler_version: "0",
      path_id: "p",
      current_state: { status: "OPEN_TODAY", source_label: "a", target_label: "b", summary: "" },
      claims: [
        { id: "c1", text: "", grade: "OBSERVED" as const, source_refs: [{ kind: "neo4j_node" as const, id: "n-user" }], can_drive_damage: true, can_drive_remediation: true },
        { id: "c2", text: "", grade: "OBSERVED" as const, source_refs: [{ kind: "neo4j_node" as const, id: "n-ec2" }], can_drive_damage: true, can_drive_remediation: true },
        { id: "c3", text: "", grade: "OBSERVED" as const, source_refs: [{ kind: "neo4j_node" as const, id: "n-jewel" }], can_drive_damage: true, can_drive_remediation: true },
      ],
      gates: {},
      attacker_steps: [
        { phase: "LAND_ON_FOOTHOLD" as const, title: "", body: "", claim_ids: ["c1"] },
        { phase: "BECOME_IDENTITY" as const, title: "", body: "", claim_ids: ["c2"] },
        { phase: "HIT_CROWN_JEWEL" as const, title: "", body: "", claim_ids: ["c3"] },
      ],
      damage_matrix: [],
      gap: null,
      remediation_diff: null,
      safety_decision: null,
      verification_target: null,
      missing_evidence: [],
    }
    expect(spineSequence(report)).toEqual(["n-user", "n-ec2", "n-jewel"])
  })

  it("deterministic — same input twice produces same output", () => {
    const report = {
      report_id: "x",
      report_version: "1",
      compiler_version: "0",
      path_id: "p",
      current_state: { status: "OPEN_TODAY", source_label: "a", target_label: "b", summary: "" },
      claims: [{ id: "c1", text: "", grade: "OBSERVED" as const, source_refs: [{ kind: "neo4j_node" as const, id: "n1" }], can_drive_damage: true, can_drive_remediation: true }],
      gates: {},
      attacker_steps: [{ phase: "LAND_ON_FOOTHOLD" as const, title: "", body: "", claim_ids: ["c1"] }],
      damage_matrix: [],
      gap: null,
      remediation_diff: null,
      safety_decision: null,
      verification_target: null,
      missing_evidence: [],
    }
    expect(spineSequence(report)).toEqual(spineSequence(report))
  })
})

describe("Visual Hierarchy Contract — pass-2 acceptance criteria (filled in as items land)", () => {
  // C2 — no overlapping resource cards (after intra-subnet placement fix)
  it.todo("C2: no two resource cards overlap on alon-prod canonical path")
  // C3 — subnet/container labels render INSIDE their frame, not floating
  it.todo("C3: every container frame label sits within the frame's bounding box")
  // C8 — spine sequence is monotonic on x-axis (anchoring pass)
  it.todo("C8: spineSequence(report) renders monotonically left-to-right on canvas")
  // C9 — layout deterministic across canvas-size changes
  it.todo("C9: compareDeterminism reports zero drift between modal and inline renders")
})
