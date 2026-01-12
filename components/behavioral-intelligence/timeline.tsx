'use client'

import React, { useState } from 'react'
import {
  Clock, Activity, Eye, Settings, Shield, ChevronDown, ChevronRight,
  Network, AlertTriangle, Plus, Minus, RefreshCw
} from 'lucide-react'
import { ReconciliationBadge, PlaneBadges } from './reconciliation-badge'

interface TimelineEvent {
  ts: string
  type: string
  summary: string
  severity: string
  plane: string
  details?: Record<string, any>
  planes?: PlaneBadges
}

interface TimelineSectionProps {
  events: TimelineEvent[]
}

const getPlaneIcon = (plane: string) => {
  switch (plane.toLowerCase()) {
    case 'observed':
      return <Activity className="w-4 h-4" />
    case 'changed':
      return <Eye className="w-4 h-4" />
    case 'configured':
      return <Settings className="w-4 h-4" />
    case 'authorized':
      return <Shield className="w-4 h-4" />
    default:
      return <Clock className="w-4 h-4" />
  }
}

const getPlaneColor = (plane: string) => {
  switch (plane.toLowerCase()) {
    case 'observed':
      return {
        bg: 'bg-emerald-500',
        bgLight: 'bg-emerald-500/20',
        text: 'text-emerald-400',
        border: 'border-emerald-500/30',
      }
    case 'changed':
      return {
        bg: 'bg-blue-500',
        bgLight: 'bg-blue-500/20',
        text: 'text-blue-400',
        border: 'border-blue-500/30',
      }
    case 'configured':
      return {
        bg: 'bg-violet-500',
        bgLight: 'bg-violet-500/20',
        text: 'text-violet-400',
        border: 'border-violet-500/30',
      }
    case 'authorized':
      return {
        bg: 'bg-amber-500',
        bgLight: 'bg-amber-500/20',
        text: 'text-amber-400',
        border: 'border-amber-500/30',
      }
    default:
      return {
        bg: 'bg-slate-500',
        bgLight: 'bg-slate-500/20',
        text: 'text-slate-400',
        border: 'border-slate-500/30',
      }
  }
}

const getEventTypeIcon = (type: string) => {
  const typeLower = type.toLowerCase()
  if (typeLower.includes('new') || typeLower.includes('create') || typeLower.includes('add')) {
    return <Plus className="w-3 h-3" />
  }
  if (typeLower.includes('remove') || typeLower.includes('delete')) {
    return <Minus className="w-3 h-3" />
  }
  if (typeLower.includes('change') || typeLower.includes('update') || typeLower.includes('modify')) {
    return <RefreshCw className="w-3 h-3" />
  }
  if (typeLower.includes('anomaly') || typeLower.includes('alert')) {
    return <AlertTriangle className="w-3 h-3" />
  }
  if (typeLower.includes('network') || typeLower.includes('edge') || typeLower.includes('traffic')) {
    return <Network className="w-3 h-3" />
  }
  return <Activity className="w-3 h-3" />
}

const getSeverityColor = (severity: string) => {
  switch (severity.toUpperCase()) {
    case 'CRITICAL':
    case 'HIGH':
      return 'bg-rose-500/20 text-rose-400'
    case 'MEDIUM':
    case 'MED':
      return 'bg-amber-500/20 text-amber-400'
    case 'LOW':
      return 'bg-emerald-500/20 text-emerald-400'
    default:
      return 'bg-slate-600/50 text-slate-400'
  }
}

// Convert event data to plane badges
const getEventPlaneBadges = (event: TimelineEvent): PlaneBadges => {
  // If event has explicit planes data, use it
  if (event.planes) {
    return event.planes
  }

  // Otherwise infer from the event's plane
  const plane = event.plane.toLowerCase()
  return {
    observed: plane === 'observed' ? true : null,
    configured: plane === 'configured' ? true : null,
    authorized: plane === 'authorized' ? true : null,
    changed: plane === 'changed' ? true : null,
  }
}

const formatTimestamp = (ts: string) => {
  const date = new Date(ts)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffHours / 24)

  if (diffHours < 1) {
    const diffMins = Math.floor(diffMs / (1000 * 60))
    return `${diffMins}m ago`
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`
  }
  if (diffDays < 7) {
    return `${diffDays}d ago`
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const TimelineItem: React.FC<{
  event: TimelineEvent
  isExpanded: boolean
  onToggle: () => void
  isLast: boolean
}> = ({ event, isExpanded, onToggle, isLast }) => {
  const planeColor = getPlaneColor(event.plane)

  return (
    <div className="relative">
      {/* Timeline Line */}
      {!isLast && (
        <div className={`absolute left-[19px] top-10 w-0.5 h-full ${planeColor.bg} opacity-30`} />
      )}

      <div className="flex gap-4">
        {/* Timeline Dot */}
        <div className={`relative z-10 w-10 h-10 rounded-full ${planeColor.bgLight} ${planeColor.border} border flex items-center justify-center`}>
          <div className={planeColor.text}>
            {getPlaneIcon(event.plane)}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 pb-6">
          <button
            onClick={onToggle}
            className="w-full text-left"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                {/* Type and Summary */}
                <div className="flex items-center gap-2 mb-1">
                  <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs ${planeColor.bgLight} ${planeColor.text}`}>
                    {getEventTypeIcon(event.type)}
                    {event.type.replace(/_/g, ' ')}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-xs ${getSeverityColor(event.severity)}`}>
                    {event.severity}
                  </span>
                </div>

                {/* Summary */}
                <p className="text-white text-sm">{event.summary}</p>

                {/* Timestamp */}
                <p className="text-xs text-slate-500 mt-1">
                  {formatTimestamp(event.ts)}
                  <span className="mx-2">|</span>
                  <span className={planeColor.text}>{event.plane} plane</span>
                </p>
              </div>

              <div className="text-slate-500">
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </div>
            </div>
          </button>

          {/* Expanded Details */}
          {isExpanded && (
            <div className="mt-3 space-y-3">
              {/* Reconciliation Badges */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Data Plane Evidence</div>
                <ReconciliationBadge planes={getEventPlaneBadges(event)} />
              </div>

              {/* Details */}
              {event.details && Object.keys(event.details).length > 0 && (
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
                  <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Details</div>
                  <div className="space-y-1">
                    {Object.entries(event.details).map(([key, value]) => (
                      <div key={key} className="flex justify-between text-sm">
                        <span className="text-slate-400">{key.replace(/_/g, ' ')}</span>
                        <span className="text-white font-mono text-xs">
                          {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export const TimelineSection: React.FC<TimelineSectionProps> = ({ events }) => {
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set())
  const [planeFilter, setPlaneFilter] = useState<string>('all')
  const [showAll, setShowAll] = useState(false)

  const toggleEvent = (idx: number) => {
    const next = new Set(expandedEvents)
    if (next.has(idx)) {
      next.delete(idx)
    } else {
      next.add(idx)
    }
    setExpandedEvents(next)
  }

  // Count by plane
  const planeCounts = events.reduce((acc, event) => {
    acc[event.plane.toLowerCase()] = (acc[event.plane.toLowerCase()] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // Filter events
  const filteredEvents = planeFilter === 'all'
    ? events
    : events.filter(e => e.plane.toLowerCase() === planeFilter)

  // Limit display
  const displayEvents = showAll ? filteredEvents : filteredEvents.slice(0, 10)

  if (events.length === 0) {
    return (
      <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-8 text-center">
        <Clock className="w-12 h-12 text-slate-600 mx-auto mb-4" />
        <p className="text-slate-400">No recent activity</p>
        <p className="text-sm text-slate-500 mt-1">
          Events will appear here as they are detected
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-4">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setPlaneFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              planeFilter === 'all'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-700/50 text-slate-400 hover:text-white'
            }`}
          >
            All ({events.length})
          </button>
          {['observed', 'changed', 'configured', 'authorized'].map((plane) => {
            const count = planeCounts[plane] || 0
            if (count === 0) return null
            const color = getPlaneColor(plane)
            return (
              <button
                key={plane}
                onClick={() => setPlaneFilter(plane)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-1.5 ${
                  planeFilter === plane
                    ? `${color.bgLight} ${color.text} border ${color.border}`
                    : 'bg-slate-700/50 text-slate-400 hover:text-white'
                }`}
              >
                {getPlaneIcon(plane)}
                {plane.charAt(0).toUpperCase() + plane.slice(1)} ({count})
              </button>
            )
          })}
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-6">
        {displayEvents.map((event, idx) => (
          <TimelineItem
            key={idx}
            event={event}
            isExpanded={expandedEvents.has(idx)}
            onToggle={() => toggleEvent(idx)}
            isLast={idx === displayEvents.length - 1}
          />
        ))}

        {/* Show More Button */}
        {filteredEvents.length > 10 && !showAll && (
          <button
            onClick={() => setShowAll(true)}
            className="w-full py-3 text-center text-sm text-slate-400 hover:text-white transition-colors"
          >
            Show {filteredEvents.length - 10} more events
          </button>
        )}

        {showAll && filteredEvents.length > 10 && (
          <button
            onClick={() => setShowAll(false)}
            className="w-full py-3 text-center text-sm text-slate-400 hover:text-white transition-colors"
          >
            Show less
          </button>
        )}
      </div>
    </div>
  )
}

export default TimelineSection
