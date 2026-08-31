import { shouldRetryBackendStatus } from "@/lib/server/backend-response"

type CacheEntry = {
  data: unknown
  storedAt: number
  expiresAt: number
}

type ReadSuccess<T> = {
  ok: true
  data: T
  source: "backend" | "fresh-cache" | "coalesced" | "stale-cache"
  latencyMs: number
  staleAgeMs?: number
  staleReason?: string
}

type ReadFailure = {
  ok: false
  status?: number
  body?: string
  error: string
  timedOut: boolean
  latencyMs: number
}

export type ResilientBackendReadResult<T> = ReadSuccess<T> | ReadFailure

type ReadOptions = {
  key: string
  url: string
  attemptTimeoutMs: number
  attempts?: number
  freshTtlMs?: number
  staleTtlMs?: number
  retryDelayMs?: number
  init?: RequestInit
}

const STATE_KEY = Symbol.for("cyntro.resilientBackendRead")
type SharedState = {
  cache: Map<string, CacheEntry>
  inflight: Map<string, Promise<ResilientBackendReadResult<unknown>>>
}

function state(): SharedState {
  const shared = globalThis as typeof globalThis & { [STATE_KEY]?: SharedState }
  if (!shared[STATE_KEY]) {
    shared[STATE_KEY] = { cache: new Map(), inflight: new Map() }
  }
  return shared[STATE_KEY]
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (
    error.name === "AbortError" ||
    error.name === "TimeoutError" ||
    /timed? ?out|timeout/i.test(error.message)
  )
}

function staleResult<T>(entry: CacheEntry | undefined, reason: string, staleTtlMs: number): ReadSuccess<T> | null {
  if (!entry) return null
  const age = Date.now() - entry.storedAt
  if (age > staleTtlMs) return null
  return {
    ok: true,
    data: entry.data as T,
    source: "stale-cache",
    latencyMs: 0,
    staleAgeMs: age,
    staleReason: reason,
  }
}

async function executeRead<T>(options: Required<Omit<ReadOptions, "init">> & { init?: RequestInit }): Promise<ResilientBackendReadResult<T>> {
  const started = Date.now()
  let lastFailure: ReadFailure = {
    ok: false,
    error: "Backend request failed",
    timedOut: false,
    latencyMs: 0,
  }

  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), options.attemptTimeoutMs)
    try {
      const response = await fetch(options.url, {
        ...options.init,
        cache: "no-store",
        signal: controller.signal,
      })
      if (response.ok) {
        const data = await response.json() as T
        state().cache.set(options.key, {
          data,
          storedAt: Date.now(),
          expiresAt: Date.now() + options.freshTtlMs,
        })
        return {
          ok: true,
          data,
          source: "backend",
          latencyMs: Date.now() - started,
        }
      }

      const body = await response.text().catch(() => "")
      lastFailure = {
        ok: false,
        status: response.status,
        body,
        error: `Backend returned ${response.status}`,
        timedOut: false,
        latencyMs: Date.now() - started,
      }
      if (!shouldRetryBackendStatus(response.status)) break
    } catch (error) {
      lastFailure = {
        ok: false,
        error: errorMessage(error),
        timedOut: isTimeout(error),
        latencyMs: Date.now() - started,
      }
    } finally {
      clearTimeout(timer)
    }

    if (attempt < options.attempts) {
      await new Promise((resolve) => setTimeout(resolve, options.retryDelayMs))
    }
  }

  const stale = staleResult<T>(
    state().cache.get(options.key),
    lastFailure.timedOut ? "backend_timeout" : lastFailure.status ? `backend_${lastFailure.status}` : "backend_unreachable",
    options.staleTtlMs,
  )
  return stale ?? lastFailure
}

export async function resilientBackendJsonRead<T>(options: ReadOptions): Promise<ResilientBackendReadResult<T>> {
  const configured = {
    ...options,
    attempts: options.attempts ?? 2,
    freshTtlMs: options.freshTtlMs ?? 60_000,
    staleTtlMs: options.staleTtlMs ?? 24 * 60 * 60 * 1000,
    retryDelayMs: options.retryDelayMs ?? 300,
  }
  const now = Date.now()
  const cached = state().cache.get(options.key)
  if (cached && now <= cached.expiresAt) {
    return {
      ok: true,
      data: cached.data as T,
      source: "fresh-cache",
      latencyMs: 0,
    }
  }

  const existing = state().inflight.get(options.key)
  if (existing) {
    const result = await existing as ResilientBackendReadResult<T>
    return result.ok && result.source === "backend"
      ? { ...result, source: "coalesced" }
      : result
  }

  const pending = executeRead<T>(configured)
  state().inflight.set(options.key, pending as Promise<ResilientBackendReadResult<unknown>>)
  try {
    return await pending
  } finally {
    if (state().inflight.get(options.key) === pending) state().inflight.delete(options.key)
  }
}

export function clearResilientBackendReadState(): void {
  state().cache.clear()
  state().inflight.clear()
}
