# Attacker Map

Cyntro's canonical attacker view: every attack path to a crown jewel rendered from real Neo4j data, with click-through to the existing Least Privilege remediation engines.

Lives at `/?section=attacker-map` (sidebar item "Attacker Map", crosshair icon). Sits alongside the legacy `Attack Paths` tab during the transition — both consume the same backend endpoint; the legacy tab can be retired once this view has parity.

## Files

| File | Role |
|---|---|
| `attacker-map.tsx` | Parent. Fetches paths, owns the crown-jewel selector, view-mode toggle, click-through modal state. Keep under 400 lines per the UI-builder skill. |
| `attacker-flow-canvas.tsx` | Phase 1 single-path view. Horizontal flow of the path nodes with animated dashed arrows and per-node Quarantine pills. |
| `three-plane-cards.tsx` | The Network / Identity / Data risk and Quarantine cards plus the SSH flag callout. Three exports — keep them in one file because they share the same A7 framing. |
| `all-paths-graph.tsx` | Phase 2 fan-in DAG. ReactFlow + dagre. Deduplicates nodes/edges across every path to the selected jewel; choke points get a `×N` badge. |

## Data contract

Single endpoint, already wired:

```
GET /api/proxy/identity-attack-paths/[systemName]?envelope=true
```

Response shape: `IdentityAttackPathsResponse` from `@/components/identity-attack-paths/types`. The same payload powers both view modes — no duplicate fetches, no Phase-2-specific endpoint.

Cache key: `attacker-map:{systemName}` via `useCachedFetch` (separate namespace from the legacy Attack Paths tab so they don't clobber each other's SWR cache).

## View modes

Toggle lives in the header. Default is `single`.

| Mode | Renders | Path nav |
|---|---|---|
| `single` | One path: flow canvas + 3-plane risk + SSH flag + 3-plane Quarantine + provenance footer. | `prev / N of M / next` arrows when the jewel has more than one path. |
| `all` | Every path to the selected jewel as one merged DAG. Shared nodes drawn once with `×N` badge where N ≥ 2. Hover any node to dim everything except the paths through it. | None — the whole point is seeing all paths at once. |

Both modes share: the crown-jewel selector dropdown, the click-through to `IAMPermissionAnalysisModal` / `S3RemediationModal` / `SGRemediationModal`, and the cache.

## Click-through routing

`classifyForModal` in `attacker-map.tsx` decides which modal opens per node type:

| Node type contains | Modal |
|---|---|
| `s3`, `bucket` | `S3RemediationModal` |
| `securitygroup` | `SGRemediationModal` |
| `iam`, `role`, `instanceprofile` | `IAMPermissionAnalysisModal` |
| anything else | no-op (click is silent) |

Use the same engines, snapshots, and rollback paths as the Least Privilege tab — don't fork. If a new resource type needs a modal (NACL, KMS resource policy), wire it here and in the existing modal layer; do not invent a new path in this component.

## "No mock data" rule

`docs/CYNTRO-PRODUCT-RULES.md` is binding for this surface. Every value rendered comes from the live API response. When a field is null or missing, render an honest "not available yet" message instead of filling in a plausible number. Examples in the current code:

- `"No observed lateral reach on this role yet — Cyntro hasn't ingested CloudTrail activity for it in the current window."`
- `"No unused ports flagged on path SGs in the current window."`
- `"No live damage capability computed yet for this path."`

If you add a new card or number, follow the same pattern: read from the typed response, branch on `null/undefined/0`, surface the gap honestly.

## Choke points (Phase 2 detail)

`buildMergedGraph` in `all-paths-graph.tsx` is a pure deduplication function over the path list:

1. Walk every path; for each node id, record the set of `path indexes` that include it.
2. For each edge `(source, target, type)` triple, do the same.
3. Any node whose path-index-set size ≥ 2 is a choke point: thicker border, `×N` badge.
4. On hover, highlight the union of all nodes/edges whose path-index-sets intersect the hovered node's set; dim the rest.

The merge logic is the entire reason the Cyntro choke-point story works visually — if you change it, you change the product narrative. Don't replace it with a heuristic. Test against the alon-prod data (19 paths to `saferemediate-logs-745783559495` should produce a `×14` badge on `CyntroLambdaTier1-pilot`).

## SSH flag

Fires conditionally — `findSgWithSshExposed` walks the path's nodes and returns the first SG node where `is_internet_exposed === true` AND `open_ports` includes `22`. Both must be present and true; otherwise the flag stays hidden. Don't make this fire on a heuristic or on a default — silence is correct when the data isn't there.

## Patent-area touchpoints (do not rewrite)

Per `CLAUDE.md` in the backend repo, these areas are patent-filed:

- SafetyVector scoring — referenced by the Quarantine apply flow (not in this component, but consume-only when wiring it later).
- Confidence scoring methodology — `damage_capability.state`, `effective_damage`, the `path_status` enum — read-only here.
- Multi-plane coordination — the IAM + SG + data orchestration during Quarantine apply lives in the backend; this component visualizes the *result*.

If you find yourself changing damage-verb classification, severity calculation, or the choke-point detection algorithm, flag the diff as "patent-area change" and get explicit human approval before merging.

## Local dev

```bash
cd ~/Documents/Eltro/Platfrom/saferemediate-frontend-dlp
npm install      # first time only
npm run dev
# open http://localhost:3000/?section=attacker-map
# pick alon-prod, pick saferemediate-logs-745783559495, toggle "All paths"
```

Backend cold-start: first request to `/api/proxy/identity-attack-paths/...` can take 30-50 seconds on Render. The proxy has SWR caching so the second request is instant. The component shows a loader for the first cold call and falls back to cached data after.

## Next phases

| Phase | Scope | Status |
|---|---|---|
| 1 | Single-path view + three-plane cards + SSH flag + click-through | Shipped |
| 2 | All-paths fan-in DAG with choke points | Shipped |
| 3 | CVE overlay — per-node CVE chips, port-level SG mitigation linkage | Not started |
| Quarantine apply | Backend orchestrator + multi-resource canary; UI wiring lives here | Backend pending — see `docs/PRD-attacker-view-phase-1.md` |
| Sunset legacy `Attack Paths` tab | Once parity is confirmed in production with at least one design partner | Not started |

## Related docs

- `docs/PRD-attacker-view-phase-1.md` — Phase 1 PRD with the data model additions and the Quarantine apply API spec.
- `docs/CYNTRO-PRODUCT-RULES.md` — the no-mock-data rule. Binding.
- `.cursorrules` / backend `CLAUDE.md` — A7 framework, choke-point principle, safety guardrails.
