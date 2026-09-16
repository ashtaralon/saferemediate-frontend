/**
 * What an inventory answer actually says, decided before anything is rendered.
 *
 * Order matters and is the point:
 *  1. A result that names a refusal, an abstention or an unavailability is NOT an answer,
 *     whatever else it carries. It is shown with its registered code and never as a number.
 *  2. A Decision-backed result (it carries `serve_state`) that is not explicitly
 *     `status: "ready"` is not an answer either.
 *  3. A number is shown only for an unambiguous ready shape: an integer `count` with no
 *     `items`, or an `items` array with no `count`.
 *  4. Anything else is named as unrecognized rather than rendered as zero.
 *
 * The shapes are the backend's: today's legacy envelope result, and the Decision mapping
 * Semantic proposed for the `envelope=true` route (status ready | refused | abstained |
 * unavailable, `reason_code`, `reason_category`, `failing_axes`).
 */

export type InventoryNotAnsweredStatus = "refused" | "abstained" | "unavailable" | "not_ready"

export type InventoryAnswer =
  | {
      kind: "count"
      count: number
      displayName: string | null
      system: string | null
      decisionBacked: boolean
    }
  | {
      kind: "list"
      items: Record<string, unknown>[]
      columns: string[]
      displayName: string | null
      system: string | null
      hasMore: boolean
      sort: string | null
      filtersApplied: Record<string, string>
      decisionBacked: boolean
    }
  | {
      kind: "not_answered"
      status: InventoryNotAnsweredStatus
      reasonCode: string | null
      reasonCategory: string | null
      failingAxes: string[]
    }
  | { kind: "unrecognized" }

const NOT_ANSWERED = new Set(["refused", "abstained", "unavailable"])
// Shown only when a list result names no columns: fields the items actually carry.
const FALLBACK_COLUMNS = ["name", "resource_id", "region", "state", "account_id"]
const TYPED_CODE = /^[A-Z][A-Z0-9_]{2,127}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function code(value: unknown): string | null {
  return typeof value === "string" && TYPED_CODE.test(value) ? value : null
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

function reasonCodeOf(result: Record<string, unknown>): string | null {
  const listed = Array.isArray(result.reason_codes) ? result.reason_codes.map(code).find(Boolean) : null
  return code(result.reason_code) ?? code(result.error_code) ?? listed ?? null
}

function axesOf(result: Record<string, unknown>): string[] {
  return Array.isArray(result.failing_axes) ? result.failing_axes.filter((axis): axis is string => typeof axis === "string") : []
}

export function classifyInventoryResult(result: unknown): InventoryAnswer {
  if (!isRecord(result)) return { kind: "unrecognized" }

  if (typeof result.status === "string" && NOT_ANSWERED.has(result.status)) {
    return {
      kind: "not_answered",
      status: result.status as InventoryNotAnsweredStatus,
      reasonCode: reasonCodeOf(result),
      reasonCategory: stringOrNull(result.reason_category),
      failingAxes: axesOf(result),
    }
  }

  const decisionBacked = "serve_state" in result
  if (decisionBacked && result.status !== "ready") {
    if (result.serve_state === "NOT_READY") {
      return {
        kind: "not_answered",
        status: "not_ready",
        reasonCode: reasonCodeOf(result),
        reasonCategory: stringOrNull(result.reason_category),
        failingAxes: axesOf(result),
      }
    }
    return { kind: "unrecognized" }
  }
  if (!decisionBacked && result.status !== undefined && result.status !== "ready") {
    return { kind: "unrecognized" }
  }

  const hasCount = typeof result.count === "number" && Number.isInteger(result.count) && result.count >= 0
  const hasItems = Array.isArray(result.items)
  if (hasCount && result.items === undefined) {
    return {
      kind: "count",
      count: result.count as number,
      displayName: stringOrNull(result.display_name),
      system: stringOrNull(result.system),
      decisionBacked,
    }
  }
  if (hasItems && result.count === undefined) {
    const items = (result.items as unknown[]).filter(isRecord)
    if (items.length !== (result.items as unknown[]).length) return { kind: "unrecognized" }
    const named = Array.isArray(result.columns) ? result.columns.filter((column): column is string => typeof column === "string") : []
    const columns = named.length > 0 ? named : FALLBACK_COLUMNS.filter((column) => items.some((item) => column in item))
    const filters = isRecord(result.filters_applied) ? result.filters_applied : {}
    return {
      kind: "list",
      items,
      columns,
      displayName: stringOrNull(result.display_name),
      system: stringOrNull(result.system),
      hasMore: Boolean(result.next_cursor) || result.has_next === true,
      sort: stringOrNull(result.sort) ?? stringOrNull(result.default_sort),
      filtersApplied: Object.fromEntries(Object.entries(filters).map(([key, value]) => [key, String(value)])),
      decisionBacked,
    }
  }
  return { kind: "unrecognized" }
}

/**
 * The envelope's provenance describes the legacy graph read. An inventory answer that is not
 * that read keeps no badge: a refusal, an abstention, anything unrecognized, or a
 * Decision-backed answer, whose freshness is the Decision runtime's. Measured on the real
 * decorator, a lifecycle refusal with zero graph reads was otherwise badged "Neptune
 * Serving Graph", completeness "complete".
 */
export function inventoryProvenanceToShow<P>(result: unknown, provenance: P | null): P | null {
  const answer = classifyInventoryResult(result)
  if ((answer.kind === "count" || answer.kind === "list") && !answer.decisionBacked) return provenance
  return null
}

export function refusalExplanation(status: number): string {
  if (status === 401 || status === 403) {
    return "Cyntro refused this question: the authenticated identity or system scope does not allow it."
  }
  if (status === 409) return "Cyntro refused this question because the requested scope conflicts with the verified one."
  return "Cyntro could not answer this question right now."
}
