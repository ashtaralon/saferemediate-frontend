# CLAUDE.md

Guidance for Claude Code / agents working in the saferemediate-frontend Next.js app.

## Non-negotiable rules (read first)

1. **Real data only — no mock, ever.** (Alon, 2026-06-09; highest priority.) NEVER render mock /
   sample / placeholder / hardcoded / "seeded" values. Every number, finding, path, gap, verdict,
   and before/after must come from the real backend, which reads the Neo4j graph (the map = single
   source of truth). When data is absent, render an honest empty / loading / "not computed yet"
   state — never a fabricated value. Do NOT add a `MOCK_MODE` flag; wire to the real proxy/backend.
   (See memory: `feedback_no_mock_data`, `feedback_no_mock_numbers_in_ui`.)

2. **Edit, don't recreate.** The repo has V2 sprawl. Extend the existing component (e.g. add a panel
   under `components/attack-paths-v2/`); never fork a `v3`/`-map` alongside a working feature.

3. **Respect the proxy-route pattern.** The browser never calls the backend directly. Every backend
   endpoint has an `app/api/proxy/<path>/route.ts` wrapper (timeout + cache + stale fallback +
   honest error envelope). Copy the pattern; don't freelance.

4. **Speak the domain natively.** Use the exact enum strings and `*_CONFIG` maps from `lib/types.ts`.
   Always show evidence next to a recommendation, and `kept` next to `removed` (never narrow without
   showing what was kept).

## Example feature (real-data, no mock)
`components/attack-paths-v2/closure-outcome-panel.tsx` + `use-closure-preview.ts` render the
"what you're approving" view from `GET /api/proxy/attack-paths/<id>/closure-preview` → the live
backend → the Neo4j `AttackPath` node. No mock; honest loading/error/empty states.
