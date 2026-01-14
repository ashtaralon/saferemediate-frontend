'use client';

import React, { useState } from 'react';
import {
  X, ChevronDown, ChevronRight, Key, Server, Database, Shield, Zap, Layers,
  AlertTriangle, Lightbulb, BarChart3, Wrench, Check, Globe
} from 'lucide-react';
import type {
  ResourcePopupResponse,
  ConfidenceLevel,
  Plane,
  RiskLevel,
} from '@/types/template-types';

// =============================================================================
// CONSTANTS
// =============================================================================

const RESOURCE_ICONS: Record<string, React.ComponentType<any>> = {
  key: Key,
  server: Server,
  database: Database,
  shield: Shield,
  zap: Zap,
  layers: Layers,
  box: Server,
};

// =============================================================================
// COLLAPSIBLE SECTION COMPONENT
// =============================================================================

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  badge?: { text: string; color: string };
  defaultOpen?: boolean;
  children: React.ReactNode;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  icon,
  badge,
  defaultOpen = false,
  children,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="mb-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between py-2 text-left hover:bg-white/5 rounded transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-white font-medium">{title}</span>
          {badge && (
            <span
              className="px-2 py-0.5 rounded text-xs font-medium"
              style={{ backgroundColor: badge.color, color: 'white' }}
            >
              {badge.text}
            </span>
          )}
        </div>
        {isOpen ? (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronRight className="w-5 h-5 text-gray-400" />
        )}
      </button>
      {isOpen && <div className="mt-2">{children}</div>}
    </div>
  );
};

// =============================================================================
// HEADER SECTION
// =============================================================================

interface HeaderProps {
  data: ResourcePopupResponse;
  onClose?: () => void;
}

const Header: React.FC<HeaderProps> = ({ data, onClose }) => {
  const IconComponent = RESOURCE_ICONS[data.header.icon] || Key;

  return (
    <div className="flex items-start justify-between mb-6">
      <div className="flex items-start gap-3">
        <div
          className="w-12 h-12 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${data.header.color}30` }}
        >
          <IconComponent className="w-6 h-6" style={{ color: data.header.color }} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">
            {data.header.identity.name || data.header.resource_id}
          </h2>
          <p className="text-gray-400 text-sm">{data.header.display_name}</p>
          <div className="flex items-center gap-2 mt-2">
            {data.header.identity.system_name && (
              <span className="px-2 py-1 bg-blue-600 text-white text-xs rounded font-medium">
                {data.header.identity.system_name}
              </span>
            )}
            <span className="text-gray-400 text-sm">• Production</span>
          </div>
          <p className="text-gray-500 text-sm mt-1">
            Last seen: {data.header.last_seen ? formatDateTime(data.header.last_seen) : 'Unknown'}
          </p>
        </div>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
      )}
    </div>
  );
};

// =============================================================================
// WHAT'S BROAD SECTION
// =============================================================================

interface WhatsBroadProps {
  data: ResourcePopupResponse;
}

const WhatsBroadSection: React.FC<WhatsBroadProps> = ({ data }) => {
  const iamRole = data.what_allowed.identity.iam_role;
  const allowedCount = iamRole?.allowed_count ?? 0;
  const usedCount = iamRole?.used_count ?? 0;

  // For network resources, use security group rules
  const sgRulesCount = data.what_allowed.network.security_groups.reduce(
    (acc, sg) => acc + sg.inbound_rules_count + sg.outbound_rules_count,
    0
  );

  const resourceName = data.header.identity.name || data.header.resource_id;

  // Check data availability
  const iamSummary = data.gap_analysis?.identity?.summary as any;
  const hasAllowedData = iamSummary?.allowed_data_available ?? (allowedCount > 0 || sgRulesCount > 0);
  const hasUsedData = iamSummary?.used_data_available ?? (usedCount > 0 ||
    data.what_happened.summary.total_inbound + data.what_happened.summary.total_outbound > 0);

  const displayAllowed = allowedCount || sgRulesCount;
  const displayUsed = usedCount || data.what_happened.summary.total_inbound + data.what_happened.summary.total_outbound;

  // Format display with unknown handling
  const formatSummary = () => {
    if (!hasAllowedData && !hasUsedData) {
      return 'Usage data unavailable';
    }
    if (!hasUsedData) {
      return `${displayAllowed} allowed (usage unknown)`;
    }
    return `${displayUsed}/${displayAllowed} permissions used`;
  };

  return (
    <CollapsibleSection
      title="What's Broad"
      icon={<AlertTriangle className="w-5 h-5 text-yellow-500" />}
      badge={{ text: 'Current Config', color: '#F59E0B' }}
      defaultOpen={true}
    >
      {/* Purple summary bar */}
      <div className="bg-purple-600 rounded-lg p-3 mb-3">
        <span className="text-white font-medium">
          {resourceName} - {formatSummary()}
        </span>
      </div>

      {/* Stats */}
      <div className="space-y-2 text-gray-300">
        <div className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded">
          <span>
            {hasAllowedData ? `${displayAllowed} permissions allowed` : 'Allowed permissions unavailable'}
          </span>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded">
          <span>
            {hasUsedData ? `${displayUsed} permissions used` : 'Used permissions unavailable'}
          </span>
        </div>
      </div>
    </CollapsibleSection>
  );
};

// =============================================================================
// WHY IT'S RISKY SECTION
// =============================================================================

interface WhyItsRiskyProps {
  data: ResourcePopupResponse;
}

const WhyItsRiskySection: React.FC<WhyItsRiskyProps> = ({ data }) => {
  const insights = data.insights || [];
  const riskLevel = data.gap_analysis.overall.risk_level;

  return (
    <CollapsibleSection
      title="Why It's Risky"
      icon={<Lightbulb className="w-5 h-5 text-yellow-400" />}
      defaultOpen={false}
    >
      {insights.length > 0 ? (
        <div className="space-y-2">
          {insights.map((insight, idx) => (
            <div
              key={idx}
              className={`px-3 py-2 rounded text-sm ${
                insight.severity === 'critical'
                  ? 'bg-red-500/20 text-red-300'
                  : insight.severity === 'warning'
                  ? 'bg-yellow-500/20 text-yellow-300'
                  : 'bg-blue-500/20 text-blue-300'
              }`}
            >
              {insight.text}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-gray-400 text-sm px-3 py-2">
          {riskLevel === 'low'
            ? 'No significant risks identified.'
            : 'Risk analysis in progress...'}
        </div>
      )}
    </CollapsibleSection>
  );
};

// =============================================================================
// WHAT'S ACTUALLY USED SECTION
// =============================================================================

interface WhatsActuallyUsedProps {
  data: ResourcePopupResponse;
}

const WhatsActuallyUsedSection: React.FC<WhatsActuallyUsedProps> = ({ data }) => {
  const iamRole = data.what_allowed.identity.iam_role;
  const resourceName = data.header.identity.name || data.header.resource_id;
  const usedCount = iamRole?.used_count || 0;
  const allowedCount = iamRole?.allowed_count || 0;

  // Determine confidence/evidence status
  const hasObserved = data.header.plane_coverage.observed?.available;
  const observedSource = data.what_happened.source || 'CloudTrail';

  return (
    <CollapsibleSection
      title="What's Actually Used"
      icon={<BarChart3 className="w-5 h-5 text-blue-400" />}
      badge={{ text: 'Behavioral Evidence', color: '#EC4899' }}
      defaultOpen={true}
    >
      {/* Credential context */}
      <div className="bg-purple-600/30 border border-purple-500/50 rounded-lg p-3 mb-3">
        <span className="text-purple-300">
          Credential context:{' '}
          <span className="text-purple-200 font-medium">
            {resourceName} - {data.header.display_name}
          </span>
        </span>
      </div>

      {/* Activity stats */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-green-400">
          Last activity:{' '}
          <span className="font-medium">{usedCount} permissions observed in use</span>
        </span>
        <span className="flex items-center gap-1 text-gray-400">
          <span className="w-2 h-2 rounded-full bg-green-500"></span>
          IAM: {allowedCount} permissions analyzed
        </span>
      </div>
    </CollapsibleSection>
  );
};

// =============================================================================
// RECOMMENDED TIGHTENING SECTION
// =============================================================================

interface RecommendedTighteningProps {
  data: ResourcePopupResponse;
}

const RecommendedTighteningSection: React.FC<RecommendedTighteningProps> = ({ data }) => {
  const iamRole = data.what_allowed.identity.iam_role;
  const resourceName = data.header.identity.name || data.header.resource_id;
  const allowedCount = iamRole?.allowed_count ?? 0;
  const usedCount = iamRole?.used_count ?? 0;
  const unusedCount = data.gap_analysis.identity.summary.unobserved_count ?? 0;

  // Check data availability - distinguish "0" from "unknown"
  const iamSummary = data.gap_analysis.identity.summary as any;
  const networkSummary = data.gap_analysis.network.summary as any;

  const hasAllowedData = iamSummary?.allowed_data_available ?? (allowedCount > 0);
  const hasUsedData = iamSummary?.used_data_available ?? (usedCount > 0);
  const hasConfidence = data.gap_analysis.confidence_sufficient;

  // Determine the state
  const hasChanges = unusedCount > 0 || (networkSummary?.unobserved_count ?? 0) > 0;
  const dataUnavailable = !hasAllowedData || !hasUsedData || !hasConfidence;
  const reason = iamSummary?.reason || networkSummary?.reason;

  // Helper to format count display
  const formatCount = (count: number, dataAvailable: boolean, label: string) => {
    if (!dataAvailable) return `${label} unavailable`;
    return `${count} ${label}`;
  };

  return (
    <CollapsibleSection
      title="Recommended Tightening"
      icon={<Wrench className="w-5 h-5 text-gray-400" />}
      defaultOpen={true}
    >
      {/* Two column layout */}
      <div className="grid grid-cols-2 gap-4">
        {/* Replace column */}
        <div>
          <div className="flex items-center gap-1 text-red-400 mb-2">
            <X className="w-4 h-4" />
            <span className="text-sm font-medium">Replace</span>
          </div>
          <div className="space-y-2">
            <div className="bg-gray-700/50 rounded px-3 py-2 text-gray-300 text-sm">
              {resourceName}
            </div>
            <div className="bg-gray-700/50 rounded px-3 py-2 text-gray-300 text-sm">
              {formatCount(allowedCount, hasAllowedData, 'permissions allowed')}
            </div>
          </div>
        </div>

        {/* With column */}
        <div>
          <div className="flex items-center gap-1 text-green-400 mb-2">
            <Check className="w-4 h-4" />
            <span className="text-sm font-medium">With</span>
          </div>
          <div className="space-y-2">
            {dataUnavailable ? (
              // Show when data is missing - NEVER show "All used" or "No changes"
              <>
                <div className="bg-yellow-600/20 rounded px-3 py-2 text-yellow-300 text-sm">
                  Cannot determine (insufficient data)
                </div>
                <div className="bg-yellow-600/20 rounded px-3 py-2 text-yellow-300 text-sm">
                  {reason || 'Enable CloudTrail for analysis'}
                </div>
              </>
            ) : hasChanges ? (
              // Show when we have changes to recommend
              <>
                <div className="bg-green-600/30 rounded px-3 py-2 text-green-300 text-sm">
                  {usedCount} permissions (remove {unusedCount})
                </div>
                <div className="bg-green-600/30 rounded px-3 py-2 text-green-300 text-sm">
                  Tighten to least privilege
                </div>
              </>
            ) : (
              // Only show "All permissions used" when we have ACTUAL data proving it
              <>
                <div className="bg-green-600/30 rounded px-3 py-2 text-green-300 text-sm">
                  All {allowedCount} permissions observed in use
                </div>
                <div className="bg-green-600/30 rounded px-3 py-2 text-green-300 text-sm">
                  No changes recommended
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </CollapsibleSection>
  );
};

// =============================================================================
// EVIDENCE SOURCES FOOTER
// =============================================================================

interface EvidenceSourcesProps {
  data: ResourcePopupResponse;
}

const EvidenceSourcesFooter: React.FC<EvidenceSourcesProps> = ({ data }) => {
  const sources = [];

  // Check which evidence sources are available based on plane coverage
  if (data.header.plane_coverage.observed?.available) {
    sources.push({ name: 'CloudTrail', available: true });
  }
  if (data.header.plane_coverage.authorized?.available) {
    sources.push({ name: 'IAM Analysis', available: true });
  }
  if (data.header.plane_coverage.configured?.available) {
    sources.push({ name: 'AWS Config', available: true });
  }

  // If no specific sources detected, show defaults
  if (sources.length === 0) {
    sources.push({ name: 'CloudTrail', available: false });
    sources.push({ name: 'IAM Analysis', available: false });
  }

  return (
    <div className="mt-6 pt-4 border-t border-gray-700">
      <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">
        Evidence Sources
      </p>
      <div className="flex flex-wrap gap-2">
        {sources.map((source, idx) => (
          <span
            key={idx}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
              source.available
                ? 'bg-gray-700 text-gray-300'
                : 'bg-gray-800 text-gray-500'
            }`}
          >
            {source.available && <Check className="w-3 h-3 text-green-400" />}
            {source.name}
          </span>
        ))}
      </div>
    </div>
  );
};

// =============================================================================
// ACTION BUTTONS
// =============================================================================

interface ActionButtonsProps {
  data: ResourcePopupResponse;
  onApplyFix?: () => void;
  onExport?: () => void;
  onClose?: () => void;
}

const ActionButtons: React.FC<ActionButtonsProps> = ({
  data,
  onApplyFix,
  onExport,
  onClose,
}) => {
  const hasRecommendations = data.gap_analysis.overall.remediation_available;

  return (
    <div className="flex gap-3 mt-6">
      <button
        onClick={onApplyFix}
        disabled={!hasRecommendations}
        className={`flex-1 py-3 rounded-lg font-medium transition-colors ${
          hasRecommendations
            ? 'bg-green-600 hover:bg-green-700 text-white'
            : 'bg-green-600/50 text-white/50 cursor-not-allowed'
        }`}
      >
        Apply Fix
      </button>
      <button
        onClick={onExport}
        className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg font-medium transition-colors"
      >
        Export
      </button>
      <button
        onClick={onClose}
        className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg font-medium transition-colors"
      >
        Close
      </button>
    </div>
  );
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function formatDateTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).replace(',', '');
  } catch {
    return dateString;
  }
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export interface UniversalTemplateRendererProps {
  data: ResourcePopupResponse;
  onClose?: () => void;
  onApplyFix?: () => void;
  onExport?: () => void;
}

export const UniversalTemplateRenderer: React.FC<UniversalTemplateRendererProps> = ({
  data,
  onClose,
  onApplyFix,
  onExport,
}) => {
  return (
    <div className="bg-gray-900 rounded-xl p-6 max-w-lg w-full shadow-2xl border border-gray-800">
      {/* Header */}
      <Header data={data} onClose={onClose} />

      {/* Sections */}
      <div className="space-y-1">
        <WhatsBroadSection data={data} />
        <WhyItsRiskySection data={data} />
        <WhatsActuallyUsedSection data={data} />
        <RecommendedTighteningSection data={data} />
      </div>

      {/* Evidence Sources */}
      <EvidenceSourcesFooter data={data} />

      {/* Action Buttons */}
      <ActionButtons
        data={data}
        onApplyFix={onApplyFix}
        onExport={onExport}
        onClose={onClose}
      />
    </div>
  );
};

export default UniversalTemplateRenderer;
