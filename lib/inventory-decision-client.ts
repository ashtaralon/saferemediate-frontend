/**
 * One inventory family, read through the Decision-backed list, as a typed state.
 *
 * The reusable client half of the product Decision proxy
 * (`/api/proxy/resource-inventory/decision-list`). Every surface that lists a certified family
 * uses this instead of reading raw rows, and renders the state it returns:
 *
 *  - `ready`: the route served a Decision list. `rows` are the served items and carry only the
 *    fields the operation provides; a field it does not provide is absent, never a default.
 *  - `not_answered`: a refusal, an abstention or an unavailability, with its registered code.
 *    Never a number and never an empty list.
 *  - `unrecognized`: anything else, including a raw (non-Decision) body from an older backend.
 *    It is not shown as data, and there is no fallback to the raw read.
 *
 * Classification is `classifyInventoryResult`, the one pinned against the route's actual bodies.
 */

import {
  classifyInventoryResult,
  inventoryProvenanceToShow,
  type InventoryNotAnsweredStatus,
} from "@/components/copilot/inventory-answer"

export const DECISION_LIST_PROXY = "/api/proxy/resource-inventory/decision-list"

/**
 * The canonical resource type each certified alias lists, as the backend's list reader filters on it
 * (`unified/decision/readers.py` `CERTIFIED_INVENTORY_TYPES`, measured at backend f0bb444f). A served item carries
 * that canonical type, or the requested alias itself when the graph row names none (the reader's fallback). An
 * alias not in this table has no family to verify against, so its served rows are never shown as that family.
 */
export const DECISION_INVENTORY_CANONICAL_TYPES: Readonly<Record<string, string>> = {
  ec2: "ec2:instance",
  "iam-policy": "iam:policy",
  "iam-role": "iam:role",
  kms: "kms:key-authorization",
  lambda: "lambda:function",
  s3: "s3:bucket",
  secret: "secretsmanager:secret-authorization",
  sg: "ec2:security-group",
}

/** The served `InventoryListItem` fields (backend `unified/decision/operations/inventory_list.py`). */
export interface DecisionInventoryRow {
  stableId: string
  name: string
  arn: string
  resourceId: string
  resourceType: string
  region: string
  accountId: string
  state: string
  createdAt: string
}

export type DecisionFamilyAnswer =
  | {
      kind: "ready"
      alias: string
      rows: DecisionInventoryRow[]
      /** The route's total when it is an integer no smaller than the page, else null. */
      total: number | null
      /** The page is not the whole family (a next page exists or the answer was truncated). */
      hasMore: boolean
      /** The projection generation and its as-of time, only when the provenance names evidence. */
      generation: number | null
      lastSync: string | null
    }
  | {
      kind: "not_answered"
      alias: string
      status: InventoryNotAnsweredStatus
      reasonCode: string | null
      /** The proxy's HTTP status; null when the request never completed. */
      httpStatus: number | null
    }
  | { kind: "unrecognized"; alias: string; httpStatus: number | null }

const TYPED_CODE = /^[A-Z][A-Z0-9_]{2,127}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function text(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function rowOf(item: Record<string, unknown>): DecisionInventoryRow | null {
  if (typeof item.stable_id !== "string" || item.stable_id.length === 0) return null
  return {
    stableId: item.stable_id,
    name: text(item.name),
    arn: text(item.arn),
    resourceId: text(item.resource_id),
    resourceType: text(item.resource_type),
    region: text(item.region),
    accountId: text(item.account_id),
    state: text(item.state),
    createdAt: text(item.created_at),
  }
}

function refusedCode(body: unknown): string | null {
  if (!isRecord(body)) return null
  const detail = isRecord(body.detail) ? body.detail : null
  const candidate = body.reason_code ?? body.error_code ?? detail?.reason_code ?? detail?.error_code
  return typeof candidate === "string" && TYPED_CODE.test(candidate) ? candidate : null
}

/** A non-2xx from the proxy: identity and scope refusals are refusals; everything else is unavailability. */
function statusForHttp(httpStatus: number): InventoryNotAnsweredStatus {
  return httpStatus === 400 || httpStatus === 401 || httpStatus === 403 || httpStatus === 409 ? "refused" : "unavailable"
}

/** Decide what one proxy response says. Exported so tests can drive it with the route's actual bodies. */
export function decisionFamilyAnswerFrom(alias: string, httpStatus: number, body: unknown): DecisionFamilyAnswer {
  if (httpStatus < 200 || httpStatus > 299) {
    return { kind: "not_answered", alias, status: statusForHttp(httpStatus), reasonCode: refusedCode(body), httpStatus }
  }
  if (!isRecord(body) || !("result" in body)) return { kind: "unrecognized", alias, httpStatus }

  const answer = classifyInventoryResult(body.result)
  if (answer.kind === "not_answered") {
    return { kind: "not_answered", alias, status: answer.status, reasonCode: answer.reasonCode, httpStatus }
  }
  if (answer.kind !== "list" || !answer.decisionBacked) return { kind: "unrecognized", alias, httpStatus }

  // A served list must be the family that was asked for, and every row must belong to it. Anything else is
  // withheld whole rather than labelled as the requested family.
  const canonical = DECISION_INVENTORY_CANONICAL_TYPES[alias]
  const result = body.result as Record<string, unknown>
  if (canonical === undefined || result.resource_type !== alias) return { kind: "unrecognized", alias, httpStatus }

  const rows: DecisionInventoryRow[] = []
  for (const item of answer.items) {
    const row = rowOf(item)
    // An item without its stable identity breaks the operation's item contract: the whole
    // answer is withheld rather than partly rendered.
    if (!row) return { kind: "unrecognized", alias, httpStatus }
    if (row.resourceType !== canonical && row.resourceType !== alias) return { kind: "unrecognized", alias, httpStatus }
    rows.push(row)
  }

  const provenance = inventoryProvenanceToShow(body.result, isRecord(body.provenance) ? body.provenance : null)
  const servingGraph = isRecord(provenance?.freshness) && isRecord(provenance.freshness.serving_graph)
    ? provenance.freshness.serving_graph
    : null
  const generation =
    servingGraph && typeof servingGraph.generation === "number" && Number.isInteger(servingGraph.generation)
      ? servingGraph.generation
      : null
  const lastSync = servingGraph && typeof servingGraph.last_sync === "string" ? servingGraph.last_sync : null

  return { kind: "ready", alias, rows, total: answer.total, hasMore: answer.hasMore, generation, lastSync }
}

export interface DecisionListRequest {
  system: string
  /** Scope params the page already carries (`withAccountScope` output is accepted as-is). */
  scopeQuery?: URLSearchParams
  limit?: number
}

export async function fetchDecisionInventoryList(
  alias: string,
  { system, scopeQuery, limit = 100 }: DecisionListRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<DecisionFamilyAnswer> {
  const query = new URLSearchParams(scopeQuery)
  query.set("resource_type", alias)
  query.set("system", system)
  query.set("limit", String(limit))

  let response: Response
  try {
    response = await fetchImpl(`${DECISION_LIST_PROXY}?${query.toString()}`, { cache: "no-store" })
  } catch {
    return { kind: "not_answered", alias, status: "unavailable", reasonCode: null, httpStatus: null }
  }
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    body = null
  }
  return decisionFamilyAnswerFrom(alias, response.status, body)
}

/** The one line a surface shows for a family that did not answer, or that answered only in part. */
export function decisionFamilyNotice(label: string, answer: DecisionFamilyAnswer): string | null {
  if (answer.kind === "not_answered") {
    const code = answer.reasonCode ? ` (${answer.reasonCode})` : ""
    const verb =
      answer.status === "abstained"
        ? "not certified for Decision serving"
        : answer.status === "refused"
          ? "refused"
          : answer.status === "not_ready"
            ? "not ready"
            : "unavailable"
    return `${label}: ${verb}${code}`
  }
  if (answer.kind === "unrecognized") {
    const http = answer.httpStatus === null ? "" : ` (HTTP ${answer.httpStatus})`
    return `${label}: the response was not a recognized Decision answer${http}`
  }
  if (answer.hasMore) {
    const of = answer.total !== null ? ` of ${answer.total}` : ""
    return `${label}: showing the first ${answer.rows.length}${of}; the rest are not listed here`
  }
  return null
}
