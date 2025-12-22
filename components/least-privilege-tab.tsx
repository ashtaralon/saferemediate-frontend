"use client"

import { useState, useEffect } from "react"
import { Shield, Database, Network, AlertTriangle, CheckCircle2, XCircle, TrendingDown, Clock, FileDown, Send, Zap, ChevronRight, ExternalLink, Play, Wrench, X, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { SimulateModal } from "./simulate-modal"
import { fetchSecurityFindings } from "@/lib/api-client"
import type { SecurityFinding } from "@/lib/types"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-f.onrender.com"

interface LeastPrivilegeTabProps {
  systemName: string
  onSimulate?: (finding: SecurityFinding) => void
  onRemediate?: (finding: SecurityFinding) => void
}

interface GapResource {
  id: string
  resourceType: 'IAMRole' | 'SecurityGroup' | 'S3Bucket' | 'NetworkACL'
  resourceName: string
  resourceArn?: string
  allowedCount: number
  usedCount: number
  gapCount: number
  gapPercent: number
  allowedList: string[]
  usedList: string[]
  unusedList: string[]
  confidence: number
  severity: 'critical' | 'high' | 'medium' | 'low'
  title: string
  description: string
  observationDays: number
  evidence?: {
    dataSources: string[]
    confidence: 'HIGH' | 'MEDIUM' | 'LOW'
    lastUsed?: string
  }
}

export function LeastPrivilegeTab({ systemName, onSimulate, onRemediate }: LeastPrivilegeTabProps) {
  const [findings, setFindings] = useState<SecurityFinding[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedResources, setSelectedResources] = useState<Set<string>>(new Set())
  const [selectedDetail, setSelectedDetail] = useState<GapResource | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [simulateModalOpen, setSimulateModalOpen] = useState(false)
  const [selectedFinding, setSelectedFinding] = useState<SecurityFinding | null>(null)
  const [timeRange, setTimeRange] = useState<number>(30)

  useEffect(() => {
    loadFindings()
  }, [systemName])

  const loadFindings = async () => {
    setLoading(true)
    try {
      const data = await fetchSecurityFindings()
      setFindings(data)
    } catch (error) {
      console.error("[LeastPrivilegeTab] Error loading findings:", error)
    } finally {
      setLoading(false)
    }
  }

  // Convert findings to GapResource format
  const gapResources: GapResource[] = findings.map((f: any) => ({
    id: f.id,
    resourceType: f.resourceType === 'IAMRole' ? 'IAMRole' : 'SecurityGroup',
    resourceName: f.resource || f.resourceId || f.role_name || 'Unknown',
    resourceArn: f.resourceArn,
    allowedCount: f.allowed_actions_count || f.allowedCount || 0,
    usedCount: f.used_actions_count || f.usedCount || 0,
    gapCount: f.unused_actions_count || f.gapCount || 0,
    gapPercent: f.gapPercent || ((f.unused_actions_count || 0) / (f.allowed_actions_count || 1) * 100),
    allowedList: f.allowed_actions || f.allowedList || [],
    usedList: f.used_actions || f.usedList || [],
    unusedList: f.unused_actions || f.unusedList || [],
    confidence: f.confidence ?? null,
    severity: (f.severity || 'medium').toLowerCase() as 'critical' | 'high' | 'medium' | 'low',
    title: f.title,
    description: f.description,
    observationDays: timeRange,
    evidence: {
      dataSources: ['CloudTrail', 'VPC Flow Logs'],
      confidence: f.confidence >= 85 ? 'HIGH' : f.confidence >= 70 ? 'MEDIUM' : 'LOW',
    }
  }))

  // Calculate summary stats
  const summary = {
    totalResources: gapResources.length,
    totalExcessPermissions: gapResources.reduce((sum, r) => sum + r.gapCount, 0),
    unusedNetworkRules: gapResources.filter(r => r.resourceType === 'SecurityGroup').reduce((sum, r) => sum + r.gapCount, 0),
    dataAccessIssues: gapResources.filter(r => r.resourceType === 'S3Bucket').length,
    avgConfidence: gapResources.length > 0 
      ? Math.round(gapResources.reduce((sum, r) => sum + r.confidence, 0) / gapResources.length)
      : 0,
    autoRemediatable: gapResources.filter(r => r.confidence >= 85 && r.severity !== 'critical').length
  }

  const handleSimulate = (finding: SecurityFinding) => {
    setSelectedFinding(finding)
    setSimulateModalOpen(true)
    if (onSimulate) {
      onSimulate(finding)
    }
  }

  const handleRemediate = async (finding: SecurityFinding) => {
    if (onRemediate) {
      onRemediate(finding)
    } else {
      // Fallback: use proxy route
      try {
        const findingId = (finding as any).finding_id || finding.id
        const response = await fetch(`/api/proxy/simulate/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ finding_id: findingId })
        })
        
        if (response.ok) {
          await loadFindings() // Refresh
        }
      } catch (error) {
        console.error("[LeastPrivilegeTab] Remediation failed:", error)
      }
    }
  }

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedResources)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedResources(newSelected)
  }

  const handleBulkSimulate = () => {
    const selectedFindings = findings.filter(f => selectedResources.has(f.id))
    if (selectedFindings.length > 0) {
      handleSimulate(selectedFindings[0]) // Simulate first one
    }
  }

  const handleBulkRemediate = async () => {
    const selectedFindings = findings.filter(f => 
      selectedResources.has(f.id) && 
      gapResources.find(r => r.id === f.id)?.confidence >= 85
    )
    
    for (const finding of selectedFindings) {
      await handleRemediate(finding)
    }
    
    setSelectedResources(new Set())
  }

  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical': return 'bg-red-600 text-white'
      case 'high': return 'bg-orange-500 text-white'
      case 'medium': return 'bg-yellow-500 text-black'
      case 'low': return 'bg-blue-500 text-white'
      default: return 'bg-gray-500 text-white'
    }
  }

  const getResourceIcon = (type: string) => {
    switch (type) {
      case 'IAMRole': return <Shield className="w-4 h-4" />
      case 'SecurityGroup': return <Network className="w-4 h-4" />
      case 'S3Bucket': return <Database className="w-4 h-4" />
      default: return <AlertTriangle className="w-4 h-4" />
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading least privilege analysis...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Section A: Summary Header */}
      <div className="grid grid-cols-6 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-600">Excess IAM Permissions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{summary.totalExcessPermissions}</div>
            <div className="text-xs text-gray-500 mt-1">across {summary.totalResources} resources</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-600">Unused Network Rules</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{summary.unusedNetworkRules}</div>
            <div className="text-xs text-gray-500 mt-1">security group rules</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-600">Data Access Issues</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{summary.dataAccessIssues}</div>
            <div className="text-xs text-gray-500 mt-1">S3 bucket policies</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-600">Overall Confidence</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{summary.avgConfidence}%</div>
            <Progress value={summary.avgConfidence} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-600">Resources Analyzed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{summary.totalResources}</div>
            <div className="text-xs text-gray-500 mt-1">IAM roles & SGs</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-600">Auto-Remediatable</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{summary.autoRemediatable}</div>
            <div className="text-xs text-gray-500 mt-1">high confidence</div>
          </CardContent>
        </Card>
      </div>

      {/* Section B: Resource List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Resource List</CardTitle>
            <Select value={timeRange.toString()} onValueChange={(v) => setTimeRange(Number(v))}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="60">60 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
                <SelectItem value="365">365 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <input
                    type="checkbox"
                    checked={selectedResources.size === gapResources.length && gapResources.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedResources(new Set(gapResources.map(r => r.id)))
                      } else {
                        setSelectedResources(new Set())
                      }
                    }}
                  />
                </TableHead>
                <TableHead>Resource</TableHead>
                <TableHead>GAP Analysis</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {gapResources.map((resource) => {
                const finding = findings.find(f => f.id === resource.id)
                return (
                  <TableRow key={resource.id} className="cursor-pointer hover:bg-gray-50" onClick={() => {
                    setSelectedDetail(resource)
                    setDetailOpen(true)
                  }}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedResources.has(resource.id)}
                        onChange={(e) => {
                          e.stopPropagation()
                          toggleSelection(resource.id)
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getResourceIcon(resource.resourceType)}
                        <div>
                          <div className="font-medium">{resource.resourceName}</div>
                          <div className="text-xs text-gray-500">{resource.resourceType}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{resource.usedCount} / {resource.allowedCount}</span>
                        <Badge className="bg-red-100 text-red-700">
                          {resource.gapCount} unused
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={resource.confidence} className="w-20" />
                        <span className="text-sm font-medium">{resource.confidence}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getSeverityColor(resource.severity)}>
                        {resource.severity.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (finding) handleSimulate(finding)
                          }}
                        >
                          <Play className="w-3 h-3 mr-1" />
                          Simulate
                        </Button>
                        <Button
                          size="sm"
                          variant="default"
                          className="bg-green-600 hover:bg-green-700"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (finding) handleRemediate(finding)
                          }}
                        >
                          <Wrench className="w-3 h-3 mr-1" />
                          Remediate
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Section C: Issue Details Panel (Slide-out) */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Issue Details</SheetTitle>
          </SheetHeader>
          
          {selectedDetail && (
            <div className="space-y-6 mt-6">
              {/* 3 Stat Boxes */}
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-medium text-gray-600">Allowed</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-blue-600">{selectedDetail.allowedCount}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-medium text-gray-600">Used</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">{selectedDetail.usedCount}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-medium text-gray-600">GAP</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-600">{selectedDetail.gapCount}</div>
                  </CardContent>
                </Card>
              </div>

              {/* Time Range & Evidence */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Evidence</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Data Source:</span>
                    <Badge>{selectedDetail.evidence?.dataSources.join(', ') || 'CloudTrail'}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Confidence:</span>
                    <div className="flex items-center gap-2">
                      <Progress value={selectedDetail.confidence} className="w-24" />
                      <span className="text-sm font-medium">{selectedDetail.confidence}%</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Observation Period:</span>
                    <span className="text-sm font-medium">{selectedDetail.observationDays} days</span>
                  </div>
                </CardContent>
              </Card>

              {/* 3 Tabs */}
              <Tabs defaultValue="gap">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="gap">GAP Analysis</TabsTrigger>
                  <TabsTrigger value="allowed">Allowed</TabsTrigger>
                  <TabsTrigger value="used">Actually Used</TabsTrigger>
                </TabsList>
                
                <TabsContent value="gap" className="space-y-2">
                  <div className="max-h-64 overflow-y-auto space-y-1">
                    {selectedDetail.unusedList.map((perm, i) => (
                      <code key={i} className="block text-xs bg-red-50 text-red-700 px-2 py-1 rounded">
                        {perm}
                      </code>
                    ))}
                  </div>
                </TabsContent>
                
                <TabsContent value="allowed" className="space-y-2">
                  <div className="max-h-64 overflow-y-auto space-y-1">
                    {selectedDetail.allowedList.map((perm, i) => (
                      <code key={i} className="block text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">
                        {perm}
                      </code>
                    ))}
                  </div>
                </TabsContent>
                
                <TabsContent value="used" className="space-y-2">
                  <div className="max-h-64 overflow-y-auto space-y-1">
                    {selectedDetail.usedList.map((perm, i) => (
                      <code key={i} className="block text-xs bg-green-50 text-green-700 px-2 py-1 rounded">
                        {perm}
                      </code>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>

              {/* System Context (A7 Patent) */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">System Context</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-gray-600">
                    <p>Resource: <span className="font-mono">{selectedDetail.resourceName}</span></p>
                    <p className="mt-2">Part of system: <span className="font-medium">{systemName}</span></p>
                    <p className="mt-2 text-xs text-gray-500">
                      Analyzed using A7 patent system discovery methodology
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Section D: Floating Footer */}
      {selectedResources.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg p-4 z-50">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">
                {selectedResources.size} item(s) selected
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleBulkSimulate}>
                <Play className="w-4 h-4 mr-2" />
                Bulk Simulate All
              </Button>
              <Button 
                variant="default" 
                className="bg-green-600 hover:bg-green-700"
                onClick={handleBulkRemediate}
              >
                <Wrench className="w-4 h-4 mr-2" />
                Bulk Remediate Safe Items
              </Button>
              <Button variant="outline">
                <FileDown className="w-4 h-4 mr-2" />
                Export PDF
              </Button>
              <Button variant="ghost" onClick={() => setSelectedResources(new Set())}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Simulate Modal */}
      {selectedFinding && (
        <SimulateModal
          isOpen={simulateModalOpen}
          onClose={() => {
            setSimulateModalOpen(false)
            setSelectedFinding(null)
          }}
          finding={selectedFinding}
          onExecute={handleRemediate}
        />
      )}
    </div>
  )
}
