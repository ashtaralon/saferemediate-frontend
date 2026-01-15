"use client"

import { useState, useEffect } from "react"
import { X, Copy, Download, CheckCircle, AlertTriangle, Shield, Loader2 } from "lucide-react"

interface Permission {
  service: string
  action: string
  resource: string | string[]
}

interface LeastPrivilegePolicyData {
  roleArn: string
  roleName: string
  permissions: Permission[]
  usedPermissions: Permission[]
  unusedPermissions: Permission[]
  recommendedPermissions: Permission[]
  bloatPercentage: number
  observationPeriodDays: number
}

interface LeastPrivilegePolicyModalProps {
  isOpen: boolean
  onClose: () => void
  roleArn: string | null
  roleName: string
}

export function LeastPrivilegePolicyModal({
  isOpen,
  onClose,
  roleArn,
  roleName,
}: LeastPrivilegePolicyModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<LeastPrivilegePolicyData | null>(null)
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState<'recommended' | 'unused' | 'full'>('recommended')

  useEffect(() => {
    if (isOpen && roleArn) {
      fetchPolicyData()
    }
  }, [isOpen, roleArn])

  const fetchPolicyData = async () => {
    if (!roleArn) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/proxy/least-privilege/roles/${encodeURIComponent(roleArn)}`)

      if (!res.ok) {
        throw new Error(`Failed to fetch policy: ${res.status}`)
      }

      const result = await res.json()
      setData(result)
    } catch (err: any) {
      console.error("Error fetching LP policy:", err)
      setError(err.message || "Failed to fetch policy data")
    } finally {
      setLoading(false)
    }
  }

  const generatePolicyDocument = (permissions: Permission[]) => {
    // Group permissions by service
    const serviceGroups: Record<string, Set<string>> = {}

    for (const perm of permissions) {
      const service = perm.service || perm.action?.split(':')[0] || 'unknown'
      if (!serviceGroups[service]) {
        serviceGroups[service] = new Set()
      }
      serviceGroups[service].add(perm.action)
    }

    // Create policy statements
    const statements = Object.entries(serviceGroups).map(([service, actions]) => ({
      Sid: `${service.charAt(0).toUpperCase() + service.slice(1)}Access`,
      Effect: "Allow",
      Action: Array.from(actions).sort(),
      Resource: "*" // In real implementation, this should be more specific
    }))

    return {
      Version: "2012-10-17",
      Statement: statements
    }
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }

  const downloadPolicy = (policy: object, filename: string) => {
    const blob = new Blob([JSON.stringify(policy, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (!isOpen) return null

  const recommendedPolicy = data ? generatePolicyDocument(data.recommendedPermissions) : null
  const currentPolicy = data ? generatePolicyDocument(data.permissions) : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6" />
            <div>
              <h2 className="text-lg font-semibold">Least-Privilege Policy</h2>
              <p className="text-sm text-indigo-200">{roleName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
              <p className="text-gray-500">Generating least-privilege policy...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12">
              <AlertTriangle className="w-12 h-12 text-red-500 mb-3" />
              <p className="text-red-600 font-medium">Error</p>
              <p className="text-gray-500 text-sm">{error}</p>
              <button
                onClick={fetchPolicyData}
                className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                Retry
              </button>
            </div>
          ) : data ? (
            <>
              {/* Summary Stats */}
              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="bg-blue-50 rounded-lg p-4 text-center border border-blue-100">
                  <div className="text-2xl font-bold text-blue-600">{data.permissions?.length || 0}</div>
                  <div className="text-xs text-blue-600">Current Permissions</div>
                </div>
                <div className="bg-green-50 rounded-lg p-4 text-center border border-green-100">
                  <div className="text-2xl font-bold text-green-600">{data.usedPermissions?.length || 0}</div>
                  <div className="text-xs text-green-600">Used Permissions</div>
                </div>
                <div className="bg-red-50 rounded-lg p-4 text-center border border-red-100">
                  <div className="text-2xl font-bold text-red-600">{data.unusedPermissions?.length || 0}</div>
                  <div className="text-xs text-red-600">Unused Permissions</div>
                </div>
                <div className="bg-purple-50 rounded-lg p-4 text-center border border-purple-100">
                  <div className="text-2xl font-bold text-purple-600">{Math.round(data.bloatPercentage || 0)}%</div>
                  <div className="text-xs text-purple-600">Reduction Possible</div>
                </div>
              </div>

              {/* Observation Period */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <p className="text-sm text-amber-800">
                  Based on <strong>{data.observationPeriodDays} days</strong> of CloudTrail data.
                  Longer observation periods provide higher confidence.
                </p>
              </div>

              {/* Tabs */}
              <div className="flex gap-2 mb-4 border-b">
                <button
                  onClick={() => setActiveTab('recommended')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'recommended'
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Recommended Policy
                </button>
                <button
                  onClick={() => setActiveTab('unused')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'unused'
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Unused Permissions ({data.unusedPermissions?.length || 0})
                </button>
                <button
                  onClick={() => setActiveTab('full')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'full'
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Current Policy
                </button>
              </div>

              {/* Policy Content */}
              {activeTab === 'recommended' && recommendedPolicy && (
                <div className="relative">
                  <div className="absolute top-2 right-2 flex gap-2">
                    <button
                      onClick={() => copyToClipboard(JSON.stringify(recommendedPolicy, null, 2))}
                      className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                      title="Copy to clipboard"
                    >
                      {copied ? <CheckCircle className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-gray-600" />}
                    </button>
                    <button
                      onClick={() => downloadPolicy(recommendedPolicy, `${roleName}-least-privilege-policy.json`)}
                      className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                      title="Download policy"
                    >
                      <Download className="w-4 h-4 text-gray-600" />
                    </button>
                  </div>
                  <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-auto text-sm font-mono max-h-96">
                    {JSON.stringify(recommendedPolicy, null, 2)}
                  </pre>
                </div>
              )}

              {activeTab === 'unused' && (
                <div className="space-y-2 max-h-96 overflow-auto">
                  {data.unusedPermissions?.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-500" />
                      <p>No unused permissions detected!</p>
                    </div>
                  ) : (
                    data.unusedPermissions?.map((perm, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between px-4 py-2 bg-red-50 border border-red-100 rounded-lg"
                      >
                        <code className="text-sm text-red-700">{perm.action}</code>
                        <span className="text-xs text-red-500 bg-red-100 px-2 py-1 rounded">
                          Candidate for removal
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'full' && currentPolicy && (
                <div className="relative">
                  <div className="absolute top-2 right-2 flex gap-2">
                    <button
                      onClick={() => copyToClipboard(JSON.stringify(currentPolicy, null, 2))}
                      className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                      title="Copy to clipboard"
                    >
                      {copied ? <CheckCircle className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-gray-600" />}
                    </button>
                    <button
                      onClick={() => downloadPolicy(currentPolicy, `${roleName}-current-policy.json`)}
                      className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                      title="Download policy"
                    >
                      <Download className="w-4 h-4 text-gray-600" />
                    </button>
                  </div>
                  <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-auto text-sm font-mono max-h-96">
                    {JSON.stringify(currentPolicy, null, 2)}
                  </pre>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 flex justify-between items-center">
          <p className="text-xs text-gray-500">
            Review the recommended policy before applying. Use simulation to verify impact.
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
            >
              Close
            </button>
            {data && recommendedPolicy && (
              <button
                onClick={() => downloadPolicy(recommendedPolicy, `${roleName}-least-privilege-policy.json`)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download Policy
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
