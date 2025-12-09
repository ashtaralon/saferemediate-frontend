"use client"

import { useState, useEffect } from "react"
import { AlertTriangle, Tag, X, Loader2, CheckCircle, ChevronDown, ChevronUp } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { getSystemName, getEnvironment, TAG_KEYS } from "@/lib/tag-utils"

interface UntaggedResource {
  id: string
  name: string
  type: string
}

interface UntaggedResourcesBannerProps {
  systemName: string
  environment?: string
  onTaggingComplete?: (count: number) => void
}

/**
 * A7 Patent: Temporal Maintenance Component
 *
 * Automatically detects resources in the dependency graph that are
 * connected to the current system but don't have SystemName tags.
 * Allows users to tag them with one click.
 */
export function UntaggedResourcesBanner({
  systemName,
  environment = "Production",
  onTaggingComplete,
}: UntaggedResourcesBannerProps) {
  const { toast } = useToast()
  const [untaggedResources, setUntaggedResources] = useState<UntaggedResource[]>([])
  const [loading, setLoading] = useState(true)
  const [tagging, setTagging] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [expanded, setExpanded] = useState(false)

  // Fetch untagged resources on mount
  useEffect(() => {
    fetchUntaggedResources()
  }, [systemName])

  const fetchUntaggedResources = async () => {
    setLoading(true)
    try {
      const untaggedList: UntaggedResource[] = []
      const seenIds = new Set<string>()

      // 1. Fetch resources from the system graph that don't have SystemName tag
      try {
        const graphResponse = await fetch(`/api/proxy/system-graph?systemName=${encodeURIComponent(systemName)}`)
        if (graphResponse.ok) {
          const graphData = await graphResponse.json()
          const resources = graphData.resources || []

          // Filter to find resources without SystemName tag
          resources.forEach((r: any) => {
            const hasSystemName = getSystemName(r)
            if (!hasSystemName || hasSystemName === "Ungrouped" || hasSystemName === "NO_SYSTEM") {
              if (!seenIds.has(r.id)) {
                seenIds.add(r.id)
                untaggedList.push({
                  id: r.id,
                  name: r.name || r.id,
                  type: r.type || "Resource",
                })
              }
            }
          })
        }
      } catch (e) {
        console.warn("Failed to fetch system graph:", e)
      }

      // 2. Fetch findings to find resources with security issues but no systemName
      try {
        const findingsResponse = await fetch("/api/proxy/findings")
        if (findingsResponse.ok) {
          const findingsData = await findingsResponse.json()
          const findings = findingsData.findings || findingsData || []

          // Extract unique resources from findings that don't have systemName
          findings.forEach((f: any) => {
            const resourceSystemName = getSystemName(f) || f.system_name
            // Include if no systemName or if it's null/undefined
            if (!resourceSystemName || resourceSystemName === "null" || resourceSystemName === "Ungrouped") {
              const resourceId = f.resource_id || f.resourceId || f.resource
              const resourceName = f.resource_name || f.resourceName || f.title || resourceId
              const resourceType = f.resource_type || f.resourceType || "Resource"

              if (resourceId && !seenIds.has(resourceId)) {
                seenIds.add(resourceId)
                untaggedList.push({
                  id: resourceId,
                  name: resourceName,
                  type: resourceType,
                })
              }
            }
          })
        }
      } catch (e) {
        console.warn("Failed to fetch findings:", e)
      }

      // 3. Fetch connected but untagged resources from Neo4j
      try {
        const connectedResponse = await fetch(`/api/proxy/connected-untagged?systemName=${encodeURIComponent(systemName)}`)
        if (connectedResponse.ok) {
          const connectedData = await connectedResponse.json()
          const connected = connectedData.resources || []

          connected.forEach((r: any) => {
            if (!seenIds.has(r.id)) {
              seenIds.add(r.id)
              untaggedList.push({
                id: r.id,
                name: r.name || r.id,
                type: r.type || "Resource",
              })
            }
          })
        }
      } catch (e) {
        // This endpoint might not exist yet, that's okay
        console.log("Connected-untagged endpoint not available:", e)
      }

      setUntaggedResources(untaggedList)
    } catch (error) {
      console.error("Failed to fetch untagged resources:", error)
      setUntaggedResources([])
    } finally {
      setLoading(false)
    }
  }

  const handleTagAll = async () => {
    if (untaggedResources.length === 0) return

    setTagging(true)
    try {
      const response = await fetch("/api/proxy/auto-tag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemName,
          resourceIds: untaggedResources.map((r) => r.id),
          tags: {
            // Mandatory tags
            [TAG_KEYS.SYSTEM_NAME]: systemName,
            [TAG_KEYS.ENVIRONMENT]: environment,
            // Optional tags
            [TAG_KEYS.MANAGED_BY]: "SafeRemediate",
            [TAG_KEYS.DISCOVERY_METHOD]: "A7-TemporalMaintenance",
          },
        }),
      })

      const data = await response.json()

      if (data.success || data.taggedCount) {
        const count = data.taggedCount || untaggedResources.length
        toast({
          title: "Resources Tagged",
          description: `Successfully tagged ${count} resources with SystemName=${systemName}`,
        })
        setUntaggedResources([])
        onTaggingComplete?.(count)
      } else {
        throw new Error(data.error || "Tagging failed")
      }
    } catch (error) {
      console.error("Failed to tag resources:", error)
      toast({
        variant: "destructive",
        title: "Tagging Failed",
        description: "Failed to tag resources. Please try again.",
      })
    } finally {
      setTagging(false)
    }
  }

  // Don't show if loading, dismissed, or no untagged resources
  if (loading || dismissed || untaggedResources.length === 0) {
    return null
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-amber-100 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-amber-800">
              {untaggedResources.length} Untagged Resource{untaggedResources.length > 1 ? "s" : ""} Detected
            </h4>
            <p className="text-sm text-amber-700 mt-1">
              These resources are connected to <strong>{systemName}</strong> but don't have the required{" "}
              <code className="bg-amber-100 px-1 rounded">SystemName</code> tag.
            </p>

            {/* Expandable resource list */}
            {untaggedResources.length > 0 && (
              <div className="mt-2">
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="text-sm text-amber-700 hover:text-amber-800 flex items-center gap-1"
                >
                  {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  {expanded ? "Hide" : "Show"} resources
                </button>

                {expanded && (
                  <div className="mt-2 max-h-32 overflow-y-auto bg-white rounded border border-amber-200 divide-y divide-amber-100">
                    {untaggedResources.map((resource) => (
                      <div key={resource.id} className="px-3 py-2 text-sm flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-amber-100 rounded text-xs text-amber-800">
                          {resource.type}
                        </span>
                        <span className="text-gray-700 truncate">{resource.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tags to apply preview */}
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="text-xs text-amber-600">Will apply:</span>
              <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded text-xs font-medium">
                SystemName = {systemName}
              </span>
              <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded text-xs font-medium">
                Environment = {environment}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleTagAll}
            disabled={tagging}
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium text-sm disabled:opacity-50"
          >
            {tagging ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Tagging...
              </>
            ) : (
              <>
                <Tag className="w-4 h-4" />
                Tag All
              </>
            )}
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="p-2 text-amber-600 hover:text-amber-800 hover:bg-amber-100 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
