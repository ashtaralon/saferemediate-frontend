"use client"

import { Database } from "lucide-react"
import type { ResourceType } from "./types"

interface ResourceTypesCardProps {
  resourceTypes: ResourceType[]
}

export function ResourceTypesCard({ resourceTypes }: ResourceTypesCardProps) {
  return (
    <div className="bg-white rounded-xl p-6 border border-gray-200">
      <div className="flex items-center gap-2 mb-4">
        <Database className="w-4 h-4 text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Resource Types</h3>
      </div>
      <div className="space-y-3">
        {resourceTypes.map((resource) => (
          <div key={resource.name} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${resource.color}`}>
                <resource.icon className="w-4 h-4" />
              </div>
              <div>
                <span className="text-sm text-gray-700">{resource.name}</span>
                <p className="text-xs text-gray-400">{resource.description}</p>
              </div>
            </div>
            <span className="text-sm font-medium text-gray-900">{resource.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}







