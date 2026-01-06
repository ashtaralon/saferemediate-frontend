"use client"

import { ArrowLeft, Download, Calendar, AlertTriangle, Tag, Zap, RefreshCw } from "lucide-react"
import type { SeverityCounts } from "./types"

interface HeaderProps {
  systemName: string
  severityCounts: SeverityCounts
  onBack: () => void
  onTagAll: () => void
  onAutoTag?: () => void
  autoTagLoading?: boolean
}

export function Header({ systemName, severityCounts, onBack, onTagAll, onAutoTag, autoTagLoading }: HeaderProps) {
  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="max-w-[1800px] mx-auto px-8 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">{systemName}</h1>
                <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">
                  PRODUCTION
                </span>
                <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                  MISSION CRITICAL
                </span>
                {severityCounts.critical > 0 && (
                  <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {severityCounts.critical} CRITICAL
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-1">
                AWS eu-west-1 • Production environment • Last scan: 2 min ago
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onTagAll}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
            >
              <Tag className="w-4 h-4" />
              Tag All Resources
            </button>
            {onAutoTag && (
              <button
                onClick={onAutoTag}
                disabled={autoTagLoading}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {autoTagLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Tagging...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    Auto-Tag Connected
                  </>
                )}
              </button>
            )}
            <button className="flex items-center gap-2 px-4 py-2 bg-[#2D51DA] text-white rounded-lg hover:bg-[#2343B8] transition-colors">
              <Calendar className="w-4 h-4" />
              Schedule Maintenance
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}







