"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface TrendsActivityProps {
  newResolvedData?: Array<{ timestamp: string; new: number; resolved: number }>
  openIssuesData?: Array<{ timestamp: string; count: number }>
}

export function TrendsActivity({ newResolvedData = [], openIssuesData = [] }: TrendsActivityProps) {
  const hasNewResolvedData = newResolvedData.length > 0
  const hasOpenIssuesData = openIssuesData.length > 0

  const currentOpenIssues = hasOpenIssuesData ? openIssuesData[openIssuesData.length - 1]?.count || 0 : 0

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4 text-gray-900">Trends & Activity</h2>
      <div className="grid grid-cols-2 gap-4">
        {/* New VS Resolved Issues Chart */}
        <div className="bg-white rounded-lg p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">New VS Resolved Issues</h3>
            <div className="flex items-center gap-2">
              <Select defaultValue="24h">
                <SelectTrigger className="w-32 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">Last 24 hours</SelectItem>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                </SelectContent>
              </Select>
              <Select defaultValue="all">
                <SelectTrigger className="w-32 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All issue types</SelectItem>
                  <SelectItem value="cve">CVEs</SelectItem>
                  <SelectItem value="threat">Threats</SelectItem>
                </SelectContent>
              </Select>
              <Select defaultValue="all-severity">
                <SelectTrigger className="w-32 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-severity">All severities</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-4 mb-3 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-400 rounded-full"></div>
              <span className="text-gray-600">New</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-400 rounded-full"></div>
              <span className="text-gray-600">Resolved</span>
            </div>
          </div>

          {hasNewResolvedData ? (
            <div className="h-48 bg-gray-50 rounded flex items-center justify-center text-sm text-gray-500">
              Chart visualization would render here with real data
            </div>
          ) : (
            <div className="h-48 bg-gray-50 rounded flex items-center justify-center text-sm text-gray-500">
              No trend data available yet
            </div>
          )}
        </div>

        {/* Open Issues Chart */}
        <div className="bg-white rounded-lg p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Open Issues</h3>
            <div className="flex items-center gap-2">
              <Select defaultValue="24h">
                <SelectTrigger className="w-32 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">Last 24 hours</SelectItem>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                </SelectContent>
              </Select>
              <Select defaultValue="all">
                <SelectTrigger className="w-32 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All issue types</SelectItem>
                  <SelectItem value="cve">CVEs</SelectItem>
                  <SelectItem value="threat">Threats</SelectItem>
                </SelectContent>
              </Select>
              <Select defaultValue="critical">
                <SelectTrigger className="w-24 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="text-5xl font-bold text-gray-900 mb-4">{currentOpenIssues}</div>

          {hasOpenIssuesData ? (
            <div className="h-32 bg-gray-50 rounded flex items-center justify-center text-sm text-gray-500">
              Chart visualization would render here with real data
            </div>
          ) : (
            <div className="h-32 bg-gray-50 rounded flex items-center justify-center text-sm text-gray-500">
              No trend data available yet
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
