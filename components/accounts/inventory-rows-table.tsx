"use client"

/**
 * Inventory rows as a table. For ONE type (a group, or a type filter) the columns are that type's own: its summary details
 * and its honest date (lib/inventory-details.ts: an EC2 instance is "Launched", a Lambda function "Last modified"), plus tags
 * when the type's rows carry them. Rows of mixed types (an older backend's flat list) get the type as a column instead.
 * A name opens the resource's drill-down. A value is shown exactly as collected; a missing one is "—", never a guess.
 */
import { InventoryTypeTile } from "@/components/accounts/inventory-type-tile"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatUtcInstantExact } from "@/lib/account-admin"
import { rowKey, type InventoryRow } from "@/lib/account-inventory"
import { DATE_ATTRIBUTE, SUMMARY_COLUMNS, detailLabel, formatDetail, internetFacingFacts } from "@/lib/inventory-details"
import { inventoryTypeMeta } from "@/lib/inventory-types"

function detailCell(row: InventoryRow, attribute: string): string {
  const value = row.details?.[attribute]
  return value === undefined ? "—" : formatDetail(attribute, value)
}

function tagsCell(row: InventoryRow): string {
  if (row.tags_withheld) return `${row.tags_withheld.count} (not shown)`
  if (row.tags === undefined) return "—"
  const count = Object.keys(row.tags).length
  return count === 0 ? "None" : String(count)
}

export function InventoryRowsTable({
  rows,
  resourceType,
  onOpen,
}: {
  rows: InventoryRow[]
  /** The ONE type every row is of (a group or a filter), or null for a mixed list. */
  resourceType: string | null
  onOpen: (row: InventoryRow) => void
}) {
  const columns = resourceType ? SUMMARY_COLUMNS[resourceType] ?? [] : []
  const dateAttribute = resourceType ? DATE_ATTRIBUTE[resourceType] : undefined
  const showTags = resourceType !== null && rows.some((row) => row.tags !== undefined || row.tags_withheld !== undefined)

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          {resourceType === null ? <TableHead>Type</TableHead> : null}
          {columns.map((column) => <TableHead key={column}>{detailLabel(column)}</TableHead>)}
          {dateAttribute ? <TableHead>{detailLabel(dateAttribute)}</TableHead> : null}
          <TableHead>Region</TableHead>
          <TableHead>Inventory status</TableHead>
          {showTags ? <TableHead>Tags</TableHead> : null}
          {resourceType === null ? <TableHead>Last verified</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const facing = internetFacingFacts(row.resource_type, row.details)
          return (
            <TableRow key={rowKey(row)}>
              <TableCell className="text-xs">
                <button
                  type="button"
                  className="text-left font-mono text-teal-700 hover:underline"
                  onClick={() => onOpen(row)}
                >
                  {row.name ?? row.native_id}
                </button>
                {facing.length > 0 ? (
                  <span
                    title={facing.join("; ")}
                    className="ml-2 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800"
                  >
                    Internet-facing
                  </span>
                ) : null}
              </TableCell>
              {resourceType === null ? (
                <TableCell className="text-xs">
                  <span className="inline-flex items-center gap-2">
                    <InventoryTypeTile resourceType={row.resource_type} size={20} />
                    {inventoryTypeMeta(row.resource_type).label}
                  </span>
                </TableCell>
              ) : null}
              {columns.map((column) => <TableCell key={column} className="text-xs">{detailCell(row, column)}</TableCell>)}
              {dateAttribute ? <TableCell className="text-xs">{detailCell(row, dateAttribute)}</TableCell> : null}
              <TableCell className="text-xs">{row.region}</TableCell>
              <TableCell className="text-xs">{row.state}</TableCell>
              {showTags ? <TableCell className="text-xs">{tagsCell(row)}</TableCell> : null}
              {resourceType === null ? (
                <TableCell className="text-xs">
                  {row.observation.last_verified_at ? formatUtcInstantExact(row.observation.last_verified_at) : "—"}
                </TableCell>
              ) : null}
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
