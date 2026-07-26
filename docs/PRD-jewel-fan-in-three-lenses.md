# Jewel Fan-in — Three Lenses View Model

**Status:** Accepted (plan closed) · **Owner:** Alon · **Last updated:** 2026-07-26

## North star

Maps must be **super clear for teams**. In under **10 seconds**, an operator must be able to name:

1. **Current state** — what is real *today* (observed) vs only *allowed* (configured)
2. **Top risk** — what can go wrong for *this* crown jewel (concrete damage)
3. **Mitigation** — the best next break (one CTA into existing LP / SG / S3 engines)

If a view needs a legend tour to answer those three, it has failed.

### Default surface (no lens required)

The **shared risk header** answers state / risk / mitigation **without** the operator choosing a tab first. Lenses are “show me why,” not “pick which answer you want.” Default map under the header is **Reachability** (entry → CJ). Lateral and Exfil deepen blast and egress; they do not own the 10s answer.

Header fields come from backend `risk_summary` (and path-level `impact_headline` / `business_sentence` / `closure_recommendation_json` / `severity_label` / `damage_types` on `AttackPath`). **Frontend must not rank “worst of N paths.”**

---

## Architecture principle

**One canvas shell, three lenses, zero frontend graph invention.**

| Layer | Owns |
|---|---|
| Backend | Typed DTO: nodes, edges, evidence, `risk_summary`, mitigation hints, class filters |
| Frontend | Render DTO + shared evidence styling; click-through to remediation |

Prefer extending `/api/attack-chain/canvas` (and lens-specific query params) over forking another FE synthesizer.

**Do not** use `build-attacker-architecture.ts` as the foundation (synthesis-heavy, strips laterals, mid-deprecation). **Do** reuse its **evidence primitives** (observed / configured / locked / inferred + visual encoding).

**Ranking and resource filters stay server-side** — including jewel top-risk and Lateral fan-out (exclude internal types: `AccessPattern`, `NetworkNode`, `ShadowS3Remediation`, etc.). If FE starts filtering or scoring, synthesis has sneaked back in.

---

## Shared evidence model (all lenses)

Every edge and critical claim carries:

| Evidence | Meaning | Visual |
|---|---|---|
| `observed` | Telemetry proves use in window | Bright / animated |
| `configured` | IAM/network allows; no proof of use | Dim / static |
| `locked` | AWS-required relationship | Solid, non-remediable cue |
| `inferred` | Derived; must show reason or not draw | Dashed + reason, or omit |

Header always shows: **observed count · configured count · top severity · primary mitigation CTA**.

Mitigation: every high-risk hop is clickable → existing `IAMPermissionAnalysisModal` / `SGRemediationModal` / `S3RemediationModal` with path + jewel context.

---

## Lens 1 — Reachability

**Question:** From which initial places can an attacker reach *this* CJ?

**DTO source (preferred):** AttackChain hops / `chains-for-cj` (same honesty as `attacker-view-v3`: every line is a real hop). Fan-in list from `by-crown-jewel` (class filter: draw `in_system`; badge platform/out-of-scope).

**Show**
- Entry workload(s) → network gates → identity → jewel
- Path classification badge (`in_system` only by default)
- Per-path: confidence (observed vs configured), damage one-liner, **Break this path** CTA

**Hide / demote**
- Platform / service-linked paths (badge only)
- Lateral blast (that’s Lateral)
- Jewel→internet doors (that’s Exfiltration)

**Acceptance**
- Operator points at entry + jewel and says whether the path is live or only allowed
- Names one control to break (role / SG / NACL) and can open remediation in one click

---

## Lens 2 — Lateral

**Question:** Once on a path identity/workload, where else can the attacker move?

**DTO source:** `lateral-moves` (per identity) and/or `graph-view` `laterals_by_node`; fan-out topology (hub-and-spoke / DAG — e.g. `all-paths-graph` pattern), **not** the linear kill-chain spine.

**Show**
- Selected on-path identity or compute as hub
- Edges to **real** resources only (other CJs, assume/pass role, SSM, network pivots) — DTO already filtered
- Evidence + risk class (`REAL_DAMAGE` / `CAPABILITY` / `PIVOT`)
- **Highest blast** callout (server-ranked) + mitigate shared role / over-permission

**Hide / demote**
- Full entry→CJ plumbing (link back to Reachability)
- Exfil doors from the jewel
- Internal graph scaffolding nodes

**Acceptance**
- Operator names “same role also reaches N other jewels” (or honest empty)
- One CTA to shrink the shared identity

---

## Lens 3 — Exfiltration

**Question:** If the attacker has this CJ, how can data leave?

**DTO source:** `exfil-paths` + server-side route precedence (`ROUTES_VIA` / transport resolver; `STRUCTURAL_S3_EGRESS` when served). Direction is **jewel → out**, not entry → jewel.

**Known coverage gap (must ship with the lens):** Today, observed transport on this jewel is **blind** — e.g. `ACTUAL_S3_ACCESS` often has no `vpc_endpoint_id`, and the collector that would produce it may be unwired/gated. Until that lands, the “observed egress when present” branch will be empty. That is **not a product bug** if the UI says so.

**Required coverage badge (always when observed transport is unavailable):**
> Observed transport not yet collected — showing configured egress only

Without that badge, an empty/all-configured Exfil lens fails the 10s test (partners read “broken,” not “evidence missing”).

**Show**
- Winning egress for this jewel’s traffic class (e.g. S3 Gateway VPCE vs IGW)
- Unused alternatives greyed (“Available · not selected”) with reason
- Observed egress when present; otherwise **configured egress only** (never fake live) + coverage badge
- Accessors that can pull/push data (observed vs capable)

**Hide / demote**
- Full inbound kill chain (summary chip + link to Reachability)

**Acceptance**
- Operator says “data leaves via VPCE (private) / IGW (public)” correctly *as configured*
- Sees whether any **observed** exfil exists, or only capability (+ coverage badge when blind)
- One CTA (bucket policy / role data actions / block public egress)

---

## Explicit non-goals

- Raw Neo4j dump of all 19 paths as the default view
- One blended polyline that looks equally live for config and traffic
- A fourth FE synthesis model
- Replacing Quarantine / LP engines — maps **route into** them
- FE inventing top-risk ranking or Lateral resource filters

---

## Delivery sequence

### Step 0 — DTO readiness audit (gate for steps 2–4)

For each lens, record: endpoint exists? returns evidence-typed edges (`observed` / `configured` / `locked` / `inferred`)? returns `risk_summary` / mitigation hints? filters internal node types server-side?

| Lens | Candidate APIs | Gate |
|---|---|---|
| Reachability | `by-crown-jewel`, `chains-for-cj`, attack-chain canvas | Must be ready before step 2 |
| Lateral | `lateral-moves`, graph-view laterals | Must be ready before step 4 |
| Exfil | `exfil-paths` (+ structural egress DTO) | Likely backend-blocked until DTO serves `STRUCTURAL_S3_EGRESS`; do not bank FE schedule until audit says green |

**Do not commit FE calendar for steps 2–4 until Step 0 marks each lens ready vs blocked.**

### Steps 1–4

1. **Shared evidence + risk header** on Zoom0 shell (works on current Reachability map; uses existing `AttackPath` impact/closure fields). Unblocks the 10s answer immediately.
2. **Reachability** → hop/DTO truth (stop composing inventing egress onto the spine) — only after Step 0 green for Reachability
3. **Exfiltration** → wire `exfil-paths` + **coverage badge** — only after Step 0 green (or ship badge + configured-only explicitly if DTO is partial)
4. **Lateral** → wire `lateral-moves` / fan-out DAG — only after Step 0 green for Lateral

---

## Success metric

In partner review (alon-prod · `saferemediate-logs`): three operators, no coaching —

- From the **header alone**, state evidence class, top risk, and next mitigation  
- Then, per lens, correctly deepen “why” (Reachability path, Lateral blast, Exfil egress + coverage honesty)

Pass bar: **≥ 2 / 3 succeed within 10 seconds on the header; ≥ 2 / 3 correctly interpret each lens when opened.**
