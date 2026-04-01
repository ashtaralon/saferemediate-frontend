"use client"

import { useState, useEffect } from "react"
import {
  Database, HardDrive, Key, Lock, Eye, PenTool, Trash2,
  CheckCircle, XCircle, RefreshCw, ChevronDown, ChevronRight, Workflow,
} from "lucide-react"

interface DataPlaneProps {
  identityName: string
  detail: any
  identity: any
  onRemediate: (result: any) => void
}

const OP_COLORS: Record<string, string> = {
  READ: '#22c55e', LIST: '#3b82f6', WRITE: '#f97316', DELETE: '#ef4444',
  EXECUTE: '#a855f7', MODIFY: '#ef4444', ENCRYPT: '#a855f7', DECRYPT: '#3b82f6',
  INVOKE: '#06b6d4', SNAPSHOT: '#3b82f6', READ_METADATA: '#6b7280',
  SELECT: '#22c55e', INSERT: '#3b82f6', UPDATE: '#f97316',
  READ_POLICY: '#6b7280', WRITE_POLICY: '#f97316', START: '#22c55e', STOP: '#ef4444',
}

const ACCESS_LEVEL_COLORS: Record<string, string> = { FULL: '#ef4444', WRITE: '#f97316', READ: '#22c55e', NONE: '#6b7280' }
const TYPE_ICONS: Record<string, any> = { S3: HardDrive, RDS: Database, DynamoDB: Database, Lambda: Workflow, KMS: Lock, SecretsManager: Key }

export function DataPlane({ identityName, detail, identity, onRemediate }: DataPlaneProps) {
  const [dataAccess, setDataAccess] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(true)
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    fetchDataAccess()
  }, [identityName])

  const fetchDataAccess = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/proxy/identities/${encodeURIComponent(identityName)}/data-access`)
      if (res.ok) setDataAccess(await res.json())
    } catch (err) {
      console.error("Error fetching data access:", err)
    } finally {
      setLoading(false)
    }
  }

  const handleApplyS3Fix = async (bucketName: string) => {
    setApplying(true)
    try {
      const res = await fetch("/api/proxy/s3-buckets/remediate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bucket_name: bucketName,
          create_checkpoint: true,
        }),
      })
      if (res.ok) onRemediate(await res.json())
    } catch (err) {
      console.error("S3 remediation failed:", err)
    } finally {
      setApplying(false)
    }
  }

  const dataStores = dataAccess?.dataStores || []
  const tableAccess = dataAccess?.tableAccess || []
  const hasData = dataStores.length > 0 || tableAccess.length > 0

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
          <span className="text-xs px-2 py-0.5 rounded" style={{ background: "#22c55e15", color: "#22c55e" }}>S3 + RDS + DynamoDB</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          {dataAccess?.summary && (
            <>
              <span style={{ color: "var(--text-secondary, #64748b)" }}>{dataAccess.summary.totalDataStores || 0} data store(s)</span>
              <span style={{ color: "#22c55e" }}>{dataAccess.summary.totalObservedOps || 0} observed</span>
              <span style={{ color: "var(--text-secondary, #64748b)" }}>/ {dataAccess.summary.totalAllowedOps || 0} allowed</span>
              {dataAccess.summary.hasDestructiveAccess && (
                <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: "#ef444420", color: "#ef4444" }}>Destructive</span>
              )}
            </>
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-6 py-5 space-y-4" style={{ background: "var(--bg-surface, #ffffff)" }}>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-5 h-5 animate-spin" style={{ color: "#22c55e" }} />
              <span className="ml-2 text-sm" style={{ color: "var(--text-secondary, #64748b)" }}>Loading data access analysis...</span>
            </div>
          ) : hasData ? (
            <>
              {/* Data Store Cards (IAM-level) */}
              {dataStores.map((store: any, idx: number) => {
                const StoreIcon = TYPE_ICONS[store.type] || Database
                return (
                  <div key={idx} className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border, #e2e8f0)" }}>
                    <div className="flex items-center justify-between px-4 py-3" style={{ background: "var(--bg-secondary, #f8fafc)" }}>
                      <div className="flex items-center gap-2">
                        <StoreIcon className="w-4 h-4" style={{ color: "#22c55e" }} />
                        <span className="text-sm font-medium" style={{ color: "var(--text-primary, #334155)" }}>{store.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--bg-primary, #f1f5f9)", color: "var(--text-muted, #94a3b8)" }}>{store.type}</span>
                      </div>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{
                        background: `${ACCESS_LEVEL_COLORS[store.accessLevel] || '#6b7280'}20`,
                        color: ACCESS_LEVEL_COLORS[store.accessLevel] || '#6b7280',
                      }}>{store.accessLevel} ACCESS</span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 p-4">
                      {/* Configured */}
                      <div>
                        <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted, #94a3b8)" }}>Allowed Operations</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {store.allowedOperations?.length > 0 ? store.allowedOperations.map((op: string) => (
                            <span key={op} className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{
                              background: `${OP_COLORS[op] || '#6b7280'}15`,
                              color: OP_COLORS[op] || '#6b7280',
                            }}>{op}</span>
                          )) : <span className="text-[10px]" style={{ color: "var(--text-muted, #94a3b8)" }}>None</span>}
                        </div>
                      </div>

                      {/* Observed */}
                      <div>
                        <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted, #94a3b8)" }}>Observed (Used)</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {store.observedOperations?.length > 0 ? store.observedOperations.map((op: string) => (
                            <span key={op} className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{
                              background: `${OP_COLORS[op] || '#6b7280'}15`,
                              color: OP_COLORS[op] || '#6b7280',
                              border: `1px solid ${OP_COLORS[op] || '#6b7280'}40`,
                            }}>{op}</span>
                          )) : <span className="text-[10px]" style={{ color: "var(--text-muted, #94a3b8)" }}>No observed access</span>}
                        </div>
                      </div>
                    </div>

                    {/* Unused + Recommendation */}
                    {(store.unusedOperations?.length > 0 || store.recommendation) && (
                      <div className="px-4 pb-3">
                        {store.unusedOperations?.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1 mb-1.5">
                            <span className="text-[10px]" style={{ color: "#ef4444" }}>Unused:</span>
                            {store.unusedOperations.map((op: string) => (
                              <span key={op} className="text-[10px] px-1.5 py-0.5 rounded font-medium line-through" style={{ background: "#ef444410", color: "#ef4444" }}>{op}</span>
                            ))}
                          </div>
                        )}
                        {store.recommendation && (
                          <div className="text-xs p-2 rounded" style={{ background: "#f59e0b08", color: "#f59e0b" }}>
                            {store.recommendation}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Table-Level Access (from RDS query logs) */}
              {tableAccess.length > 0 && (
                <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border, #e2e8f0)" }}>
                  <div className="flex items-center gap-2 px-4 py-3" style={{ background: "var(--bg-secondary, #f8fafc)" }}>
                    <Database className="w-4 h-4" style={{ color: "#3b82f6" }} />
                    <span className="text-sm font-medium" style={{ color: "var(--text-primary, #334155)" }}>Table-Level Access</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#22c55e15", color: "#22c55e" }}>From RDS Query Logs</span>
                  </div>
                  <div className="divide-y" style={{ borderColor: "var(--border, #e2e8f0)" }}>
                    {tableAccess.map((t: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-medium" style={{ color: "var(--text-primary, #334155)" }}>
                            {t.schema !== 'public' ? `${t.schema}.` : ''}{t.tableName}
                          </span>
                          <span className="text-[10px]" style={{ color: "var(--text-muted, #94a3b8)" }}>({t.database})</span>
                          {t.viaDbUser && (
                            <span className="text-[10px] px-1 py-0.5 rounded font-mono" style={{ background: "#3b82f610", color: "#3b82f6" }}>via: {t.viaDbUser}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {(t.operations || []).map((op: string) => (
                            <span key={op} className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{
                              background: `${OP_COLORS[op] || '#6b7280'}15`,
                              color: OP_COLORS[op] || '#6b7280',
                            }}>{op}</span>
                          ))}
                          {t.accessCount > 0 && <span className="text-[10px]" style={{ color: "var(--text-muted, #94a3b8)" }}>{t.accessCount.toLocaleString()} calls</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Data Remediation Action */}
              {dataStores.some((s: any) => s.unusedOperations?.length > 0) && (
                <div className="flex items-center justify-between pt-3 border-t" style={{ borderColor: "var(--border, #e2e8f0)" }}>
                  <div className="text-sm" style={{ color: "var(--text-secondary, #64748b)" }}>
                    <span className="font-medium" style={{ color: "#ef4444" }}>
                      {dataStores.reduce((s: number, d: any) => s + (d.unusedOperations?.length || 0), 0)}
                    </span> unused data operation(s) can be restricted
                  </div>
                  <button
                    onClick={() => {
                      const s3Store = dataStores.find((s: any) => s.type === 'S3')
                      if (s3Store) handleApplyS3Fix(s3Store.name)
                    }}
                    disabled={applying}
                    className="px-4 py-2 rounded-lg text-xs font-medium text-white transition-opacity hover:opacity-80 disabled:opacity-50"
                    style={{ background: "#22c55e" }}
                  >
                    {applying ? "Applying..." : "Apply Data Fix"}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8">
              <Database className="w-8 h-8 mx-auto mb-2 opacity-30" style={{ color: "var(--text-muted, #94a3b8)" }} />
              <p className="text-sm" style={{ color: "var(--text-muted, #94a3b8)" }}>No data store access detected</p>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted, #94a3b8)" }}>This identity may not have S3, RDS, or DynamoDB permissions</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
