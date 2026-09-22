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

/** The caller's body lives on their `Request` object: we can see that it
 * exists, but reading it to replay it would consume the caller's stream. A hop
 * that would have to replay it is therefore replay-unsafe, not droppable. */
const UNREPLAYABLE_REQUEST_BODY = Symbol("cyntro.unreplayableRequestBody")

type CallerBody = BodyInit | null | undefined | typeof UNREPLAYABLE_REQUEST_BODY

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
  if (body === UNREPLAYABLE_REQUEST_BODY) return false
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
 *   * a hop that leaves it is handed to the platform with the token and the
 *     platform's own cross-origin credential headers removed, so the call
 *     still completes exactly as it did before the token existed;
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
  const signal = init.signal ?? (input instanceof Request ? input.signal : undefined)

  let method = (
    init.method ?? (input instanceof Request ? input.method : "GET")
  ).toUpperCase()

  // Read the body's PRESENCE without consuming anything.
  let body: CallerBody =
    init.body !== undefined && init.body !== null
      ? init.body
      : input instanceof Request && input.body !== null
        ? UNREPLAYABLE_REQUEST_BODY
        : undefined

  let currentUrl = startUrl
  let currentHeaders = headers

  // First hop goes out as the caller built it — same input object, same init,
  // so method, body, signal and every other field are theirs untouched. Only
  // the redirect mode changes, because following is the part we must own.
  let response = await originalFetch(input, {...init, headers, redirect: "manual"})

  for (let hop = 1; ; hop += 1) {
    if (!REDIRECT_STATUSES.has(response.status)) return response

    const location = response.headers.get("location")
    // A redirect status with no target is not a redirect to follow; the
    // platform hands it back, and so do we.
    if (location === null) return response

    if (hop > MAX_REDIRECT_HOPS) {
      throw new TypeError(
        `fetch: too many redirects (> ${MAX_REDIRECT_HOPS}) starting at ${startUrl.origin}${startUrl.pathname}`,
      )
    }

    let nextUrl: URL
    try {
      nextUrl = new URL(location, currentUrl)
    } catch {
      // Ambiguous target: refuse rather than guess where the credential and
      // the caller's request were meant to go.
      throw new TypeError(
        `fetch: backend redirect carried an unresolvable Location; refusing to guess a destination`,
      )
    }

    const nextHeaders = new Headers(currentHeaders)

    // The platform's method/body rewrite, reproduced so a manually followed
    // chain behaves like an automatically followed one.
    if ((response.status === 301 || response.status === 302) && method === "POST") {
      method = "GET"
      body = undefined
    } else if (response.status === 303 && method !== "GET" && method !== "HEAD") {
      method = "GET"
      body = undefined
    }

    if (body === undefined || body === null) {
      nextHeaders.delete("content-length")
      nextHeaders.delete("content-type")
    } else if (!isReplayableBody(body)) {
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
      for (const name of CROSS_ORIGIN_STRIPPED_HEADERS) nextHeaders.delete(name)

      // Nothing of ours is attached any more, so let the platform follow the
      // remainder exactly as it would have.
      return originalFetch(nextUrl.toString(), {
        ...init,
        method,
        headers: nextHeaders,
        body: body as BodyInit | null | undefined,
        signal,
        redirect: "follow",
      })
    }

    currentUrl = nextUrl
    currentHeaders = nextHeaders
    response = await originalFetch(nextUrl.toString(), {
      ...init,
      method,
      headers: nextHeaders,
      body: body as BodyInit | null | undefined,
      signal,
      redirect: "manual",
    })
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
