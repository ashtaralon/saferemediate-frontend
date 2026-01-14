'use client'

/**
 * Test Page for Resource Inspector
 * =================================
 *
 * This page allows testing the unified ResourceInspector with different resource types.
 * Navigate to: http://localhost:3000/test-inspector
 */

import React, { useState } from 'react'
import { ResourceInspectorSheet } from '@/components/inspector'

// Test resources for each type
const TEST_RESOURCES = [
  {
    id: 'sg-02a2ccfe185765527',
    name: 'Security Group',
    description: 'saferemediate-test-app-sg',
    icon: '🛡️',
  },
  {
    id: 'acl-071aecb1e96778858',
    name: 'Network ACL',
    description: 'Default VPC NACL',
    icon: '🌐',
  },
  {
    id: 'i-03c72e120ff96216c',
    name: 'EC2 Instance',
    description: 'SafeRemediate-Test-Frontend-2',
    icon: '🖥️',
  },
  {
    id: 'arn:aws:s3:::saferemediate-analytics-745783559495',
    name: 'S3 Bucket',
    description: 'saferemediate-analytics',
    icon: '📦',
  },
  {
    id: 'AWSServiceRoleForAmazonEKS',
    name: 'AWS Managed Role (should fail)',
    description: 'This should show an error - AWS managed roles are filtered',
    icon: '🔑',
  },
]

export default function TestInspectorPage() {
  const [selectedResource, setSelectedResource] = useState<string | null>(null)
  const [customResourceId, setCustomResourceId] = useState('')

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Resource Inspector Test Page
        </h1>
        <p className="text-gray-600 mb-8">
          Click on any resource to test the unified inspector UI
        </p>

        {/* Test Resources Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {TEST_RESOURCES.map((resource) => (
            <button
              key={resource.id}
              onClick={() => setSelectedResource(resource.id)}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-left hover:border-blue-500 hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{resource.icon}</span>
                <div>
                  <h3 className="font-semibold text-gray-900">{resource.name}</h3>
                  <p className="text-sm text-gray-500">{resource.description}</p>
                  <p className="text-xs text-gray-400 font-mono mt-1 truncate">
                    {resource.id}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Custom Resource Input */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-8">
          <h2 className="font-semibold text-gray-900 mb-3">Test Custom Resource ID</h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={customResourceId}
              onChange={(e) => setCustomResourceId(e.target.value)}
              placeholder="Enter resource ID (e.g., sg-xxx, acl-xxx, i-xxx)"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={() => {
                if (customResourceId.trim()) {
                  setSelectedResource(customResourceId.trim())
                }
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              Inspect
            </button>
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-800">
          <h3 className="font-semibold mb-2">What to Verify:</h3>
          <ul className="list-disc list-inside space-y-1">
            <li><strong>Security Group</strong>: Shows rules table, flow counts, status badges</li>
            <li><strong>Network ACL</strong>: Shows inbound/outbound rules with ALLOW/DENY, associated subnets</li>
            <li><strong>EC2 Instance</strong>: Shows instance type, network info, security groups</li>
            <li><strong>S3 Bucket</strong>: Shows public access block settings (NO TCP ports!)</li>
            <li><strong>AWS Managed Role</strong>: Should show error (filtered out)</li>
          </ul>
        </div>

        {/* Unified Resource Inspector Sheet */}
        <ResourceInspectorSheet
          resourceId={selectedResource}
          open={selectedResource !== null}
          onOpenChange={(open) => {
            if (!open) setSelectedResource(null)
          }}
        />
      </div>
    </div>
  )
}
