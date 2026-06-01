# Canvas v3 — Route-Precedence Visualization PRD

**Status:** Spec — not yet implemented. Three-slice ship plan + backend support. Ships behind `?canvas=v3` flag until promoted.

**Origin:** PR #93 shipped a route-precedence chip (`via VPCE · private` / `via IGW · public`) on destination resource cards, derived from `(Subnet)-[:ROUTES_VIA]->(Gateway)` edges and AWS most-specific-prefix rule. Post-ship designer-lens review (2026-06-01) flagged that the chip carries the right *data* but the canvas *geometry* doesn't reinforce it — the role→bucket edge curves through empty space, the gateway sits in its lane as decoration, the security claim ("stays on AWS backbone" vs "crosses public internet") has no visual home. This spec lifts the answer from a single chip to the geometric language of the canvas.

**Memory anchors:**
- [`pattern_geometry_must_match_label`](../../../.claude/projects/-Users-admin-Documents-Eltro/memory/pattern_geometry_must_match_label.md) — labels reinforce geometry, never substitute
- [`pattern_visualize_by_negation`](../../../.claude/projects/-Users-admin-Documents-Eltro/memory/pattern_visualize_by_negation.md) — render the unused alternative grayed, the gap IS the signal
- [`pattern_partition_boundaries_carry_security_state`](../../../.claude/projects/-Users-admin-Documents-Eltro/memory/pattern_partition_boundaries_carry_security_state.md) — boundary lines are the visual home of security claims
- [`pattern_render_the_answer_not_the_inventory`](../../../.claude/projects/-Users-admin-Documents-Eltro/memory/pattern_render_the_answer_not_the_inventory.md) — parent framing
- [`pattern_prd_anchored_on_empirical_data`](../../../.claude/projects/-Users-admin-Documents-Eltro/memory/pattern_prd_anchored_on_empirical_data.md) — every matrix row backed by a real path

---

## 1. The contract — one question, answered geometrically

The Per-Path Flow Map must answer one question at a glance, in every path scenario, **without the operator reading text**:

> *"Does this traffic stay on AWS backbone, or cross the public internet?"*

That contract drives five load-bearing geometric requirements:

| # | Requirement | Why it's load-bearing |
|---|---|---|
| 1 | Data-flow edge passes through the actual resolved egress gateway (VPCE or IGW) | Without this, the gateway is decoration; operator can't see the route |
| 2 | Internet partition boundary always present on the canvas, labeled `AWS Backbone (private)` vs `Public Internet` | Without this, "stays in AWS" vs "crosses internet" has no visual home |
| 3 | Edge that crosses the Internet boundary is visually distinguished (color, stroke, warning chip) | Without this, both look identical regardless of geometry |
| 4 | Unused egress alternatives are visible-by-negation (grayed IGW when VPCE wins; grayed VPCE when IGW wins) | Makes the security state palpable — operator sees what was NOT taken |
| 5 | Route-resolution chip anchored on edge midpoint, text matches gateway + partition | Reinforces the geometry, doesn't replace it |

## 2. Goals / Non-goals

**Goals:**
- Operator reads route-precedence (private vs public) from canvas geometry alone in ≤2 seconds, no text reading required
- Every UI claim ("via VPCE", "stays private", "crosses internet") has matching geometry — no phantom labels
- Unused alternatives (the IGW when VPCE wins) remain visible but visibly demoted — security narrative made geometric
- Backend route-precedence data already in graph (`ROUTES_VIA` edges) drives the rendering; no inference, no fallback

**Non-goals:**
- Not extending to Attacker View V2 mode (`mode=attacker_v2`) — that's a different renderer; this spec is for Per-Path Flow Map (`mode=attack-path`)
- Not changing the destination card itself — only its lane position + the chip's location
- Not adding new backend collectors — the only backend change is surfacing existing `ROUTES_VIA` edge data on the `CanvasEdge` contract
- Not handling Phase / Topology / Exposure tab visualizations in this spec

## 3. Verification matrix — 7 edge-case scenarios

Every row requires a reproducible path + DOM probe + screenshot. Reproducibility is checked empirically against alon-prod; rows that don't reproduce there are marked **needs synthetic** and gated by a Prerequisite section below.

| # | Scenario | Reproducible on alon-prod? | Expected geometry | Verification |
|---|---|---|---|---|
| EC1 | EC2 → S3 via VPCE | ✅ 3 subnet routes (`target_service: com.amazonaws.eu-west-1.s3`) | Edge through VPCE node, stays on AWS Backbone side; grayed IGW present; chip `via VPCE · private` on edge midpoint | DOM probe `data-route-precedence-via="private"`, `data-crosses-internet="false"`, screenshot |
| EC2 | EC2 → S3 via IGW (no matching VPCE on path) | ✅ 6 subnets with IGW default but no VPCE for `s3` prefix-list | Edge through IGW node, crosses Internet partition; warning chip + rose stroke; chip `via IGW · public` on edge midpoint | DOM probe `data-crosses-internet="true"`, `data-edge-warning="public-egress"`, screenshot |
| EC3 | Identity-only path (root → bucket 2-hop) | ✅ (verified during PR #93 local-dev) | No egress gateway on path → no chip, no Internet crossing; direct role→bucket edge with no waypoint | DOM probe `data-route-precedence-via` absent, screenshot showing canonical no-gateway layout |
| EC4 | Orphan VPCE (in VPC, no route table points at it) | ❌ 0 in alon-prod — **needs synthetic data** | VPCE rendered grayed in EGRESS GATEWAYS lane with annotation `Not used — no RT entry`; falls through to IGW; edge crosses Internet partition | DOM probe `data-vpce-orphan="true"` + warning chip on edge |
| EC5 | Cross-region S3 (bucket in non-eu-west-1) | ❌ 0 in alon-prod — **needs synthetic data** | VPCE route doesn't match cross-region prefix; falls through to IGW; edge crosses Internet partition | DOM probe + screenshot showing public-route disposition despite VPCE present |
| EC6 | Multi-destination workload (>1 jewel) | ✅ cyntro-demo-batch-processor reaches both prod-data + analytics buckets (visible in path-list — Cypher traversal needs careful direction handling) | Two edges from the same workload, each through its own resolved gateway; chips render per edge; partition crossings per edge | DOM probe `data-resource-id` count ≥ 2 with route-precedence chips per resource |
| EC7 | Blackhole route in route table | ❌ 0 in alon-prod — **needs synthetic data** | Edge terminates at the blackhole sink; warning chip `Route blackholed — traffic dropped`; no destination reached | DOM probe `data-route-blackhole="true"` + screenshot |

**Verification policy:** PR is not promotable from `?canvas=v3` to default until **all 7 rows pass on prod** (or synthetic data is shipped for EC4/EC5/EC7 and verified on a customer system or staging-with-fixtures).

## 4. Prerequisites (must land before Slice C ship)

| # | Prerequisite | Owner | Estimate |
|---|---|---|---|
| P1 | Backend PR surfacing `edge.crosses_internet: bool` + `route_table_entry_id: string` on `CanvasEdge` contract | Backend agent | ~30 LOC |
| P2 | Synthetic test data covering EC4 (orphan VPCE), EC5 (cross-region S3), EC7 (blackhole) on a test/staging customer graph — OR finding a customer in production with the missing scenarios | Backend agent OR ops | ~1 day fixture setup |

Slice A and Slice B don't need P1 (they use the existing `architecture.egressGateways[]` + route-precedence derivation from PR #93's `lib/route-precedence.ts`). Slice C needs P1 to avoid re-deriving the boundary-crossing classification client-side from gateway-kind.

## 5. Three-slice ship plan

All three slices ship on **one feature branch** behind **`?canvas=v3` URL flag**. Each slice = one commit on the branch + per-slice local-dev verification gate. Single PR for the branch with full verification matrix attached. Promotion to default only after 7/7 rows pass on prod.

### Slice A — chip on edge + grayed IGW (~1 hour)

**Scope:**
- Move the route-precedence chip from destination card (PR #93 wrapper) to edge midpoint, reusing the existing verb-chip plumbing (`data-verb-chip` stamping + cubic-Bezier-at-t=0.5 math at `traffic-flow-map.tsx:3045-3087`)
- Render IGW in EGRESS GATEWAYS lane in a grayed state (`opacity: 0.4`, slate hue, *"Not used — VPCE wins"* annotation) when route precedence resolves to VPCE
- Symmetrically gray VPCE if route precedence resolves to IGW (less common but covers EC4 once shipped)
- Stamp `data-chip-anchored-on-edge="true"` for empirical spot-checks

**Key files:**
- `components/dependency-map/traffic-flow-map.tsx:3045-3087` — verb-chip render site (Bezier midpoint math, `data-verb-chip` already in place); add route-precedence as a second chip variant or extend `verbChipLabel` derivation
- `components/dependency-map/traffic-flow-map.tsx:4391-4444` — EgressGatewayNode lane chip render; add gray-state class flip when route precedence picks a different gateway for any destination on path
- `components/dependency-map/traffic-flow-map.tsx:4920+` — remove or relocate the destination-card chip from PR #93 (this slice migrates it; don't render in both places)

**Verification:**
- Local dev: DOM probe `[data-chip-anchored-on-edge="true"]` count ≥ 1 on the saferemediate-logs path
- Visual: screenshot showing chip on edge midpoint (not floating beside bucket), IGW grayed with `Not used` annotation
- Regression: PR #93's `data-route-precedence-via` attribute migrates from wrapper div to verb-chip wrapper; existing prod-verification on PR #93 paths still passes

### Slice B — edge geometry routes through gateway (~1-2 hours)

**Scope:**
- Modify ConnectionLinesSVG edge-routing math at `traffic-flow-map.tsx:3290+` to add a waypoint at the resolved gateway's position when the edge has route-precedence info
- Cubic Bezier becomes piecewise: two Bezier segments (`role → VPCE` and `VPCE → bucket`) instead of one single curve role→bucket
- Waypoint anchor = gateway's bounding-rect center (from existing `getNodeCenter()` helper at line 3297)
- Stamp `data-edge-via-gateway="<gateway-id>"` on the segmented edge group

**Key files:**
- `components/dependency-map/traffic-flow-map.tsx:3290+` — ConnectionLinesSVG body; `updateLines()` function around line 3294
- `components/dependency-map/traffic-flow-map.tsx:3318+` — explicit-edges mode; where each edge becomes one line; needs to become "one line OR two segments" depending on whether a waypoint is present
- `lib/route-precedence.ts` (existing from PR #93) — extend `RoutePrecedence` interface with optional waypoint position if computed assembler-side, OR keep render-side and look up gateway DOM rect

**Verification:**
- Geometric: edge midpoint sits within gateway node bounding rect (DOM-measurable via `getBoundingClientRect()`)
- Visual: screenshot showing role→VPCE→bucket curve geometrically passing through VPCE node
- 5+ paths verified including EC1 + EC2 + EC3 (no-gateway case must keep single-curve geometry)

### Slice C — Internet partition + edge styling per crossing (~2-3 hours)

**Scope:**
- Add Internet partition boundary as a canvas-level primitive — new file `components/dependency-map/internet-partition.tsx` modeled on `vpc-boundaries.tsx` (PR #90 lane-based primitive)
- Dashed horizontal (or vertical) boundary line, with labels `AWS Backbone (private)` and `Public Internet` on each side
- Bucket card lane-positioning: when route precedence resolves to VPCE → position on AWS-Backbone side; when IGW → position on Public-Internet side; this is the hardest layout piece
- Edge styling per crossing: edge that crosses boundary → solid + warning chip + rose accent; edge that stays one side → solid + AWS-backbone teal
- Stamp `data-crosses-internet="true"|"false"` on every edge for empirical spot-checks
- Consume backend P1 (`edge.crosses_internet: bool`) once shipped; until then, derive client-side from gateway kind

**Key files:**
- New file: `components/dependency-map/internet-partition.tsx` (modeled on `vpc-boundaries.tsx`)
- `components/dependency-map/traffic-flow-map.tsx` resource render lane (~line 4809-4900) — bucket-card positioning based on winning route
- `components/dependency-map/traffic-flow-map.tsx:3318+` — edge styling branch for crossing vs non-crossing
- `lib/types/attack-canvas.ts` — extend `CanvasEdge` with `crosses_internet?: boolean` (optional for back-compat; populated by backend P1)

**Verification:**
- Every path categorized: 0 crossings → no edges with `data-crosses-internet="true"`; 1+ crossings → that many `true`-stamped edges
- Visual matrix: 6+ paths covering all reproducible edge cases
- Verification matrix from §3: all rows pass on prod (or synthetic for EC4/EC5/EC7)

## 6. Sequencing & gates

1. **Feature branch:** `feat/canvas-v3-routing` off main
2. **Slice A** as commit 1, local-dev verify, push
3. **Backend agent P1 PR** opens in parallel (~30 LOC), merges independent of branch
4. **Slice B** as commit 2 on branch, local-dev verify, push
5. **Slice C** as commit 3 on branch, local-dev verify, push (consumes P1 if landed; falls back to client-side derivation if not)
6. **Single PR for the feature branch** with full 7-row verification matrix attached as artifact (screenshots + DOM probe transcripts)
7. **Merge PR**, deploy lands behind `?canvas=v3` flag (default unchanged)
8. **Prod verification on `?canvas=v3`** — re-run the 7-row matrix on prod, attach to PR as comment
9. **24-48 hour bake period** with the flag — no operator complaints, no console errors, no regressions in PR #93 chip behavior
10. **Promote to default** — flip the canvasV3 default in the route handler

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Slice C card-positioning ripples to non-canvas-v3 modes | Gate every layout change behind `canvasV3` prop; default mode (canvasV2 only) renders unchanged |
| Backend P1 doesn't land in time for Slice C | Slice C derives `crosses_internet` client-side as a fallback (gateway kind = InternetGateway/NAT/EgressOnlyIGW → public); P1 is a cleanup that consolidates the derivation source-of-truth |
| Edge cases EC4/EC5/EC7 can't be verified on alon-prod | Spec explicitly flags as **needs synthetic data**; verification matrix gate is: 4 reproducible rows pass + 3 reviewed visually on a staged graph or a paired customer fixture |
| Re-shuffling chip position breaks DOM probes from PR #93 in downstream monitoring | Keep `data-route-precedence-via` + `data-route-precedence-gateway-id` attributes on the new chip element; tests pinned to those attributes (not the parent class) continue to pass |
| Performance regression from piecewise Bezier (Slice B) on dense paths | Profile on a 8-hop path (cyntro-web-server → cyntro-demo-prod-data — visible in path list); cap waypoint introduction to edges with route-precedence info (most edges remain single-curve) |
| Internet partition adds visual clutter on degenerate paths | When no path edge would cross the partition AND no resources sit on the public side, partition renders with reduced opacity OR is omitted entirely; spec mandates labeled boundary only when the path actually exercises the partition |

## 8. Open questions

- **Internet partition orientation:** horizontal (top: AWS Backbone, bottom: Public Internet) or vertical (left: AWS Backbone, right: Public Internet)? Recommend horizontal — matches lane-flow direction. Defer to design review.
- **Cross-region S3 (EC5):** does the backend `target_service` field encode the VPCE's region precisely enough to distinguish `com.amazonaws.eu-west-1.s3` (matches eu-west-1 bucket) from `com.amazonaws.us-east-1.s3` (doesn't match)? Verify before Slice C.
- **Identity-only paths (EC3):** the canvas has no gateway node on path, so Slice B's waypoint primitive is a no-op. Confirm the renderer falls back to single-curve geometry cleanly — no orphan piecewise paths from prior renders.
- **Promotion criteria timing:** is the 24-48 hour bake period the right gate, or should it be N successful operator clicks recorded via telemetry? Defer to operator-research feedback after Slice C ships.

## 9. References

- PR #93 (merged 2026-05-31, commit `08df706`) — route-precedence chip on destination cards
- PR #90 (merged 2026-05-30, commit `3e87b90`) — VPC boundary as lane-based primitive (template for Internet partition primitive)
- PR #92 (merged 2026-05-31, commit `aaca6f9`) — multi-channel lateral edge differentiation (template for active-vs-unused channels)
- `lib/route-precedence.ts` — derivation logic shipped in PR #93, extended by Slices A/B/C
- `components/dependency-map/traffic-flow-map.tsx` — primary integration site for all three slices
- `components/dependency-map/vpc-boundaries.tsx` — template for `internet-partition.tsx`
