/**
 * Decision inventory families: the ONE family list, fetch loop and per-family status every inventory surface uses.
 *
 * Each family is asked through the product Decision list proxy (`fetchDecisionInventoryList`) and answers as a typed
 * state (`DecisionFamilyAnswer`): served rows, a named refusal / abstention / unavailability, or an unrecognized
 * body. A surface maps served rows to its own item shape and shows every family that did not answer by name; it
 * never turns a missing answer into zero rows.
 *
 * Measured at backend candidate 64a25888 (closed-local capture, semantic-decision-inventory-slices-closed-v1): all
 * eight certified aliases answer `ready` for a selected system, including `kms` and `secret`; `dynamodb`, `rds`,
 * `subnet` and `vpc` answer `abstained` (INVENTORY_LIST_RESOURCE_TYPE_UNSUPPORTED).
 */

import type { InventoryNotAnsweredStatus } from "@/components/copilot/inventory-answer"
import { withAccountScope, type ProductScope } from "@/lib/account-scope"
import {
  DECISION_LIST_PROXY,
  decisionFamilyNotice,
  fetchDecisionInventoryList,
  type DecisionFamilyAnswer,
} from "@/lib/inventory-decision-client"

export type InventoryScope = Pick<ProductScope, "customerId" | "groupId" | "accountId" | "region">

export interface DecisionFamily {
  /** The alias the Decision list proxy is asked for. */
  alias: string
  /** The surface type its rows render as. */
  type: string
  category: string
  label: string
}

/** The /services page's Decision-listed families (unchanged by the extraction). */
export const DECISION_FAMILIES = [
  { alias: "kms", type: "KMSKey", category: "Security", label: "KMS keys" },
  { alias: "secret", type: "Secret", category: "Security", label: "Secrets" },
  { alias: "dynamodb", type: "DynamoDB", category: "Database", label: "DynamoDB tables" },
  { alias: "subnet", type: "Subnet", category: "Networking", label: "Subnets" },
] as const satisfies readonly DecisionFamily[]

/**
 * A selected system's families. Every certified alias is asked with the system, KMS keys and secrets included: the
 * list attributes each family to a system the same way, so none is omitted as "not a system resource". The four
 * families the list does not serve are asked too, so the page names their actual abstention instead of silently
 * leaving them out.
 */
export const DECISION_SYSTEM_FAMILIES = [
  { alias: "ec2", type: "EC2", category: "Compute", label: "EC2 instances" },
  { alias: "lambda", type: "Lambda", category: "Compute", label: "Lambda functions" },
  { alias: "s3", type: "S3", category: "Storage", label: "S3 buckets" },
  { alias: "iam-role", type: "IAMRole", category: "Security", label: "IAM roles" },
  { alias: "iam-policy", type: "IAMPolicy", category: "Security", label: "IAM policies" },
  { alias: "sg", type: "SecurityGroup", category: "Networking", label: "Security groups" },
  { alias: "kms", type: "KMSKey", category: "Security", label: "KMS keys" },
  { alias: "secret", type: "Secret", category: "Security", label: "Secrets" },
  { alias: "dynamodb", type: "DynamoDB", category: "Database", label: "DynamoDB tables" },
  { alias: "rds", type: "RDS", category: "Database", label: "RDS databases" },
  { alias: "subnet", type: "Subnet", category: "Networking", label: "Subnets" },
  { alias: "vpc", type: "VPC", category: "Networking", label: "VPCs" },
] as const satisfies readonly DecisionFamily[]

export type DecisionFamilyStatus = {
  alias: string
  label: string
  state: DecisionFamilyAnswer["kind"] | InventoryNotAnsweredStatus
  reasonCode: string | null
  listed: number | null
  notice: string | null
}

export interface DecisionFamilyResult<F extends DecisionFamily> {
  family: F
  answer: DecisionFamilyAnswer
  status: DecisionFamilyStatus
}

/** One family's status line: served count, or the named reason it did not answer. */
export function decisionFamilyStatus(family: DecisionFamily, answer: DecisionFamilyAnswer): DecisionFamilyStatus {
  const notice = decisionFamilyNotice(family.label, answer)
  if (answer.kind === "ready") {
    return { alias: family.alias, label: family.label, state: "ready", reasonCode: null, listed: answer.rows.length, notice }
  }
  if (answer.kind === "not_answered") {
    return { alias: family.alias, label: family.label, state: answer.status, reasonCode: answer.reasonCode, listed: null, notice }
  }
  return { alias: family.alias, label: family.label, state: "unrecognized", reasonCode: null, listed: null, notice }
}

/** Ask every family for one system, in the page's account scope, and return each answer with its status. */
export async function fetchDecisionFamilyAnswers<F extends DecisionFamily>(
  systemName: string,
  scope: InventoryScope,
  families: readonly F[],
  fetchImpl: typeof fetch = fetch,
): Promise<DecisionFamilyResult<F>[]> {
  const scopeQuery = new URL(withAccountScope(DECISION_LIST_PROXY, scope), "http://cyntro.local").searchParams
  return fetchDecisionFamilyAnswersInScope(systemName, scopeQuery, families, fetchImpl)
}

/** The same fetch loop for a surface that already built its scope query from `withAccountScope`. */
export async function fetchDecisionFamilyAnswersInScope<F extends DecisionFamily>(
  systemName: string,
  scopeQuery: URLSearchParams,
  families: readonly F[],
  fetchImpl: typeof fetch = fetch,
): Promise<DecisionFamilyResult<F>[]> {
  const answers = await Promise.all(
    families.map((family) => fetchDecisionInventoryList(family.alias, { system: systemName, scopeQuery }, fetchImpl)),
  )
  return families.map((family, index) => ({ family, answer: answers[index], status: decisionFamilyStatus(family, answers[index]) }))
}
