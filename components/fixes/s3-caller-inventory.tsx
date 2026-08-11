"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, Network, ShieldCheck, TriangleAlert } from "lucide-react"

import type { S3EnforcementCallerSummary } from "@/components/topology-v0-2/estate-operations"
import { ServiceTypeBadge, getServiceMeta } from "@/lib/service-type"

const PATH_META = {
  PRIVATE_VPCE: {
    label: "Private endpoint",
    detail: "Keeps access",
    color: "#0E8B7A",
    background: "#ECFDF8",
    Icon: ShieldCheck,
  },
  PUBLIC_PATH: {
    label: "Public S3 path",
    detail: "Migrate before enforcement",
    color: "#B45309",
    background: "#FFF7ED",
    Icon: TriangleAlert,
  },
  OUTSIDE_VPC: {
    label: "Outside VPC",
    detail: "Review exemption or access",
    color: "#B45309",
    background: "#FFF7ED",
    Icon: Network,
  },
  UNKNOWN_PATH: {
    label: "Path not resolved",
    detail: "Cyntro evidence required",
    color: "#B45309",
    background: "#FFF7ED",
    Icon: TriangleAlert,
  },
} as const

const GROUP_ORDER: S3EnforcementCallerSummary["path_status"][] = [
  "PRIVATE_VPCE",
  "PUBLIC_PATH",
  "OUTSIDE_VPC",
  "UNKNOWN_PATH",
]

function shortPrincipal(arn: string) {
  const roleMarker = ":role/"
  const roleIndex = arn.indexOf(roleMarker)
  if (roleIndex >= 0) return arn.slice(roleIndex + roleMarker.length)
  return arn.split(":").at(-1) || arn
}

export function S3CallerInventory({ callers }: { callers: S3EnforcementCallerSummary[] }) {
  const [open, setOpen] = useState(false)

  return (
    <section className="rounded-2xl border border-slate-200 bg-white" data-testid="s3-caller-inventory">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
        aria-expanded={open}
        data-testid="s3-caller-inventory-toggle"
      >
        <span>
          <span className="block text-sm font-bold text-slate-900">Who uses this bucket?</span>
          <span className="mt-0.5 block text-xs text-slate-600">
            View {callers.length} observed caller{callers.length === 1 ? "" : "s"}, service types, and network paths.
          </span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-teal-600 px-3 py-1.5 text-xs font-bold text-teal-700">
          {open ? "Hide callers" : `View ${callers.length} callers`}
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {open ? (
        <div className="space-y-4 border-t border-slate-200 p-4" data-testid="s3-caller-inventory-list">
          {GROUP_ORDER.map((status) => {
            const rows = callers.filter((caller) => caller.path_status === status)
            if (!rows.length) return null
            const meta = PATH_META[status]
            const PathIcon = meta.Icon
            return (
              <div key={status}>
                <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-700">
                  <PathIcon className="h-4 w-4" style={{ color: meta.color }} />
                  {meta.label} ({rows.length})
                </div>
                <div className="space-y-2">
                  {rows.map((caller) => {
                    const service = getServiceMeta(caller.resource_type)
                    const outOfScope = caller.scope_status === "OUT_OF_SCOPE"
                    const exempted = caller.scope_status === "EXEMPTED"
                    const exactRoleCovered = caller.scope_status === "SUPPORTED" && !!caller.scope_reason
                    const detail = exempted ? "Exact role exemption reviewed" : (outOfScope ? "Not changed" : (exactRoleCovered ? "Covered by exact role" : meta.detail))
                    return (
                      <article key={`${status}:${caller.resource_id}`} className="grid gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-[auto_minmax(0,1fr)_minmax(180px,0.8fr)]">
                        <ServiceTypeBadge type={caller.resource_type} size={42} />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold text-slate-900" title={caller.resource_name}>{caller.resource_name}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                            <span className="font-semibold">{service.label}</span>
                            <span>Resource: <span className="font-mono">{caller.resource_id}</span></span>
                          </div>
                          <div className="mt-1 text-[11px] text-slate-500">
                            IAM principal: {caller.principal_arns.length
                              ? caller.principal_arns.map(shortPrincipal).join(", ")
                              : "Not resolved"}
                          </div>
                        </div>
                        <div className="rounded-lg px-3 py-2 text-[11px]" style={{ background: meta.background }}>
                          <div className="font-bold" style={{ color: meta.color }}>{detail}</div>
                          <div className="mt-1 text-slate-600">
                            {caller.vpc_id ? `VPC ${caller.vpc_id}` : "No VPC attachment observed"}
                          </div>
                          <div className="mt-0.5 text-slate-600">
                            {caller.vpce_id ? `Endpoint ${caller.vpce_id}` : meta.label}
                          </div>
                          {caller.scope_reason ? (
                            <div className={`mt-1 font-medium ${outOfScope || exempted ? "text-amber-800" : "text-teal-800"}`}>
                              {caller.scope_reason || "This caller is outside the current automation scope."}
                            </div>
                          ) : null}
                        </div>
                      </article>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}
