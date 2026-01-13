"use client"

import { useMemo } from "react"
import { Globe, Server, Database, Cloud, HardDrive, Zap, Network, Shield, Key, Box, MessageSquare, Radio, Calendar } from "lucide-react"
import type { Flow, FlowNode, FlowCheckpoint, FlowSegment, NodeType, FlowStripProps } from "./types"

// Node type icons and colors
const NODE_CONFIG: Record<NodeType, { icon: typeof Globe; color: string; bg: string; label: string }> = {
  internet: { icon: Globe, color: 'text-red-500', bg: 'bg-red-50', label: 'Internet' },
  compute: { icon: Server, color: 'text-blue-500', bg: 'bg-blue-50', label: 'EC2' },
  database: { icon: Database, color: 'text-purple-500', bg: 'bg-purple-50', label: 'RDS' },
  storage: { icon: HardDrive, color: 'text-green-500', bg: 'bg-green-50', label: 'S3' },
  lambda: { icon: Zap, color: 'text-amber-500', bg: 'bg-amber-50', label: 'Lambda' },
  api_gateway: { icon: Network, color: 'text-indigo-500', bg: 'bg-indigo-50', label: 'API GW' },
  load_balancer: { icon: Network, color: 'text-cyan-500', bg: 'bg-cyan-50', label: 'ALB' },
  step_functions: { icon: Calendar, color: 'text-pink-500', bg: 'bg-pink-50', label: 'Step Fn' },
  dynamodb: { icon: Database, color: 'text-orange-500', bg: 'bg-orange-50', label: 'DynamoDB' },
  sqs: { icon: MessageSquare, color: 'text-rose-500', bg: 'bg-rose-50', label: 'SQS' },
  sns: { icon: Radio, color: 'text-violet-500', bg: 'bg-violet-50', label: 'SNS' },
  eventbridge: { icon: Calendar, color: 'text-teal-500', bg: 'bg-teal-50', label: 'EventBridge' },
  alb: { icon: Network, color: 'text-cyan-500', bg: 'bg-cyan-50', label: 'ALB' },
  vpc_endpoint: { icon: Network, color: 'text-indigo-500', bg: 'bg-indigo-50', label: 'VPC Endpoint' },
  secrets_manager: { icon: Key, color: 'text-yellow-500', bg: 'bg-yellow-50', label: 'Secrets' },
}

// Checkpoint icons
const CHECKPOINT_CONFIG: Record<string, { icon: typeof Shield; color: string; bg: string; ring: string; label: string }> = {
  security_group: { icon: Shield, color: 'text-orange-600', bg: 'bg-orange-100', ring: 'ring-orange-300', label: 'SG' },
  iam_role: { icon: Key, color: 'text-pink-600', bg: 'bg-pink-100', ring: 'ring-pink-300', label: 'Role' },
  nacl: { icon: Network, color: 'text-cyan-600', bg: 'bg-cyan-100', ring: 'ring-cyan-300', label: 'NACL' },
}

// Format numbers
function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`
  return n.toString()
}

// Format time ago
function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d`
}

// Node component with stats
function FlowNodeDisplay({ node, showStats = true }: { node: FlowNode; showStats?: boolean }) {
  const config = NODE_CONFIG[node.type]
  const Icon = config.icon

  return (
    <div className="flex flex-col items-center gap-0.5 min-w-[70px]">
      <div className={`w-10 h-10 ${config.bg} rounded-xl flex items-center justify-center border border-gray-200 shadow-sm`}>
        <Icon className={`w-5 h-5 ${config.color}`} />
      </div>
      <span className="text-xs font-semibold text-gray-800 max-w-[80px] truncate text-center">
        {node.shortName || node.name}
      </span>
      {showStats && (
        <div className="text-[10px] text-gray-400 text-center">
          {node.sourceCount && <span>{node.sourceCount} sources</span>}
          {node.instanceId && <span>{node.instanceId}</span>}
          {node.queryCount && <span>{node.queryCount} queries</span>}
          {node.operationCount && <span>{node.operationCount} ops</span>}
        </div>
      )}
    </div>
  )
}

// Checkpoint (gate) component - sits ON the flow line
function CheckpointGate({ checkpoint }: { checkpoint: FlowCheckpoint }) {
  const config = CHECKPOINT_CONFIG[checkpoint.type]
  const Icon = config.icon
  const hasGap = checkpoint.gapCount && checkpoint.gapCount > 0
  const ratio = checkpoint.totalCount > 0 ? checkpoint.usedCount / checkpoint.totalCount : 1

  return (
    <div className="flex flex-col items-center gap-0.5 relative group mx-1">
      {/* Gate circle */}
      <div
        className={`w-8 h-8 rounded-full ${config.bg} ring-2 ${config.ring} flex items-center justify-center cursor-pointer hover:scale-110 transition-transform shadow-sm ${hasGap ? 'ring-amber-400' : ''}`}
        title={`${checkpoint.shortName || checkpoint.name}: ${checkpoint.usedCount}/${checkpoint.totalCount}`}
      >
        <Icon className={`w-4 h-4 ${config.color}`} />
      </div>

      {/* Stats below */}
      <div className="text-center">
        <span className={`text-[10px] font-bold ${hasGap ? 'text-amber-600' : 'text-gray-600'}`}>
          {checkpoint.usedCount}/{checkpoint.totalCount}
        </span>
        {hasGap && (
          <div className="text-[9px] text-amber-600 font-medium">
            [Gap:{checkpoint.gapCount}]
          </div>
        )}
      </div>

      {/* Tooltip on hover */}
      <div className="absolute bottom-full mb-2 hidden group-hover:block z-50 pointer-events-none">
        <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg">
          <div className="font-semibold">{checkpoint.shortName || checkpoint.name}</div>
          <div className="text-gray-300 mt-1">
            {checkpoint.usedCount} of {checkpoint.totalCount} {checkpoint.type === 'security_group' ? 'rules' : 'perms'} used
          </div>
          {checkpoint.unusedItems.length > 0 && (
            <div className="text-amber-400 mt-1 font-medium">
              {checkpoint.unusedItems.length} unused - removal candidates
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Animated flow line with particles
function FlowLine({ requestCount, label, animate, hasTraffic = true }: { requestCount: number; label?: string; animate: boolean; hasTraffic?: boolean }) {
  // More particles for higher traffic
  const particleCount = Math.min(Math.max(Math.ceil(requestCount / 500), 1), 4)

  return (
    <div className="flex-1 relative mx-1 min-w-[30px] flex items-center">
      {/* Line */}
      <div className={`flex-1 h-[3px] ${hasTraffic ? 'bg-gray-300' : 'bg-gray-200'} rounded-full relative`}>
        {/* Animated particles */}
        {animate && hasTraffic && Array.from({ length: particleCount }).map((_, i) => (
          <div
            key={i}
            className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-emerald-500 rounded-full shadow-sm shadow-emerald-300"
            style={{
              animation: `flowParticle 1.5s linear infinite`,
              animationDelay: `${(i * 1.5) / particleCount}s`,
            }}
          />
        ))}
      </div>

      {/* Arrow */}
      <div className="w-0 h-0 border-l-[6px] border-l-gray-400 border-y-[4px] border-y-transparent" />

      {/* Label above line */}
      {label && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] text-gray-500 font-mono whitespace-nowrap bg-white px-1 rounded">
          {label}
        </div>
      )}

      {/* Request count below line */}
      {requestCount > 0 && (
        <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-emerald-600 font-semibold whitespace-nowrap">
          {formatNumber(requestCount)}
        </div>
      )}
    </div>
  )
}

export function FlowStrip({ flow, selected, onSelect, animate = true }: FlowStripProps) {
  const statusColors = {
    active: 'border-emerald-200 bg-gradient-to-r from-emerald-50/50 to-white',
    idle: 'border-gray-200 bg-gray-50/50',
    warning: 'border-amber-200 bg-gradient-to-r from-amber-50/50 to-white',
    blocked: 'border-red-200 bg-gradient-to-r from-red-50/50 to-white',
  }

  const statusBadge = {
    active: { bg: 'bg-emerald-500', text: 'Active', pulse: true },
    idle: { bg: 'bg-gray-400', text: 'Idle', pulse: false },
    warning: { bg: 'bg-amber-500', text: 'Warning', pulse: false },
    blocked: { bg: 'bg-red-500', text: 'Blocked', pulse: false },
  }

  return (
    <div
      onClick={onSelect}
      className={`border-2 rounded-xl overflow-hidden cursor-pointer transition-all hover:shadow-lg ${
        selected ? 'ring-2 ring-indigo-500 border-indigo-300 shadow-lg' : statusColors[flow.status]
      }`}
    >
      {/* Header */}
      <div className="px-4 py-2.5 border-b bg-white/80 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-bold text-gray-900">
            {flow.pathDescription}
          </span>
          {flow.totalGaps > 0 && (
            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-bold rounded-full">
              ⚠ {flow.totalGaps} gaps
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${statusBadge[flow.status].bg} ${statusBadge[flow.status].pulse ? 'animate-pulse' : ''}`} />
            <span className="text-xs font-medium text-gray-600">{statusBadge[flow.status].text}</span>
          </div>
          <span className="text-xs text-gray-400">last {formatTimeAgo(flow.lastActivity)}</span>
        </div>
      </div>

      {/* Flow visualization */}
      <div className="px-6 py-6 flex items-center justify-center overflow-x-auto">
        {/* Source node */}
        <FlowNodeDisplay node={flow.source} />

        {/* Segments with checkpoints */}
        {flow.segments.map((segment, segIdx) => (
          <div key={segIdx} className="flex items-center">
            {/* Flow line with optional port label */}
            <FlowLine
              requestCount={segment.requestCount}
              label={segment.port ? `:${segment.port}` : segment.label}
              animate={animate && flow.status === 'active'}
            />

            {/* Checkpoints on this segment */}
            {segment.checkpoints.map((cp) => (
              <div key={cp.id} className="flex items-center">
                <CheckpointGate checkpoint={cp} />
                <FlowLine
                  requestCount={segment.requestCount}
                  animate={animate && flow.status === 'active'}
                />
              </div>
            ))}

            {/* Intermediate node (if not last segment) */}
            {segIdx < flow.segments.length - 1 && (
              <FlowNodeDisplay node={segment.to} showStats={true} />
            )}
          </div>
        ))}

        {/* Destination node */}
        <FlowNodeDisplay node={flow.destination} />
      </div>

      {/* Footer stats */}
      <div className="px-4 py-2 border-t bg-gray-50/80 flex items-center gap-6 text-xs">
        {flow.summaryStats.map((stat, idx) => (
          <span key={idx} className={stat.color || 'text-gray-600'}>
            {stat.label}: <span className="font-semibold">{stat.value}</span>
          </span>
        ))}
      </div>

      {/* CSS for particle animation */}
      <style jsx>{`
        @keyframes flowParticle {
          0% {
            left: 0%;
            opacity: 0;
          }
          5% {
            opacity: 1;
          }
          95% {
            opacity: 1;
          }
          100% {
            left: calc(100% - 8px);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  )
}
