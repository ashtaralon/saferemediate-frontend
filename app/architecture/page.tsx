'use client'

import { useState } from 'react'
import AWSTopologyMapLive from '@/components/aws-topology-map-live'
import { ResourceImpactPanel } from '@/components/resource-impact-panel'

// Use environment variable or fallback to production
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://saferemediate-backend-f.onrender.com'

// Predefined simulation scenarios for demo
const DEMO_SCENARIOS = [
  { name: "EC2 → S3 (Production)", source: "SafeRemediate-Test-App-1", target: "cyntro-demo-prod-data-745783559495", days: 420, eventsPerDay: 3 },
  { name: "EC2 → S3 (Analytics)", source: "SafeRemediate-Test-App-1", target: "cyntro-demo-analytics-745783559495", days: 180, eventsPerDay: 10 },
  { name: "Lambda → S3 (Analytics)", source: "analytics-lambda", target: "cyntro-demo-analytics-745783559495", days: 90, eventsPerDay: 25 },
  { name: "Custom...", source: "", target: "", days: 30, eventsPerDay: 5 },
]

export default function ArchitecturePage() {
  const [isLoading, setIsLoading] = useState(false)
  const [isSimulating, setIsSimulating] = useState(false)
  const [showSimulator, setShowSimulator] = useState(false)
  const [lastFetch, setLastFetch] = useState<string | null>(null)
  const [simSource, setSimSource] = useState("SafeRemediate-Test-App-1")
  const [simTarget, setSimTarget] = useState("cyntro-demo-prod-data-745783559495")
  const [simDays, setSimDays] = useState(420)
  const [simEventsPerDay, setSimEventsPerDay] = useState(3)

  const fetchTrafficFromDB = async () => {
    setIsLoading(true)
    console.log('='.repeat(60))
    console.log('FETCHING TRAFFIC DATA FROM NEO4J')
    console.log(`Backend URL: ${BACKEND_URL}`)
    console.log('='.repeat(60))

    try {
      // Fetch all traffic data
      const response = await fetch(`${BACKEND_URL}/api/debug/traffic`)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()

      console.log('\n--- RAW RESPONSE ---')
      console.log(JSON.stringify(data, null, 2))

      console.log('\n--- S3 ACCESS RELATIONSHIPS ---')
      if (data.s3_access && data.s3_access.length > 0) {
        console.table(data.s3_access)
      } else {
        console.log('No S3 access data found')
      }

      console.log('\n--- S3 OPERATIONS ---')
      if (data.s3_operations && data.s3_operations.length > 0) {
        console.table(data.s3_operations)
      } else {
        console.log('No S3 operations found')
      }

      console.log('\n--- ACTUAL TRAFFIC ---')
      if (data.actual_traffic && data.actual_traffic.length > 0) {
        console.table(data.actual_traffic)
      } else {
        console.log('No actual traffic found')
      }

      console.log('\n--- SUMMARY ---')
      console.log(data.summary || 'No summary')

      // Also fetch EC2 to S3 specific traffic
      const ec2S3Response = await fetch(`${BACKEND_URL}/api/debug/traffic/ec2-s3`)
      const ec2S3Data = await ec2S3Response.json()

      console.log('\n--- EC2 TO S3 TRAFFIC ---')
      if (ec2S3Data.ec2_to_s3_traffic && ec2S3Data.ec2_to_s3_traffic.length > 0) {
        console.table(ec2S3Data.ec2_to_s3_traffic)
      } else {
        console.log('No EC2-S3 traffic found')
      }

      setLastFetch(new Date().toLocaleTimeString())
      console.log('\n' + '='.repeat(60))
      console.log('FETCH COMPLETE - Check console tables above')
      console.log('='.repeat(60))

      const s3Count = data.summary?.s3_access_count || data.s3_access?.length || 0
      const opsCount = data.summary?.s3_operations_count || data.s3_operations?.length || 0
      const trafficCount = data.summary?.actual_traffic_count || data.actual_traffic?.length || 0
      const ec2S3Count = ec2S3Data.count || ec2S3Data.ec2_to_s3_traffic?.length || 0

      alert(`Fetched traffic data! Check browser console (F12) for details.\n\nFound:\n- ${s3Count} S3 access relationships\n- ${opsCount} S3 operations\n- ${trafficCount} traffic flows\n- ${ec2S3Count} EC2-to-S3 connections`)

    } catch (error) {
      console.error('Error fetching traffic data:', error)
      alert(`Error fetching traffic data: ${error}\n\nMake sure backend is running on ${BACKEND_URL}`)
    } finally {
      setIsLoading(false)
    }
  }

  const simulateTraffic = async () => {
    setIsSimulating(true)
    try {
      const params = new URLSearchParams({
        source: simSource,
        target: simTarget,
        days: simDays.toString(),
        events_per_day: simEventsPerDay.toString(),
        operations: "s3:GetObject,s3:PutObject,s3:GetObjectTagging,s3:ListBucket,s3:DeleteObject,s3:HeadObject"
      })

      const response = await fetch(`${BACKEND_URL}/api/debug/simulate-traffic?${params}`, {
        method: 'POST'
      })

      const data = await response.json()

      if (data.success) {
        console.log('Traffic simulated:', data)
        alert(`Traffic Simulated!\n\n${data.message}\n\nRefresh the graph to see the new connection.`)
        setShowSimulator(false)
      } else {
        alert(`Error: ${data.detail || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error simulating traffic:', error)
      alert(`Error: ${error}`)
    } finally {
      setIsSimulating(false)
    }
  }

  const applyScenario = (scenario: typeof DEMO_SCENARIOS[0]) => {
    if (scenario.source) {
      setSimSource(scenario.source)
      setSimTarget(scenario.target)
      setSimDays(scenario.days)
      setSimEventsPerDay(scenario.eventsPerDay)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* Header */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">AWS Architecture Graph</h1>
            <p className="text-slate-600 mt-1">
              Real-time topology from Neo4j • Live resource discovery
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSimulator(true)}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Simulate Traffic
            </button>
            <button
              onClick={fetchTrafficFromDB}
              disabled={isLoading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Loading...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Push Data from DB
                </>
              )}
            </button>
            {lastFetch && (
              <span className="text-xs text-slate-500">Last: {lastFetch}</span>
            )}
            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
              Live
            </span>
          </div>
        </div>
      </div>

      {/* Main Content - Topology + Impact Panel */}
      <div className="flex gap-6 h-[calc(100vh-200px)]">
        {/* Topology Map - Left Side */}
        <div className="flex-1 min-w-0">
          <AWSTopologyMapLive 
            systemName="alon-prod"
            autoRefreshInterval={30}
            height="100%"
            showLegend={true}
            showMiniMap={true}
          />
        </div>

        {/* Resource Impact Panel - Right Side */}
        <div className="w-[380px] flex-shrink-0">
          <ResourceImpactPanel />
        </div>
      </div>

      {/* Traffic Simulator Modal */}
      {showSimulator && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowSimulator(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[500px] max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Simulate Traffic
              </h2>
              <button onClick={() => setShowSimulator(false)} className="p-1 hover:bg-white/20 rounded">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Quick Scenarios */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Quick Scenarios</label>
                <div className="flex flex-wrap gap-2">
                  {DEMO_SCENARIOS.slice(0, -1).map((scenario, i) => (
                    <button
                      key={i}
                      onClick={() => applyScenario(scenario)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm transition-colors"
                    >
                      {scenario.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Source */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Source Resource</label>
                <input
                  type="text"
                  value={simSource}
                  onChange={(e) => setSimSource(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="e.g., SafeRemediate-Test-App-1"
                />
              </div>

              {/* Target */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Target S3 Bucket</label>
                <input
                  type="text"
                  value={simTarget}
                  onChange={(e) => setSimTarget(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="e.g., my-bucket-name"
                />
              </div>

              {/* Days & Events */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Days of History</label>
                  <input
                    type="number"
                    value={simDays}
                    onChange={(e) => setSimDays(parseInt(e.target.value) || 30)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    min="1"
                    max="730"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Events per Day</label>
                  <input
                    type="number"
                    value={simEventsPerDay}
                    onChange={(e) => setSimEventsPerDay(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    min="1"
                    max="100"
                  />
                </div>
              </div>

              {/* Summary */}
              <div className="p-3 bg-slate-50 rounded-lg text-sm text-slate-600">
                <strong>Will simulate:</strong> {simDays * simEventsPerDay} total events over {simDays} days ({Math.round(simDays/30)} months)
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowSimulator(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={simulateTraffic}
                  disabled={isSimulating || !simSource || !simTarget}
                  className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {isSimulating ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Simulating...
                    </>
                  ) : (
                    'Simulate Traffic'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
// Deploy trigger: 1767362733
