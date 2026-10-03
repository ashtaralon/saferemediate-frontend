# Local UI preview

Run from this frontend checkout:

```sh
npm ci
npm run dev:preview
```

Open http://127.0.0.1:3210/settings/accounts. Use the blue preview bar to navigate Home, Accounts and Coverage and switch scenarios. Edit the real files in `app/`, `components/` or `lib/`; Next refreshes the open page without an image build. Stop with Ctrl+C. Port 3210 is deliberately fixed and loopback-only; an occupied port fails instead of silently choosing another.

The preview imports the actual product pages, providers, parsers and styles. It is a separate Next application under `tools/local-preview`, so the release application's middleware and API routes are not altered or bypassed. No production module imports this harness. Do not deploy this harness or bind it to a public interface.

## First supported slice

- Home: the real no-workload state. Other Home reads without an explicit fixture fail visibly as unavailable.
- Accounts: control-plane-only and connected-member examples; Add dialog and field validation. All submissions fail with a clear preview-only HTTP 405; they cannot enroll an account.
- Coverage: no-workload hold, populated publication with a gap, HTTP 503 unavailable, HTTP 403 denied, and malformed-body regression state.
- Account-group list: empty fixture. Other navigation remains product navigation; unsupported pages may return 404 and unsupported reads return `PREVIEW_ROUTE_NOT_FIXTURED`, never invented success.

## Data and isolation

All current data is **synthetic test input**, not a recording of customer evidence. Published coverage is copied from `__tests__/coverage/source-coverage-panel.test.tsx`; account shapes follow `__tests__/settings-accounts-member-mode.test.tsx`; the no-workload body matches the backend gate response reproduced during rehearsal.23. Scenario changes clear only this preview origin's browser cache so stale fixture values cannot masquerade as a new scenario.

The runner supplies a minimal process environment and inherits no AWS variables or backend URLs. The harness has no live API forwarding, credential loading or server-side AWS clients. Its catch-all API serves explicit fixtures, refuses unsupported reads, and rejects POST/PUT/PATCH/DELETE. Browser CSP limits API connections to this origin and its local hot-reload socket. It uses no real sign-in and therefore does not verify authentication.

## Checks before the image build

```sh
npm run test:preview
npm run test -- __tests__/settings-accounts-member-mode.test.tsx __tests__/coverage/source-coverage-panel.test.tsx
```

Inspect the affected page in the browser, try the relevant scenarios and capture the result; then review and checkpoint the source. Ten harness contract tests exercise the actual fixture route, existing coverage parser, refusal states, unknown-route failure and mutation rejection.

Preview results establish frontend behavior only. Actual backend changes still need mounted-route tests and a separately coordinated development backend/data source. Real authentication, scoped producer data, packaging and installation still require exact-image verification in the test installation. A live-backend preview slot is a separate follow-up requiring a concrete infrastructure/identity design; this slice creates no cloud resources or grants.
