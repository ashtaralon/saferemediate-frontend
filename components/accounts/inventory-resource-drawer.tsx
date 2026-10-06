"use client"

/**
 * One inventory resource, drilled down: what it is and where (account, Region, its identifiers), the type's allowed details
 * exactly as collected (lib/inventory-details.ts), the facts that make it internet-facing (each named as the fact, never a
 * verdict), its tags, and when it was last verified. Read-only. Everything shown is the row as served; nothing is inferred.
 * Customer free text (a tag, a security group's description) is rendered as text only.
 */
import { useEffect } from "react"
import { X } from "lucide-react"
import { InventoryTypeTile } from "@/components/accounts/inventory-type-tile"
import { formatUtcInstantExact } from "@/lib/account-admin"
import type { InventoryRow } from "@/lib/account-inventory"
import { detailLabel, formatDetail, internetFacingFacts } from "@/lib/inventory-details"
import { inventoryTypeMeta } from "@/lib/inventory-types"

const WITHHELD_TAGS: Record<string, string> = {
  TAGS_OVER_CAP: "too large to show",
  TAGS_NOT_TEXT: "not all text",
}

function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-2 py-1 text-xs">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`break-all text-slate-800 ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-slate-100 pt-3">
      <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">{title}</h3>
      {children}
    </section>
  )
}

export function InventoryResourceDrawer({
  row,
  accountLabel,
  onClose,
}: {
  row: InventoryRow
  /** The account as people know it ("Payments prod (111122223333)"), or its id. */
  accountLabel: string
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const meta = inventoryTypeMeta(row.resource_type)
  const facing = internetFacingFacts(row.resource_type, row.details)
  const name = row.name ?? row.native_id

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Resource ${name}`}
        data-testid="inventory-resource-drawer"
        className="flex h-full w-full max-w-md flex-col bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start gap-3 border-b border-slate-200 p-4">
          <InventoryTypeTile resourceType={row.resource_type} size={36} />
          <div className="min-w-0 flex-1">
            <h2 className="break-all text-sm font-semibold text-slate-900">{name}</h2>
            <p className="text-xs text-slate-600">
              {meta.label} <span className="font-mono text-slate-400">{row.resource_type}</span>
            </p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto space-y-3 p-4">
          {facing.length > 0 ? (
            <p data-testid="inventory-internet-facing" className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
              Internet-facing: {facing.join("; ")}
            </p>
          ) : null}

          <Section title="Where">
            <dl>
              <Fact label="Account" value={accountLabel} />
              <Fact label="Region" value={row.region === "global" ? "Global (account-wide)" : row.region} />
              <Fact label="Resource ID" value={row.native_id} mono />
              {row.arn ? <Fact label="ARN" value={row.arn} mono /> : null}
            </dl>
          </Section>

          <Section title="Details">
            {row.details === undefined ? (
              <p className="text-xs text-slate-500">Details appear after this account&apos;s next inventory publication.</p>
            ) : Object.keys(row.details).length === 0 ? (
              <p className="text-xs text-slate-500">No details were collected for this resource.</p>
            ) : (
              <dl data-testid="inventory-details">
                {Object.entries(row.details).map(([attribute, value]) => (
                  <Fact key={attribute} label={detailLabel(attribute)} value={formatDetail(attribute, value)} />
                ))}
              </dl>
            )}
            {row.details_withheld && row.details_withheld.length > 0 ? (
              <p className="mt-1 text-xs text-slate-500">
                Collected but not shown (not displayable): {row.details_withheld.map(detailLabel).join(", ")}.
              </p>
            ) : null}
          </Section>

          <Section title="Tags">
            {row.tags_withheld ? (
              <p className="text-xs text-slate-500">
                {row.tags_withheld.count} tags, not shown ({WITHHELD_TAGS[row.tags_withheld.reason] ?? row.tags_withheld.reason}).
              </p>
            ) : row.tags === undefined ? (
              <p className="text-xs text-slate-500">Tags are not collected for this resource type.</p>
            ) : Object.keys(row.tags).length === 0 ? (
              <p className="text-xs text-slate-500">No tags.</p>
            ) : (
              <dl data-testid="inventory-tags">
                {Object.entries(row.tags).map(([key, value]) => <Fact key={key} label={key} value={value} />)}
              </dl>
            )}
          </Section>

          <Section title="Evidence">
            <dl>
              <Fact label="Inventory status" value={row.state} />
              <Fact
                label="Last verified"
                value={row.observation.last_verified_at ? formatUtcInstantExact(row.observation.last_verified_at) : "—"}
              />
              {row.observation.configuration_hash ? (
                <Fact label="Configuration hash" value={row.observation.configuration_hash} mono />
              ) : null}
              <Fact label="Cyntro ID" value={row.resource_uid} mono />
            </dl>
          </Section>
        </div>
      </aside>
    </div>
  )
}
