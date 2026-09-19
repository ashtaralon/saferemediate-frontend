"use client"

import { useState, useEffect } from "react"
import { Database, ChevronDown, ChevronRight } from "lucide-react"
import { IdentityDataAccessPanel } from "@/components/identities/identity-data-access-panel"
import { fetchIdentityDataAccess, type IdentityDataAccessBody } from "@/lib/identity-data-access"

interface DataPlaneProps {
  identityName: string
  detail: any
  identity: any
  onRemediate: (result: any) => void
}

// The data-access answer observes access and authorizes nothing, so this plane offers no remediation
// action from it (see components/identities/identity-data-access-panel.tsx).
export function DataPlane({ identityName, identity }: DataPlaneProps) {
  const [dataAccess, setDataAccess] = useState<IdentityDataAccessBody | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(true)
  const identityArn: string | undefined = identity?.arn

  useEffect(() => {
    let current = true
    setLoading(true)
    fetchIdentityDataAccess(identityName, identityArn).then((body) => {
      if (!current) return
      setDataAccess(body)
      setLoading(false)
    })
    return () => { current = false }
  }, [identityName, identityArn])

  const ready = dataAccess?.answer.status === "ready"
  const covered = ready
    ? [...(dataAccess?.dataStoresStatus.servicesCovered ?? []), ...(dataAccess?.tableAccessStatus.servicesCovered ?? [])]
    : []

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border, #e2e8f0)" }}>
      {/* Plane Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-6 py-4 hover:opacity-90 transition-opacity"
        style={{ background: "#22c55e08" }}
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown className="w-5 h-5" style={{ color: "#22c55e" }} /> : <ChevronRight className="w-5 h-5" style={{ color: "#22c55e" }} />}
          <Database className="w-5 h-5" style={{ color: "#22c55e" }} />
          <span className="text-base font-semibold" style={{ color: "var(--text-primary, #0f172a)" }}>Data Plane</span>
          {covered.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded" style={{ background: "#22c55e15", color: "#22c55e" }}>{covered.join(" + ")}</span>
          )}
        </div>
        <div className="flex items-center gap-4 text-sm">
          {ready && dataAccess && dataAccess.summary.totalDataStores !== null && (
            <span data-testid="data-plane-counts" style={{ color: "var(--text-secondary, #64748b)" }}>
              {dataAccess.summary.totalDataStores}{dataAccess.summary.countsAreLowerBounds ? "+" : ""} data store(s)
              {" · "}
              <span style={{ color: "#22c55e" }}>
                {dataAccess.summary.totalObservedOps}{dataAccess.summary.countsAreLowerBounds ? "+" : ""} observed operation(s)
              </span>
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-6 py-5" style={{ background: "var(--bg-surface, #ffffff)" }}>
          <IdentityDataAccessPanel loading={loading} body={dataAccess} />
        </div>
      )}
    </div>
  )
}
