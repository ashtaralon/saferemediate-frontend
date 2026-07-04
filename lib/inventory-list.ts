/**
 * Helpers for graph-backed inventory list rows
 * (`/api/proxy/resource-inventory/list`).
 */

export interface KmsListRow {
  id?: string | null
  arn?: string | null
  key_id?: string | null
  name?: string | null
  key_state?: string | null
  key_manager?: string | null
  region?: string | null
  [k: string]: any
}

/**
 * Collapse legacy KMS twin nodes into one row per real key.
 *
 * The graph carries duplicate :KMSKey nodes for some keys (BE-19): a
 * canonical ARN-keyed node plus a legacy node keyed by the bare key-id.
 * Either twin may hold the better display fields, so we group by key_id
 * and merge: the ARN-keyed twin supplies the id (what the inspector
 * resolves), and each display field takes the first real value across
 * twins — preferring a name that isn't just the key-id echoed back.
 */
export function dedupeKmsListRows(rows: KmsListRow[]): KmsListRow[] {
  const groups = new Map<string, KmsListRow[]>()
  for (const row of rows) {
    const groupKey = row.key_id || row.arn || row.id
    if (!groupKey) continue
    const bucket = groups.get(groupKey)
    if (bucket) bucket.push(row)
    else groups.set(groupKey, [row])
  }

  const isKeyArn = (v: unknown) => typeof v === "string" && v.startsWith("arn:aws:kms:")

  const merged: KmsListRow[] = []
  for (const twins of groups.values()) {
    const canonical = twins.find((t) => isKeyArn(t.id)) ?? twins[0]
    const pickName = () =>
      twins.map((t) => t.name).find((n) => n && n !== canonical.key_id) ??
      canonical.name ??
      canonical.key_id
    const pick = (field: keyof KmsListRow) =>
      twins.map((t) => t[field]).find((v) => v !== null && v !== undefined)
    merged.push({
      ...canonical,
      id: isKeyArn(canonical.id) ? canonical.id : (isKeyArn(pick("arn")) ? pick("arn") : canonical.id),
      name: pickName(),
      key_state: pick("key_state") ?? null,
      key_manager: pick("key_manager") ?? null,
      region: pick("region") ?? null,
    })
  }
  return merged
}
