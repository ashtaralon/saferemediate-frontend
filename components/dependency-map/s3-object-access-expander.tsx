"use client"

// S3 object-access expander — mounts under an S3 crown-jewel node in the
// Traffic Flow Map. Shows observed accessors + data-access verbs per object.
// LP policy generation and simulate-fix live in Resource Risk — this panel
// deep-links there instead of duplicating define/copy flows.

import { useCallback, useEffect, useState } from "react"
import {
  ChevronDown,
  ChevronRight,
  Zap,
  Key,
  Clock,
  User,
  Box,
  ArrowRight,
  Database,
  Loader2,
  Shield,
  ExternalLink,
} from "lucide-react"
import { openResourceRisk } from "@/lib/resource-risk-navigation"

interface Accessor {
  principal: string
  principal_type: string
  actions: string[]
  verbs: string[]
  is_data_access: boolean
  lp_resource_type?: string | null
  lp_resource_name?: string | null
}
interface S3Object {
  id: string
  name: string
  prefix?: string | null
  access_count?: number | null
  last_seen?: string | null
  accessors: Accessor[]
}
interface S3ObjectsResponse {
  bucket_arn: string
  bucket_name: string
  object_count: number
  objects: S3Object[]
}

const VERB_STYLE: Record<string, string> = {
  DELETE: "bg-red-500/20 border-red-500/50 text-red-600 dark:text-red-400",
  WRITE: "bg-amber-500/20 border-amber-500/50 text-amber-600 dark:text-amber-400",
  READ: "bg-blue-500/20 border-blue-500/50 text-blue-600 dark:text-blue-400",
  LIST: "bg-slate-500/20 border-slate-500/50 text-slate-600 dark:text-slate-300",
  ADMIN: "bg-purple-500/20 border-purple-500/50 text-purple-600 dark:text-purple-400",
  CONFIG: "bg-muted border-border text-muted-foreground",
  OTHER: "bg-muted border-border text-muted-foreground",
}

function PrincipalIcon({ type }: { type: string }) {
  const cls = "w-3.5 h-3.5"
  if (type === "lambda") return <Zap className={`${cls} text-orange-500`} />
  if (type === "session") return <Clock className={`${cls} text-cyan-500`} />
  if (type === "user") return <User className={`${cls} text-fuchsia-500`} />
  if (type === "principal") return <User className={`${cls} text-muted-foreground`} />
  return <Key className={`${cls} text-rose-500`} />
}

function objectLabel(name: string): string {
  const tail = name.split("/").slice(1).join("/") || name
  return tail === "(root)" ? "(bucket root)" : tail
}

function VerbChips({ verbs }: { verbs: string[] }) {
  if (!verbs.length) return null
  return (
    <span className="inline-flex flex-wrap gap-1">
      {verbs.map((v) => (
        <span
          key={v}
          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border leading-none ${
            VERB_STYLE[v] ?? VERB_STYLE.OTHER
          }`}
        >
          {v}
        </span>
      ))}
    </span>
  )
}

function ResourceRiskLink({
  accessor,
  bucketName,
}: {
  accessor: Accessor
  bucketName: string
}) {
  const type = accessor.lp_resource_type
  const name = accessor.lp_resource_name
  if (!type || !name) {
    if (!accessor.is_data_access) {
      return (
        <button
          type="button"
          onClick={() =>
            openResourceRisk({ resourceType: "S3Bucket", resourceName: bucketName })
          }
          className="mt-0.5 flex items-center gap-1 text-[10px] font-medium text-[#2D51DA] hover:underline"
        >
          <Shield className="w-3 h-3" />
          Review bucket in Resource Risk
          <ExternalLink className="w-2.5 h-2.5 opacity-60" />
        </button>
      )
    }
    return null
  }
  if (type !== "IAMRole" && type !== "IAMUser" && type !== "S3Bucket") return null

  return (
    <button
      type="button"
      onClick={() =>
        openResourceRisk({
          resourceType: type,
          resourceName: name,
        })
      }
      className="mt-0.5 flex items-center gap-1 text-[10px] font-medium text-[#2D51DA] hover:underline"
    >
      <Shield className="w-3 h-3" />
      Review in Resource Risk
      <ExternalLink className="w-2.5 h-2.5 opacity-60" />
    </button>
  )
}

function AccessorRow({ a, bucketName }: { a: Accessor; bucketName: string }) {
  return (
    <div
      className={`py-1 ${a.is_data_access ? "" : "opacity-55"}`}
      title={a.actions.join(", ")}
    >
      <div className="flex items-center gap-2">
        <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
        <PrincipalIcon type={a.principal_type} />
        <span className="text-xs font-medium truncate max-w-[180px]">{a.principal}</span>
        {!a.is_data_access && (
          <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
            control-plane
          </span>
        )}
        <span className="ml-auto">
          <VerbChips verbs={a.verbs} />
        </span>
      </div>
      {a.is_data_access && (
        <div className="pl-5">
          <ResourceRiskLink accessor={a} bucketName={bucketName} />
        </div>
      )}
    </div>
  )
}

function ObjectCard({ obj, bucketName }: { obj: S3Object; bucketName: string }) {
  const accessors = [...obj.accessors].sort(
    (x, y) => Number(y.is_data_access) - Number(x.is_data_access),
  )
  return (
    <div className="rounded-md border border-border bg-card/60 p-2">
      <div className="flex items-center gap-2 mb-1.5">
        <Box className="w-4 h-4 text-green-500 shrink-0" />
        <span className="text-xs font-semibold truncate">{objectLabel(obj.name)}</span>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {accessors.length} {accessors.length === 1 ? "accessor" : "accessors"}
        </span>
      </div>
      <div className="pl-1 divide-y divide-border/50">
        {accessors.length === 0 ? (
          <div className="text-[11px] text-muted-foreground py-1">No observed access.</div>
        ) : (
          accessors.map((a) => (
            <AccessorRow key={a.principal} a={a} bucketName={bucketName} />
          ))
        )}
      </div>
    </div>
  )
}

export function S3ObjectAccessExpander({
  bucketArn,
  bucketLabel,
}: {
  bucketArn: string
  bucketLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<S3ObjectsResponse | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/proxy/data-access-s3?bucket_arn=${encodeURIComponent(bucketArn)}`,
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as S3ObjectsResponse
      setData(json)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load object access")
    } finally {
      setLoading(false)
    }
  }, [bucketArn])

  useEffect(() => {
    if (open && !data && !loading) void load()
  }, [open, data, loading, load])

  const bucketName = data?.bucket_name ?? bucketLabel ?? bucketArn.split(":::").pop()?.split("/")[0] ?? ""

  return (
    <div className="mt-1 w-full">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 mx-auto text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
        title="Inspect per-object data access"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        <Database className="w-3 h-3" />
        Object access
      </button>

      {open && (
        <div className="mt-2 w-[320px] max-w-[88vw] mx-auto rounded-lg border border-border bg-popover/95 backdrop-blur p-2 shadow-lg text-left">
          <div className="flex items-center justify-between mb-2 gap-2">
            <span className="text-[11px] font-semibold text-foreground truncate">
              {bucketLabel || bucketName} · objects
            </span>
            <div className="flex items-center gap-2 shrink-0">
              {data && (
                <span className="text-[10px] text-muted-foreground">
                  {data.object_count} {data.object_count === 1 ? "object" : "objects"}
                </span>
              )}
              {bucketName && (
                <button
                  type="button"
                  onClick={() =>
                    openResourceRisk({ resourceType: "S3Bucket", resourceName: bucketName })
                  }
                  className="text-[10px] font-medium text-[#2D51DA] hover:underline"
                >
                  Resource Risk
                </button>
              )}
            </div>
          </div>

          {loading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-3 justify-center">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading observed access…
            </div>
          )}
          {error && !loading && (
            <div className="text-xs text-red-500 py-2">
              {error}.{" "}
              <button className="underline" onClick={() => void load()}>
                retry
              </button>
            </div>
          )}
          {!loading && !error && data && data.objects.length === 0 && (
            <div className="text-xs text-muted-foreground py-2">
              No tracked objects with observed access for this bucket.
            </div>
          )}
          {!loading && !error && data && data.objects.length > 0 && (
            <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
              {data.objects.map((o) => (
                <ObjectCard key={o.id} obj={o} bucketName={data.bucket_name} />
              ))}
            </div>
          )}

          {!loading && !error && data && data.objects.length > 0 && (
            <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
              Observed access only — verbs reflect what each principal used in the
              collection window. Define and simulate least privilege in{" "}
              <span className="font-medium text-foreground/80">Resource Risk</span>.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default S3ObjectAccessExpander
