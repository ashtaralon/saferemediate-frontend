// Sign in ONCE for the fixture specs, outside any traced test, and store only the issued session.
//
// fixture-e2e.yml runs this after the app is up. It POSTs the per-run SITE_PASSWORD to the real
// /api/auth/login and writes a Playwright storage-state file holding exactly one cookie -- the
// sealed session the server issued -- to $SITE_SESSION_STATE (mode 600, under $RUNNER_TEMP, which
// is never uploaded). The specs load that file (tests/integration/live-auth.ts seedAuthCookie), so
// no application spec sends the password and no trace can record it.
//
// Prints no value: not the password, not the session. Exits non-zero, naming the failed stage, if
// sign-in does not return a sealed session.
import { chmodSync, writeFileSync } from "node:fs"
import { request } from "@playwright/test"

const COOKIE = "cyntro_auth"
const base = new URL(process.env.FRONTEND_URL || "http://localhost:3000").origin
const out = process.env.SITE_SESSION_STATE
const password = process.env.SITE_PASSWORD

function fail(stage) {
  console.error(`site-session bootstrap failed: ${stage}`)
  process.exit(1)
}

if (!out) fail("SITE_SESSION_STATE is not set")
if (!password) fail("SITE_PASSWORD is not set")

const context = await request.newContext({ baseURL: base })
let issued = ""
try {
  let response
  try {
    response = await context.post("/api/auth/login", { data: { password }, failOnStatusCode: false })
  } catch (error) {
    // The error's class only: a transport error's message and call log are not ours to print.
    fail(`sign-in request did not complete (${error?.name ?? "Error"})`)
  }
  if (response.status() !== 200) fail(`sign-in answered HTTP ${response.status()}`)
  const header = response
    .headersArray()
    .find((h) => h.name.toLowerCase() === "set-cookie" && h.value.startsWith(`${COOKIE}=`))
  issued = header?.value.slice(COOKIE.length + 1).split(";")[0] ?? ""
} finally {
  await context.dispose()
}
if (!issued.startsWith("v1.")) fail("sign-in returned no sealed session cookie")

const host = new URL(base).hostname
const state = {
  cookies: [{
    name: COOKIE, value: issued, domain: host, path: "/", expires: -1,
    httpOnly: true, secure: base.startsWith("https"), sameSite: "Strict",
  }],
  origins: [],
}
writeFileSync(out, JSON.stringify(state), { mode: 0o600 })
chmodSync(out, 0o600)
console.log("site session issued by /api/auth/login and stored for the fixture specs")
