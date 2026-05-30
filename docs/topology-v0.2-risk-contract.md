# Topology v0.2 — Risk Score Contract

**Status:** Design spec (not implemented)
**Owner:** Topology v0.2 design (PR #78 + correction PR #81)
**Consumers:** `public/design/topology-v0.2.html` (mockup), `public/design/topology-v0.2-estate.html` (mockup), eventual successor to `components/attack-paths-v2/topology-view.tsx`
**Producer:** `saferemediate-backend` (Python · Render)

---

## ⚠ Correction notice — 2026-05-30 (read before implementing §3)

The first cut of this contract (PR #78) was shaped around a single Estate-mode KPI called *"posture freshness %"* — implying the right system-level question was "what fraction of workloads have fresh posture data?" Validation against alon-prod revealed that framing **conflated two distinct findings** and was reshipped in PR #81 as two separate Estate KPI tiles. The contract is corrected accordingly.

**Old framing (do NOT implement):**
> "0% posture fresh · 53 of 53 workloads"

**Corrected framing (implement THIS, per PR #81):**
> "Posture coverage 17/57" + "Posture freshness 14d"

**Why this matters for the contract:** the two findings have different owners and different fix paths. A backend implementation that returns a single composite "fresh%" number forces the UI to either re-split client-side (lossy) or accept the wrong framing (misroutes the customer conversation). The contract must expose both as first-class fields. **See §X "System-level KPIs" added below.**

If you are reading this doc as the spec for backend implementation:
1. Implement **§X System-level KPIs** as designed (separate coverage + freshness fields), not the single-percentage shorthand referenced in §1.
2. Cross-reference the current Estate mockup at `public/design/topology-v0.2-estate.html` (post-merge of PR #81) — that's the canonical UI spec for what the contract feeds.
3. The per-node response shape in §3.2 is unchanged. The addition is the system-level rollup.

---

## 1. Why this contract exists

Topology v0.2 renders risk integers (`87`, `78`, `62`, etc.) on every workload node in the AWS reference-architecture template, and on every entry in the "Next worst" rail. Those numbers must be:

1. **Honest** — derived from real Neo4j fields, not fabricated
2. **Confidence-aware** — the operator must see, inline, when the inputs to a number are stale
3. **Decomposable** — the operator must be able to see *which signals* drove the score
4. **Self-healing** — confidence must recover automatically when collectors succeed; no operator action required for the happy path

Items 2-4 come from three v0.3 design principles that already shipped:

- [feedback_composite_score_data_confidence](/Users/admin/.claude/projects/-Users-admin-Documents-Eltro/memory/feedback_composite_score_data_confidence.md) — composite-score data-confidence is the highest-priority propagation surface; honest panels can still aggregate into a dishonest score
- [feedback_amber_must_self_heal](/Users/admin/.claude/projects/-Users-admin-Documents-Eltro/memory/feedback_amber_must_self_heal.md) — amber states are transient by contract, not permanent labels
- [feedback_audit_trail_framing_over_trust](/Users/admin/.claude/projects/-Users-admin-Documents-Eltro/memory/feedback_audit_trail_framing_over_trust.md) — confidence + freshness fields are *compliance artifacts*, not just UX hygiene

The contract operationalizes all three. Without it, every risk integer in topology-v0.2 is illustrative — and the discipline that makes Cyntro defensible to a regulator can silently break at the rollup layer.

---

## 2. What already exists

| Endpoint | Shape | Notes |
|---|---|---|
| `GET /api/blast-radius/{resourceId}/risk-assessment?resource_type=X` | Per-resource risk via existing proxy at `app/api/proxy/resource-risk/[resourceId]/route.ts` | Returns risk for ONE node. No confidence field. No contributor decomposition. Used by `attack-path-detail-panel.tsx` and `traffic-flow-map.tsx`. |
| `GET /api/posture-score/{systemName}` | System-level posture rollup | Aggregate, not per-node. Used by `system-detail-dashboard.tsx`. |
| `GET /api/global-org-score` | Org-level rollup | Used by `hero-brss-card.tsx`. No per-node breakdown. |

**Gap:** No endpoint returns *per-node risk for an entire topology* with confidence + contributors. Calling `/api/resource-risk` per node would be N HTTP round-trips and still wouldn't surface confidence.

---

## 3. The contract

### 3.1 Endpoints

```
GET /api/topology-risk/{systemName}
GET /api/topology-risk/{systemName}/node/{nodeId}
```

The bulk endpoint serves the topology view (one round-trip per render). The per-node endpoint serves the detail panel and is shape-identical to a single entry in the bulk response — so the detail panel can pre-render from the bulk cache and refresh on click.

### 3.2 Response shape (bulk)

```jsonc
{
  "system": "alon-prod",
  "scored_at": "2026-05-30T18:51:00Z",
  "scoring_window_days": 365,
  "vpc_id": "vpc-0329e985173bed24f",
  "nodes": [
    {
      "id": "i-0f51b8b7ad29a359b",
      "name": "SafeRemediate-Test-Frontend-1",
      "type": "EC2Instance",
      "subnet_id": "subnet-0d193156d09dfe931",
      "score": {
        "value": 87,
        "tier": "WORST",
        "rank": 1,
        "confidence": {
          "value": 0.62,
          "tier": "DEGRADED",
          "reasons": [
            {
              "signal": "posture",
              "is_fresh": false,
              "age_days": 14,
              "threshold_days": 7,
              "auto_resolves_when": "posture_correlated_at < threshold_days"
            },
            {
              "signal": "iam_lp_analysis",
              "is_fresh": false,
              "age_days": 51,
              "threshold_days": 14,
              "auto_resolves_when": "last_gap_analysis < threshold_days"
            }
          ]
        },
        "contributors": [
          {
            "signal": "network_exposure",
            "weight": 0.45,
            "value": 1.0,
            "evidence": {
              "exposure_state": "LATENT_EXPOSURE",
              "verdict": "LATENT",
              "priority": 3,
              "lb_chain_intact": true,
              "observed_inbound_from_public_365d": false
            },
            "freshness": {
              "source": "posture_correlated_at",
              "as_of": "2026-05-16T18:44:20Z",
              "age_days": 14,
              "is_fresh": false,
              "threshold_days": 7
            }
          },
          {
            "signal": "internet_dependency",
            "weight": 0.25,
            "value": 0.95,
            "evidence": {
              "tier": "FULL",
              "distinct_destinations": 547,
              "aws_via_nat_count": 199,
              "non_aws_count": 348,
              "vpce_gap_services": ["EC2", "S3"]
            },
            "freshness": {
              "source": "posture_correlated_at",
              "as_of": "2026-05-16T18:44:20Z",
              "age_days": 14,
              "is_fresh": false,
              "threshold_days": 7
            }
          },
          {
            "signal": "iam_gap",
            "weight": 0.15,
            "value": 0.0,
            "evidence": {
              "role_name": "cyntro-demo-frontend-ssm-role",
              "allowed": 0,
              "unused": 0,
              "remediated_at": "2026-03-09T20:22:35Z",
              "actions_observed_in_use": 10
            },
            "freshness": {
              "source": "permissions_synced_at",
              "as_of": "2026-04-26T06:34:06Z",
              "age_days": 34,
              "is_fresh": false,
              "threshold_days": 14
            },
            "warnings": [
              {
                "code": "OBSERVATION_CONTRADICTS_ALLOWED_COUNT",
                "message": "10 actions observed in use but allowed_count = 0 — counts likely stale",
                "auto_resolves_when": "permissions_synced_at < threshold_days"
              }
            ]
          },
          {
            "signal": "jewel_adjacency",
            "weight": 0.15,
            "value": 0.6,
            "evidence": {
              "hops_to_jewel": 1,
              "jewel_id": "arn:aws:rds:eu-west-1:745783559495:db:saferemediate-test-db",
              "jewel_is_sensitive_data": true
            },
            "freshness": {
              "source": "graph",
              "as_of": "2026-05-30T18:51:00Z",
              "is_fresh": true
            }
          }
        ]
      },
      "stale": null,
      "is_jewel": false
    }
  ]
}
```

### 3.3 Field semantics

| Field | Type | Semantics |
|---|---|---|
| `score.value` | `int` 0-100 | Composite score. 100 = worst. Computed as `sum(contributor.weight × contributor.value) × 100`. |
| `score.tier` | enum | `WORST` / `HIGH` / `ELEVATED` / `QUIET`. Drives UI halo. Tier boundaries are tunable; v1 starts at `score.value ≥ 85 / ≥ 65 / ≥ 35 / <35`. |
| `score.rank` | `int` 1-N | System-wide ranking. Drives "Next worst" rail order. Stale nodes excluded from rank. |
| `score.confidence.value` | `float` 0.0-1.0 | Composite confidence. 1.0 = all inputs fresh. Computed as the *minimum* of contributor freshness ratios — the rollup is no more confident than its weakest signal. |
| `score.confidence.tier` | enum | `FULL` (≥ 0.85) / `DEGRADED` (≥ 0.5) / `LOW` (< 0.5). Drives amber UI treatment. |
| `score.confidence.reasons[]` | list | Per-signal staleness facts. Each entry includes `signal`, `is_fresh`, `age_days`, `threshold_days`, `auto_resolves_when`. UI renders these inline (not in a tooltip — per data-confidence-first-class principle). |
| `score.contributors[]` | list | The signals that drove this score. Always present and never empty (`QUIET` nodes still list zero-value contributors so the UI can show *what was evaluated*). |
| `contributor.weight` | `float` | Configured weight. Must sum to 1.0 across contributors. |
| `contributor.value` | `float` 0.0-1.0 | This signal's contribution before weighting. |
| `contributor.evidence` | object | Raw fields used. Heterogeneous per signal — the UI renders a per-signal evidence component. |
| `contributor.freshness` | object | Per-signal freshness. Allows the UI to show **which** signal is stale, not just an aggregate. |
| `contributor.warnings[]` | list, optional | Data-trust contradictions. Each has `code`, `message`, `auto_resolves_when`. UI renders as sync-warn panels. |
| `stale` | object \| null | If non-null, the node is a zombie (`aws_exists = false` or has `:StaleResource`). Contains `since` timestamp. Excluded from `rank` and from composite scoring; treated as separate halo state. |
| `is_jewel` | bool | True if `is_sensitive_data = true` on the node OR a downstream collector tagged it. Drives the crown-jewel amber halo treatment, *independent of* the risk score. |

### 3.4 Confidence model — why MIN-of-contributors, not average

A rollup is no more trustworthy than its weakest input. If posture is 14 days stale but IAM is fresh, the score is at most as confident as the posture signal — averaging would let one fresh signal mask the staleness of another. This matches how a compliance auditor reasons: "did you verify *each* input?", not "did you verify *most* inputs?".

Implication: a node with one stale-signal contributor will always have `DEGRADED` or `LOW` confidence even if the rest are fresh. Operators should expect that. The right reaction is to fix the stale collector, not tune the threshold.

### 3.5 Auto-resolve contract

Every `freshness.is_fresh = false` claim carries an `auto_resolves_when` clause that names the exact condition for recovery. The UI uses this to:

- Render the amber state with a deterministic recovery path
- Suppress operator-action surfacing during the happy path (collector retries succeed → freshness recovers → amber clears, no click required)
- Escalate to a different visual treatment (carmine `BROKEN`) only when the freshness condition stays violated longer than a hard escalation threshold (e.g., > 4 × `threshold_days`)

The contract does *not* include the escalation threshold itself — that's a UI configuration concern, not a backend one. The backend's job is to report freshness honestly; the UI's job is to render it.

### 3.6 System-level KPIs — coverage AND freshness as separate fields

**Added 2026-05-30 per the correction notice at the top of this doc.** The bulk response carries a `system_kpis` object at the top level (sibling to `nodes`). This is what the Estate-mode KPI strip consumes — and it MUST expose coverage and freshness as separate fields, not collapsed into a single "fresh%" number.

```jsonc
{
  "system": "alon-prod",
  "scored_at": "2026-05-30T18:51:00Z",
  "vpc_id": "vpc-0329e985173bed24f",
  "system_kpis": {
    "workloads_total": 57,
    "workloads_by_type": {
      "EC2": 8, "Lambda": 30, "RDS": 2, "S3": 10, "DynamoDB": 8, "LoadBalancer": 1
    },
    "flagged_count": 4,                  // posture_verdict_priority <= 3, deduplicated by id
    "stale_workloads_count": 3,          // aws_exists = false (zombie workloads)
    "posture_coverage": {
      "scored": 17,
      "total": 57,
      "by_type": {
        "EC2":    { "scored": 5,  "total": 8  },
        "Lambda": { "scored": 11, "total": 30 },
        "RDS":    { "scored": 1,  "total": 2  },
        "S3":     { "scored": 0,  "total": 10 },
        "DynamoDB": { "scored": 0, "total": 8 }
      }
    },
    "posture_freshness": {
      "most_recent_run": "2026-05-16T18:44:20Z",
      "age_days": 14,
      "threshold_days": 7,
      "is_fresh": false,
      "auto_resolves_when": "posture_correlated_at >= now() - 7d on any workload"
    }
  },
  "nodes": [ ... ]
}
```

**Field semantics:**

| Field | Type | Semantics |
|---|---|---|
| `workloads_total` | `int` | Distinct workload count after `:Service` legacy-stub dedup. Use `count(DISTINCT id)` not `count(*)`. |
| `workloads_by_type` | map | Per-type breakdown of the above. |
| `flagged_count` | `int` | Workloads with `posture_verdict_priority <= 3` (worst tier). Aggregate using `MIN` not `MAX` — priority is reverse-ordered, lower = worse. The original draft used `MAX` and reported 7 instead of the real 4. |
| `stale_workloads_count` | `int` | Workloads with `aws_exists = false` OR carrying `:StaleResource` label. Cyntro's zombie count. Independent of posture state. |
| `posture_coverage.scored` | `int` | Workloads where `posture_correlated_at IS NOT NULL` after dedup. |
| `posture_coverage.total` | `int` | Same as `workloads_total`. |
| `posture_coverage.by_type` | map | Per-type breakdown. **S3 and DynamoDB will currently report 0/N because no posture model exists for those types yet.** That's the product-coverage finding the Estate KPI surfaces; surfacing it honestly is the point. |
| `posture_freshness.most_recent_run` | `datetime` | `max(posture_correlated_at)` across all workloads. |
| `posture_freshness.age_days` | `int` | `now() - most_recent_run` in days. |
| `posture_freshness.threshold_days` | `int` | Same as the per-contributor `network_exposure` / `internet_dependency` threshold (7 days as of v1). |
| `posture_freshness.is_fresh` | `bool` | `age_days < threshold_days`. |
| `posture_freshness.auto_resolves_when` | `string` | Self-resolving condition per [feedback_amber_must_self_heal](../memory/feedback_amber_must_self_heal.md). |

**Why two fields, not one composite:**

The two findings have different owners:
- **Coverage gap** → platform team (build posture models for S3 / DDB / more Lambdas)
- **Freshness gap** → ops team (scheduler cadence; posture last ran 14 days ago)

A composite "fresh%" KPI collapses both into a single number that misroutes the conversation. The Estate mockup (PR #81) renders two separate tiles deliberately; the contract must feed them with two separate fields. See [feedback_validate_headline_before_shipping](../memory/feedback_validate_headline_before_shipping.md) for the discipline that drove this correction.

**Sources for the per-type counts:** see §4.1 below.

---

## 4. Backend implementation notes (for the follow-up PR)

### 4.1 Field source map

| Contributor | Neo4j source |
|---|---|
| `network_exposure` | `posture_verdict_priority` + `exposure_state` + `posture_verdict` + `exposure_evidence_json.lb_chains` |
| `internet_dependency` | `exposure_evidence_json.internet_dependency.tier` + `distinct_destination_count` + `vpce_gap_services` |
| `iam_gap` | `IAMRole.unused_actions_count` + `gap_percentage` + `lp_score` joined via `HAS_INSTANCE_PROFILE` / `USES_ROLE` |
| `jewel_adjacency` | shortest-path count to nearest `(:RDSInstance|:S3Bucket {is_sensitive_data: true})` |

### 4.2 Freshness source map

| Signal | Freshness source | Threshold |
|---|---|---|
| `posture` | `posture_correlated_at` on the node | 7 days |
| `internet_dependency` | `posture_correlated_at` on the node | 7 days |
| `iam_lp_analysis` | `last_gap_analysis` OR `permissions_synced_at` on the role (whichever is more recent) | 14 days |
| `graph` (jewel adjacency) | always fresh — derived from graph topology | — |

### 4.3 Performance + caching

- Bulk endpoint: cache 60s server-side, mark `Cache-Control: max-age=60` so the frontend's `use-cached-fetch` honors it. Per [feedback_use_cached_fetch_no_abort](/Users/admin/.claude/projects/-Users-admin-Documents-Eltro/memory/project_use_cached_fetch_no_abort.md) — no AbortController.
- Per-node endpoint: cache 30s.
- N+1 risk: the bulk endpoint must compute jewel adjacency in a single Cypher pass (one shortest-path call per jewel × node set), not N round-trips per node.
- Stale workloads excluded from `nodes[].score` but returned with `stale: { since, reason }` and tier `STALE`. Topology renders them dimmed regardless of score.

### 4.4 Cyntro Render tier note

Per [project_render_tier](/Users/admin/.claude/projects/-Users-admin-Documents-Eltro/memory/project_render_tier.md), the backend is always warm — cold-start blame for first-call latency is wrong. Expected p95 for the bulk endpoint over a 25-node VPC: < 800 ms.

---

## 5. UI consumption pattern

### 5.1 Headline strip (worst-now)

```
WORST RIGHT NOW
SafeRemediate-Test-Frontend-1 is internet-reachable …
Risk 87 · Confidence 62% [DEGRADED] · Posture + IAM stale · Source: lb_chain + 365d traffic
```

Confidence is **inline**, not a tooltip. The reasons list ("Posture + IAM stale") names *which* signals are stale, derived from `confidence.reasons[].signal` where `is_fresh = false`.

### 5.2 Risk chip on each node

The chip shows the integer plus a confidence dot. `FULL` = solid teal dot, `DEGRADED` = amber dot, `LOW` = carmine dot. On hover, the chip expands to show the contributor breakdown — no separate click required.

### 5.3 Detail panel risk banner

The banner shows:
- Score integer (large)
- Tier label (`WORST` / `HIGH` / ...)
- Confidence integer + tier label (`62% · DEGRADED`)
- Contributor list (a small horizontal bar chart of weighted contributions, each bar labeled with its signal and freshness state)
- Auto-resolve clauses listed under each stale contributor

### 5.4 Right-rail rank

The "Next worst" rail orders by `score.rank`. Stale and excluded nodes appear in a separate collapsed group below the main list. Each rail entry shows a tiny confidence dot — same encoding as the chip.

### 5.5 Estate-mode

When Estate mode (not yet designed) renders all nodes, the halos and confidence dots derive from the same contract. No mode-specific scoring.

---

## 6. Backwards compatibility

`/api/proxy/resource-risk/{resourceId}` stays — it serves the existing `attack-path-detail-panel.tsx` and `traffic-flow-map.tsx`. The new endpoint is additive, not a replacement. If/when those callers migrate to the new contract, the old endpoint can be deprecated.

The new contract is intentionally a superset of the old shape: the existing single-node consumers can read the new endpoint's per-node format and ignore the fields they don't use. Migration path is straightforward.

---

## 7. What this contract deliberately doesn't include

- **Remediation plans.** The risk endpoint reports *state*; remediation is a separate concern owned by `/api/remediation/*`.
- **Per-action audit events.** Surfaced through `OverrideEvent` nodes per [project_v44_durable_audit_contract](/Users/admin/.claude/projects/-Users-admin-Documents-Eltro/memory/project_v44_durable_audit_contract.md).
- **Trend / delta.** v1 returns point-in-time scores. Trend is a follow-up endpoint shaped like `/api/topology-risk/{systemName}/trend?days=30`.
- **Customer-tunable weights.** v1 ships with fixed weights. PolicyPack-tunable weights are a follow-up.
- **Cross-system aggregation.** Per-system only. Org-level rollup is `global-org-score`'s job.

---

## 8. Acceptance — what "done" looks like

- [ ] Backend endpoint `GET /api/topology-risk/{systemName}` returns the response shape in §3.2 against alon-prod within 800 ms p95
- [ ] Response includes the `system_kpis` object per §3.6 — coverage and freshness as SEPARATE fields, not a composite "fresh%". Sanity-check against alon-prod: `posture_coverage.scored = 17`, `posture_coverage.total = 57`, `posture_coverage.by_type.S3 = {0,10}`, `posture_coverage.by_type.DynamoDB = {0,8}`, `posture_freshness.most_recent_run = 2026-05-16T18:44:20Z`, `posture_freshness.is_fresh = false`
- [ ] `flagged_count` uses `MIN(posture_verdict_priority)` after dedup-by-id — sanity check against alon-prod: 4, not 7
- [ ] Per-node `confidence` is computed as MIN-of-contributors, not average (§3.4)
- [ ] Every stale signal includes `auto_resolves_when` (§3.5)
- [ ] Frontend proxy route `app/api/proxy/topology-risk/[systemName]/route.ts` mirrors the existing proxy pattern (caching, error handling)
- [ ] Topology v0.2 mockup updated to render confidence inline (UI changes in this PR, contract consumption wires up in the next)
- [ ] Existing `/api/proxy/resource-risk/*` consumers untouched
- [ ] Contract doc landed in `docs/` (this file)
