import {getBackendBaseUrl} from "@/lib/server/backend-url"

const INSTALL_MARKER = Symbol.for("cyntro.customerBackendAuthFetch")

const SERVICE_TOKEN_HEADER = "X-Cyntro-Service-Token"

/** Statuses the platform's redirect follower acts on. */
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

/** Same bound the platform's own follower applies, so taking manual control
 * does not change how long a chain may run. */
const MAX_REDIRECT_HOPS = 20

/** Headers the platform drops when a redirect leaves the origin. We re-issue
 * the off-origin hop ourselves, so we have to drop them too — otherwise taking
 * manual control would WEAKEN what plain fetch already does. */
const CROSS_ORIGIN_STRIPPED_HEADERS = [
  "authorization",
  "cookie",
  "proxy-authorization",
  "host",
]

const REQUEST_BODY_HEADERS = [
  "content-encoding", "content-language", "content-location", "content-type", "content-length",
]

const CLONED_REQUEST_BODY = Symbol("cyntro.clonedRequestBody")

type CallerBody = BodyInit | null | undefined | typeof CLONED_REQUEST_BODY

/** Request properties are not enumerable, so spreading a Request loses them. */
function requestOptions(input: Parameters<typeof fetch>[0]): RequestInit {
  if (!(input instanceof Request)) return {}
  return {
    cache: input.cache,
    credentials: input.credentials,
    integrity: input.integrity,
    keepalive: input.keepalive,
    method: input.method,
    mode: input.mode,
    referrer: input.referrer,
    referrerPolicy: input.referrerPolicy,
    signal: input.signal,
  }
}

/** Read only the branch cloned before the first send. Cancellation must also
 * interrupt replay preparation, not just the subsequent network request. */
async function replayRequestBody(snapshot: Request, signal?: AbortSignal | null): Promise<ArrayBuffer> {
  const reader = snapshot.body!.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  const abort = () => { void reader.cancel(signal?.reason).catch(() => {}) }
  signal?.addEventListener("abort", abort, {once: true})
  try {
    signal?.throwIfAborted()
    for (;;) {
      const {done, value} = await reader.read()
      signal?.throwIfAborted()
      if (done) break
      chunks.push(value)
      length += value.byteLength
    }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return bytes.buffer
  } finally {
    signal?.removeEventListener("abort", abort)
    reader.releaseLock()
  }
}

function requestUrl(input: Parameters<typeof fetch>[0]): URL | null {
  try {
    const raw = typeof input === "string" || input instanceof URL ? input.toString() : input.url
    return new URL(raw)
  } catch {
    return null
  }
}

/** Origin of the backend this deployment talks to, or null if unresolvable.
 *
 * Resolution failing must never stop the server booting: no origin means no
 * header, which is exactly the behaviour before this function existed.
 */
function hostedBackendOrigin(): string | null {
  try {
    return new URL(getBackendBaseUrl()).origin
  } catch {
    return null
  }
}

/** Can this body be re-sent on another hop without re-reading a one-shot
 * source? Only values we still hold a replayable reference to qualify.
 *
 * Anything unrecognised — a ReadableStream, an async iterable, a future body
 * type — answers false. Absence of proof is not proof of safety here.
 */
function isReplayableBody(body: CallerBody): boolean {
  if (body === undefined || body === null) return true
  if (body === CLONED_REQUEST_BODY) return false
  if (typeof body === "string") return true
  if (body instanceof URLSearchParams) return true
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return true
  if (typeof Blob !== "undefined" && body instanceof Blob) return true
  if (typeof FormData !== "undefined" && body instanceof FormData) return true
  return false
}

/** Follow a redirect chain that started at the backend origin, keeping the
 * service token strictly inside that origin.
 *
 * The platform's own follower replays every header except a small credential
 * set across a redirect, and our token lives in a custom header — so a 302
 * from the backend to any other host would hand the token to whatever
 * answered. Verified against Node 20 undici, not assumed: a custom header
 * survives a cross-origin redirect where `Authorization` does not.
 *
 * Rules, in order:
 *   * a hop that stays on the EXACT backend origin keeps the token and keeps
 *     working — this is not "never redirect";
 *   * a hop that leaves it loses the token and the platform's own cross-origin
 *     credential headers; all later hops remain manual under the same limit;
 *   * an unparseable target, an over-long chain, or a body that cannot be
 *     safely replayed fails closed rather than guessing.
 */
async function followWithinBackendOrigin(
  originalFetch: typeof fetch,
  input: Parameters<typeof fetch>[0],
  init: RequestInit,
  startUrl: URL,
  backendOrigin: string,
  headers: Headers,
): Promise<Response> {
  const options = {...requestOptions(input)}
  // Undefined dictionary members do not override a Request's existing value.
  for (const [key, value] of Object.entries(init)) {
    if (value !== undefined) Object.assign(options, {[key]: value})
  }
  const signal = options.signal

  let method = (
    init.method ?? (input instanceof Request ? input.method : "GET")
  ).toUpperCase()

  // Clone before fetch consumes the original Request. Only read this branch
  // if a redirect preserves its body; cancel it on every other exit.
  const snapshot = input instanceof Request && input.body !== null && init.body == null
    ? input.clone()
    : null
  let body: CallerBody =
    init.body !== undefined && init.body !== null
      ? init.body
      : snapshot
        ? CLONED_REQUEST_BODY
        : undefined

  let currentUrl = startUrl
  let currentHeaders = headers

  // Supplying init to fetch(Request) can reset inherited referrer settings.
  // Carry the resolved Request options explicitly on the first hop too.
  try {
    let response = await originalFetch(input, {...options, headers, redirect: "manual"})

    for (let hop = 1; ; hop += 1) {
      if (!REDIRECT_STATUSES.has(response.status)) return response

      const location = response.headers.get("location")
      // A redirect status with no target is not a redirect to follow; the
      // platform hands it back, and so do we.
      if (location === null) return response

      if (hop > MAX_REDIRECT_HOPS) {
        void response.body?.cancel().catch(() => {})
        throw new TypeError(
          `fetch: too many redirects (> ${MAX_REDIRECT_HOPS}) starting at ${startUrl.origin}${startUrl.pathname}`,
        )
      }

      let nextUrl: URL
      try {
        nextUrl = new URL(location, currentUrl)
      } catch {
        void response.body?.cancel().catch(() => {})
        // Ambiguous target: refuse rather than guess where the credential and
        // the caller's request were meant to go.
        throw new TypeError(
          `fetch: backend redirect carried an unresolvable Location; refusing to guess a destination`,
        )
      }

      // Native redirect following permits only HTTP(S), even though a fresh
      // fetch could accept another scheme such as data:.
      if (!["http:", "https:"].includes(nextUrl.protocol) || nextUrl.username || nextUrl.password) {
        void response.body?.cancel().catch(() => {})
        throw new TypeError("fetch: backend redirect has an unsupported or credential-bearing URL")
      }
      if (options.mode === "same-origin" && nextUrl.origin !== startUrl.origin) {
        void response.body?.cancel().catch(() => {})
        throw new TypeError("fetch: redirect leaves a same-origin request's origin")
      }

      const nextHeaders = new Headers(currentHeaders)

      // The platform's method/body rewrite, reproduced so a manually followed
      // chain behaves like an automatically followed one.
      const discardsBody = ((response.status === 301 || response.status === 302) && method === "POST") ||
        (response.status === 303 && method !== "GET" && method !== "HEAD")
      if (discardsBody) {
        method = "GET"
        body = undefined
        for (const name of REQUEST_BODY_HEADERS) nextHeaders.delete(name)
      }

      void response.body?.cancel().catch(() => {})
      if (body === CLONED_REQUEST_BODY && snapshot) {
        body = await replayRequestBody(snapshot, signal)
      }
      if (!isReplayableBody(body)) {
        // The hop preserves the body and we cannot re-send it. Dropping it would
        // silently turn a write into a different request; re-sending a consumed
        // stream would fail or, worse, send a truncated one.
        throw new TypeError(
          `fetch: backend redirect (${response.status}) requires replaying a request body that cannot be safely replayed; refusing to drop or re-send it`,
        )
      }

      if (nextUrl.origin !== backendOrigin) {
        // Leaving the backend origin. The token goes no further, and neither do
        // the credential headers the platform itself strips here.
        nextHeaders.delete(SERVICE_TOKEN_HEADER)
      }
      if (nextUrl.origin !== currentUrl.origin) {
        for (const name of CROSS_ORIGIN_STRIPPED_HEADERS) nextHeaders.delete(name)
      }

      currentUrl = nextUrl
      currentHeaders = nextHeaders
      response = await originalFetch(nextUrl.toString(), {
        ...options,
        method,
        headers: nextHeaders,
        body: body as BodyInit | null | undefined,
        signal,
        redirect: "manual",
      })
    }
  } finally {
    // A tee branch's cancellation may wait for its sibling; do not hold a
    // completed response hostage to that cleanup.
    if (snapshot?.body && !snapshot.body.locked) void snapshot.body.cancel().catch(() => {})
  }
}

/** Attach the service token to every backend call this server makes.
 *
 * The backend's global auth boundary (unified/auth_boundary.py) has three
 * modes and ships in `observe`: it records whether a caller presented
 * `X-Cyntro-Service-Token` but blocks nothing. `enforce` is what actually
 * protects the API — including the ~45 mutating `/api/admin/*` handlers, none
 * of which carries a per-endpoint token check — and it cannot be switched on
 * while the only caller that authenticates is the customer-resident UI. This
 * server is that missing caller.
 *
 * Sending the header while the backend is still in `observe` changes no
 * behaviour; it makes the boundary's own telemetry show authenticated traffic,
 * which is the measurement the rollout is waiting on.
 *
 * Two shapes, one rule — only ever the backend's exact origin:
 *
 *   CUSTOMER_RESIDENT   token and BACKEND_URL_OVERRIDE are mandatory, and a
 *                       missing secret fails startup rather than silently
 *                       running unauthenticated.
 *   hosted (C1 / SaaS)  attaches the token when CYNTRO_SERVICE_TOKEN is set,
 *                       and is a no-op when it is not, so setting the variable
 *                       is what turns this on and nothing breaks before then.
 *
 * That exact-origin rule decides where the token is attached. It cannot decide
 * where a REDIRECT then carries it, which is why the credentialed call owns
 * its own redirect following — see followWithinBackendOrigin.
 */
export function installCustomerBackendAuthFetch(): void {
  const markedGlobal = globalThis as typeof globalThis & {[INSTALL_MARKER]?: boolean}
  if (markedGlobal[INSTALL_MARKER]) return

  const token = process.env.CYNTRO_SERVICE_TOKEN?.trim()
  let backendOrigin: string | null

  if (process.env.CYNTRO_DEPLOYMENT_MODE === "CUSTOMER_RESIDENT") {
    const backend = process.env.BACKEND_URL_OVERRIDE?.trim()
    if (!token || !backend) {
      throw new Error(
        "Customer-resident UI requires CYNTRO_SERVICE_TOKEN and BACKEND_URL_OVERRIDE",
      )
    }
    backendOrigin = new URL(backend).origin
  } else {
    // No token configured is the pre-rollout state, not a misconfiguration:
    // leave fetch untouched so the hosted deployment behaves exactly as before.
    if (!token) return
    backendOrigin = hostedBackendOrigin()
    if (!backendOrigin) return
  }

  const originalFetch = globalThis.fetch.bind(globalThis)
  const resolvedOrigin = backendOrigin

  globalThis.fetch = (input, init = {}) => {
    const url = requestUrl(input)
    if (!url || url.origin !== resolvedOrigin) return originalFetch(input, init)

    const inherited = input instanceof Request ? input.headers : undefined
    const headers = new Headers(init.headers ?? inherited)
    headers.set(SERVICE_TOKEN_HEADER, token)

    const callerRedirect =
      init.redirect ?? (input instanceof Request ? input.redirect : undefined) ?? "follow"

    // The caller asked to inspect redirects themselves ("manual") or to treat
    // one as an error ("error"). Either way nothing is followed automatically,
    // so the credential cannot be replayed anywhere — pass it straight through
    // and leave the caller's own handling exactly as it was.
    if (callerRedirect !== "follow") {
      return originalFetch(input, {...init, headers})
    }

    return followWithinBackendOrigin(
      originalFetch,
      input,
      init,
      url,
      resolvedOrigin,
      headers,
    )
  }
  markedGlobal[INSTALL_MARKER] = true
}
