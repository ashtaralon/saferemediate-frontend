/**
 * V2 Attack Canvas API client.
 *
 * Isolated file (does NOT live in lib/api-client.ts) so V2 can never
 * accidentally share helpers with V1. The only imports are the
 * generated DTO type contract.
 *
 * Imports allowed:
 *   - lib/types/attack-canvas (the typed DTO)
 *
 * Imports forbidden (these would compromise import isolation):
 *   - any V1 attacker-view-panel helpers
 *   - any bucketing / fuzzy-matching utilities
 *   - any V1 architecture-builder code
 */
import type { AttackCanvas } from "./types/attack-canvas"

const PROXY_URL = "/api/proxy/attack-chain/canvas"

export interface FetchCanvasArgs {
  systemName: string
  pathId: string
  signal?: AbortSignal
}

export interface FetchCanvasError {
  status: number
  message: string
  detail?: string
}

export type FetchCanvasResult =
  | { ok: true; canvas: AttackCanvas }
  | { ok: false; error: FetchCanvasError }

/**
 * Fetch the V2 attack canvas for a single (system, path) selection.
 *
 * Returns a discriminated union so the caller is forced to handle
 * the error branch — no silent throw, no console.error swallowing.
 * The proxy enforces a 55s server-side timeout; pass `signal` if
 * you need an additional client-side abort.
 */
export async function fetchAttackCanvas(
  args: FetchCanvasArgs,
): Promise<FetchCanvasResult> {
  const { systemName, pathId, signal } = args

  let response: Response
  try {
    response = await fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system_name: systemName, path_id: pathId }),
      signal,
    })
  } catch (err) {
    return {
      ok: false,
      error: {
        status: 0,
        message: "network_error",
        detail: err instanceof Error ? err.message : String(err),
      },
    }
  }

  if (!response.ok) {
    let detail: string | undefined
    try {
      const body = (await response.json()) as { detail?: string; error?: string }
      detail = body.detail ?? body.error
    } catch {
      // body wasn't JSON
    }
    return {
      ok: false,
      error: {
        status: response.status,
        message: `http_${response.status}`,
        detail,
      },
    }
  }

  let canvas: AttackCanvas
  try {
    canvas = (await response.json()) as AttackCanvas
  } catch (err) {
    return {
      ok: false,
      error: {
        status: response.status,
        message: "invalid_json_response",
        detail: err instanceof Error ? err.message : String(err),
      },
    }
  }

  return { ok: true, canvas }
}
