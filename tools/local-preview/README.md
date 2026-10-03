# Local UI preview

Run `npm ci` then `npm run dev:preview` from this checkout. Open http://127.0.0.1:3210/settings/accounts. Edit the real files in `app/`, `components/` or `lib/`; Next refreshes them without an image build. Stop with Ctrl+C. The server binds only to loopback on port 3210.

The harness imports the actual Home, Accounts and Coverage pages, providers, parsers and styles. It is separate from the release app; its middleware and API routes are not changed. Do not deploy or publicly expose this harness.

## Real responses only

The preview starts with an explicit capture-required screen. It never generates accounts, populated evidence or successful empty backend responses. A missing exact request returns HTTP 503 `PREVIEW_CAPTURE_UNAVAILABLE`.

Capture the authenticated test installation's page GET responses with browser developer tools (HAR export), then import locally:

```sh
npm run preview:import -- /absolute/path/capture.har <frontend-40-character-commit> <backend-40-character-commit> https://app.local-test.cyntro.io
```

The importer copies only JSON bodies, HTTP status and timestamps from same-origin `/api/proxy/` GETs. It discards headers, cookies, authentication requests and other origins. HAR files can contain credentials: keep the original private, never commit it. Imported response bodies can still contain customer data: they remain in the gitignored `tools/local-preview/.local/responses.json`; never commit or share that directory. The importer is offline and performs no requests.

The banner shows capture time and source. These are recorded observations, not current backend state. Refresh captures after relevant backend changes. Query keys are exact (including tenant/account/region), so a request for a different scope cannot reuse another scope's answer. Do not add invented populated scenarios; wait for real workload data. Unit tests remain separate from what is displayed in the preview.

No capture currently means no product page is rendered. With a capture, unsupported reads fail visibly. The harness has no live forwarding, credential loading or AWS client. Its runner strips deployment environment variables; browser CSP limits API calls to this origin. All POST/PUT/PATCH/DELETE calls return HTTP 405, so Add account cannot register anything. This does not prove real authentication or enrollment.

## Validation and boundaries

Run `npm run test:preview`, then inspect the actual page in the browser. Home, Accounts and Coverage are the first supported frontend slice. Local hot reload verifies rendering and client logic. Actual backend changes still require routed API tests and a coordinated development backend; exact-image packaging, installation, scoped producer data and authenticated end-to-end behavior remain separate checks.
