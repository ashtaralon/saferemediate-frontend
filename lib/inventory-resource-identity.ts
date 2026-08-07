type InventoryResourceIdentity = {
  arn?: unknown
  resource_id?: unknown
  instance_id?: unknown
  id?: unknown
  name?: unknown
}

/**
 * Select the stable graph/AWS identity passed to resource detail endpoints.
 * Display names are the final fallback only; they are not globally unique.
 */
export function canonicalInventoryResourceId(resource: InventoryResourceIdentity): string {
  for (const value of [
    resource.arn,
    resource.resource_id,
    resource.instance_id,
    resource.id,
    resource.name,
  ]) {
    if (typeof value === "string" && value.trim()) return value
  }
  return "Unknown"
}
