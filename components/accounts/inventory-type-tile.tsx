/**
 * A resource type's icon tile for the account inventory: its color and icon, from lib/inventory-types.ts's explicit table --
 * never the fuzzy service resolver, which reads "ec2:subnet" as an EC2 instance. Always shown beside the type's own visible
 * label, so it is hidden from assistive technology (the type is never announced twice); the title names it on hover.
 */
import { inventoryTypeMeta } from "@/lib/inventory-types"

export function InventoryTypeTile({ resourceType, size = 28 }: { resourceType: string; size?: number }) {
  const meta = inventoryTypeMeta(resourceType)
  const { Icon, accent, bgLight, bdLight } = meta.service
  return (
    <span
      aria-hidden
      title={meta.label}
      data-testid="inventory-type-tile"
      data-resource-type={resourceType}
      className="inline-flex shrink-0 items-center justify-center rounded-md border"
      style={{ width: size, height: size, background: bgLight, borderColor: bdLight, color: accent }}
    >
      <Icon size={Math.round(size * 0.55)} color={accent} aria-hidden />
    </span>
  )
}
