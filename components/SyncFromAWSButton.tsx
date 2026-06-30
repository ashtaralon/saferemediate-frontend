"use client"

import { Zap, RefreshCw, CheckCircle, XCircle } from "lucide-react"
import { useSyncFromAWS } from "@/hooks/use-sync-from-aws"

interface SyncFromAWSButtonProps {
  onSyncComplete?: () => void
  className?: string
}

export function SyncFromAWSButton({ onSyncComplete, className = "" }: SyncFromAWSButtonProps) {
  const { syncing, progress, syncMessage, results, startSync } = useSyncFromAWS({
    onComplete: onSyncComplete,
    pollIntervalMs: 5000,
    autoClearMessageMs: 0,
  })

  const progressPercent = progress?.percent || 0
  const currentStepLabel = progress?.label || "Starting..."
  const showResult = syncMessage && !syncing

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <button
        onClick={() => void startSync()}
        disabled={syncing}
        className="flex items-center gap-2 px-4 py-2 bg-[#8b5cf6] text-white rounded-lg hover:bg-[#7c3aed] disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
      >
        {syncing ? (
          <>
            <RefreshCw className="w-4 h-4 animate-spin" />
            Syncing...
          </>
        ) : (
          <>
            <Zap className="w-4 h-4" />
            Sync from AWS
          </>
        )}
      </button>

      {syncing && progress && (
        <div className="p-3 rounded-lg bg-[#3b82f610] border border-[#3b82f640]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-[#3b82f6]">
              Step {progress.step}/{progress.total}: {currentStepLabel}
            </span>
            <span className="text-sm text-[#3b82f6]">{progressPercent}%</span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-xs text-[#3b82f6] mt-2">
            Full 36-step pipeline — may take several minutes. You can leave this page and come back.
          </p>
        </div>
      )}

      {showResult && (
        <div
          className={`p-3 rounded-lg text-sm ${
            syncMessage.type === "success"
              ? "bg-[#22c55e10] text-[#22c55e] border border-[#22c55e40]"
              : "bg-[#ef444410] text-[#ef4444] border border-[#ef444440]"
          }`}
        >
          <div className="flex items-center gap-2">
            {syncMessage.type === "success" ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <XCircle className="w-4 h-4" />
            )}
            <span className="font-medium">{syncMessage.text}</span>
          </div>

          {syncMessage.type === "success" && results && (
            <div className="mt-2 space-y-1 text-xs">
              {results.resource_collectors && (
                <div>
                  Resources:{" "}
                  {Object.entries(results.resource_collectors as Record<string, any>)
                    .filter(([_, v]) => v && !v.error)
                    .map(([k, v]: [string, any]) => `${k}: ${v.nodes_created || 0}`)
                    .join(", ")}
                </div>
              )}
              <div>
                Tag Sync:{" "}
                {(results.tag_sync as any)?.summary?.aws_resources_with_systemname || 0} resources
              </div>
              <div>
                Flow Logs:{" "}
                {(results.flow_logs as any)?.relationships_created || 0} relationships
              </div>
              <div>
                CloudTrail:{" "}
                {((results.cloudtrail as any)?.advisor_relationships || 0) +
                  ((results.cloudtrail as any)?.api_call_relationships || 0)}{" "}
                events,{" "}
                {(results.cloudtrail as any)?.resource_access_relationships || 0} resources discovered
              </div>
              <div>
                IAM Analyzer:{" "}
                {((results.iam_analyzer as any)?.external_access_relationships || 0) +
                  ((results.iam_analyzer as any)?.unused_permission_relationships || 0)}{" "}
                findings
              </div>
              <div>
                AWS Config:{" "}
                {((results.aws_config as any)?.config_relationships || 0) +
                  ((results.aws_config as any)?.violations || 0)}{" "}
                items
              </div>
              <div>
                X-Ray:{" "}
                {((results.xray as any)?.calls_relationships || 0) +
                  ((results.xray as any)?.traffic_relationships || 0)}{" "}
                traces
              </div>
              <div>
                Security Groups:{" "}
                {(results.security_groups as any)?.total_security_groups || 0} groups,{" "}
                {(results.security_groups as any)?.total_rules || 0} rules
              </div>
              <div>
                NACLs:{" "}
                {(results.nacls as any)?.nacls_processed ||
                  (results.nacls as any)?.total_nacls ||
                  0}{" "}
                ACLs
              </div>
              <div>
                S3 Access Logs:{" "}
                {(results.s3_access_logs as any)?.total_relationships ||
                  (results.s3_access_logs as any)?.relationships_created ||
                  0}{" "}
                access patterns
              </div>
              <div>
                RDS Query Logs:{" "}
                {(results.rds_query_logs as any)?.total_relationships ||
                  (results.rds_query_logs as any)?.relationships_created ||
                  0}{" "}
                query patterns
              </div>
              <div>
                Behavioral Sync:{" "}
                {(() => {
                  const bs = results.behavioral_sync as any
                  if (!bs || bs.error) return "0"
                  const traffic = bs.traffic?.patterns_created || 0
                  const perms = bs.permissions?.total_permissions_found || 0
                  const s3 = bs.s3_access?.buckets_with_access || 0
                  const findings = bs.security_findings?.findings_total || 0
                  return `${traffic} traffic, ${perms} permissions, ${s3} S3, ${findings} findings`
                })()}
              </div>
              {results.visibility_signals && (
                <div>
                  Visibility Signals:{" "}
                  {(results.visibility_signals as any).trust_policies?.roles_updated || 0} trust
                  policies,{" "}
                  {(results.visibility_signals as any).trust_policies?.cross_account_roles || 0}{" "}
                  cross-account,{" "}
                  {(results.visibility_signals as any).access_advisor?.roles_updated || 0} Access
                  Advisor,{" "}
                  {((results.visibility_signals as any).cloudtrail_config?.data_events_enabled ||
                    []).length}{" "}
                  data event services
                </div>
              )}
              <div>
                Auto-Tagger: {(results.auto_tagger as any)?.tagged || 0} resources tagged
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
