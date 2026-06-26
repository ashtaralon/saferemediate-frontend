"use client"

/**
 * Topology v0.2 — AWS canonical-frame canvas (light theme port).
 *
 * Renders the canonical AWS architecture diagram as scaffold + places
 * Neo4j-confirmed workloads into the correct (AZ × tier) cells. Always
 * uses the same Cloud → Region → VPC → AZ × (Web / App / Data) structure
 * the operator already knows.
 *
 * Phase A (this file):
 *   - Light theme matching the mockup at design/topology-v0.2-estate.html
 *     palette (--cy-navy headline, --tier-web/app/data pastel rows,
 *     subnet-public mint, subnet-private sky, AWS-frame slate borders).
 *   - AZ collapse: only renders AZs that carry ≥1 alon-prod subnet
 *     in the system's primary VPC (drops empty demo / cross-VPC AZs).
 *   - Bigger workload chips + bigger subnet cells.
 *   - Black tier sidebars labeled WEB TIER / APPLICATION TIER / DATABASE
 *     TIER for orientation.
 *   - Encoding legend at the bottom (carmine halo = Worst etc).
 *
 * Phase B (follow-up) will add:
 *   - SG containers inside subnets (needs SG metadata in vpc_topology).
 *   - IAM control-plane strip at the bottom (needs IAMRole rollup).
 *   - Animated SVG flow lines (needs ACTUAL_TRAFFIC edges).
 *
 * Per CLAUDE.md rule #1 the scaffold is structural — service icons only
 * appear when Neo4j confirms the resource. Empty cells stay drawn with
 * honest copy.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  type IamRoleRollup,
  type ScoreTier,
  type SecurityGroupMeta,
  SIGNAL_LABEL,
  type SubnetMeta,
  type SubnetTier,
  type TopologyNode,
  type TrafficEdge,
  type TrafficEdgeClass,
  type VpcTopology,
} from "./types"

interface Props {
  vpcTopology: VpcTopology
  nodes: TopologyNode[]
  trafficEdges?: TrafficEdge[]
  selectedNodeId: string | null
  onSelect: (id: string) => void
  /**
   * Presentation mode (fullscreen map): hide diagnostic sections below the
   * AWS frame (Outside-VPC Lambdas, Stale workloads, IAM control-plane
   * strip, Traffic flow band, Encoding legend) and apply a small compact
   * layout pass on the frame itself. Inline page keeps everything.
   *
   * NO `transform: scale` — overlays measure live DOM rects, and a scaled
   * parent collapses their coordinate system (see reverted PR #227).
   */
  presentationMode?: boolean
}

const EDGE_SERVICE_TYPES = new Set([
  "S3", "KMSKey", "DynamoDB", "DynamoDBTable", "Secret", "SecretsManagerSecret",
])
const SERVERLESS_TYPES = new Set(["Lambda", "LambdaFunction"])

// Friendly metadata for the VPCE boundary chips. The AWS service-name
// suffix (e.g. "com.amazonaws.eu-west-1.s3" → "s3") maps to a label,
// the canonical endpoint type, and a one-line operator-facing purpose
// so a SOC analyst can read the canvas without already knowing what
// each PrivateLink endpoint enables.
//
// Endpoint type is also returned by the BE in `vpc_topology.edges.vpces[i].endpoint_type`;
// we fall back to that when the suffix isn't in the table, but for the
// common services keeping the type here makes the canvas robust to
// missing/blank values from older collectors.
type VpceServiceMeta = { label: string; type: "Gateway" | "Interface"; purpose: string }
const VPCE_SERVICE_META: Record<string, VpceServiceMeta> = {
  s3: { label: "Amazon S3", type: "Gateway", purpose: "Private S3 access without NAT/IGW" },
  dynamodb: { label: "Amazon DynamoDB", type: "Gateway", purpose: "Private DynamoDB API access" },
  ssm: { label: "AWS Systems Manager", type: "Interface", purpose: "Private SSM API · Session Manager" },
  ssmmessages: { label: "SSM Messages", type: "Interface", purpose: "Session Manager message channel" },
  ec2messages: { label: "EC2 Messages", type: "Interface", purpose: "SSM agent heartbeats" },
  ec2: { label: "Amazon EC2 API", type: "Interface", purpose: "Private EC2 API access" },
  kms: { label: "AWS KMS", type: "Interface", purpose: "Encryption key API" },
  secretsmanager: { label: "Secrets Manager", type: "Interface", purpose: "Private secret retrieval" },
  ecr: { label: "Amazon ECR API", type: "Interface", purpose: "Container registry API" },
  "ecr.dkr": { label: "ECR Docker", type: "Interface", purpose: "Container image pulls" },
  logs: { label: "CloudWatch Logs", type: "Interface", purpose: "Log ingestion" },
  monitoring: { label: "CloudWatch", type: "Interface", purpose: "Metric ingestion" },
  events: { label: "EventBridge", type: "Interface", purpose: "Event bus API" },
  sns: { label: "Amazon SNS", type: "Interface", purpose: "Topic publish" },
  sqs: { label: "Amazon SQS", type: "Interface", purpose: "Queue API" },
  sts: { label: "AWS STS", type: "Interface", purpose: "Token / role-assume" },
  lambda: { label: "AWS Lambda API", type: "Interface", purpose: "Invoke / manage functions" },
  rds: { label: "Amazon RDS API", type: "Interface", purpose: "RDS control-plane" },
  athena: { label: "Amazon Athena", type: "Interface", purpose: "Query API" },
  "execute-api": { label: "API Gateway", type: "Interface", purpose: "Private API Gateway routing" },
}

/**
 * PrivateLink-style VPCE icon — solid purple square background with a
 * white shield-and-arrow inner glyph (mirrors the AWS official
 * VPC Endpoint icon language: a "gated portal" between the VPC and a
 * regional service). Same icon for every VPCE — service identity lives
 * in the chip text — so the boundary strip stays scannable.
 */
function VpceIcon({ size = 32 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      aria-hidden="true"
      style={{ display: "block" }}
    >
      {/* Purple rounded-square plate — AWS PrivateLink palette */}
      <rect x="1" y="1" width="30" height="30" rx="5" fill="#7E3FF2" />
      {/* Shield outline — the "gate" */}
      <path
        d="M16 6 L23.5 9 L23.5 16 C23.5 20 20 23 16 25 C12 23 8.5 20 8.5 16 L8.5 9 Z"
        fill="none"
        stroke="white"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      {/* Arrow piercing through — traffic entering the endpoint */}
      <path
        d="M11 15 L18 15 M15 12 L18 15 L15 18"
        stroke="white"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}


function resolveVpceMeta(serviceName: string | null | undefined, endpointTypeFallback: string | null | undefined): VpceServiceMeta {
  // Try suffix exactly (e.g. "ecr.dkr") then last segment ("s3").
  if (serviceName) {
    const parts = serviceName.split(".")
    // Try double-segment suffix first ("ecr.dkr") then single ("s3").
    const last2 = parts.slice(-2).join(".")
    const last1 = parts[parts.length - 1]
    const hit = VPCE_SERVICE_META[last2] ?? VPCE_SERVICE_META[last1]
    if (hit) return hit
    // Unknown service — return a best-guess fallback.
    const typeGuess: "Gateway" | "Interface" =
      endpointTypeFallback?.toLowerCase() === "gateway" ? "Gateway" : "Interface"
    return {
      label: last1 ? last1.toUpperCase() : "VPCE",
      type: typeGuess,
      purpose: "Private endpoint into AWS service plane",
    }
  }
  return { label: "VPCE", type: "Interface", purpose: "Private AWS service endpoint" }
}

// Mockup palette — design/topology-v0.2-estate.html CSS variables.
const PAL = {
  navy: "#0D1B2A",
  navy2: "#142536",
  teal: "#00C2A8",
  carmine: "#E04545",
  amber: "#F5A623",
  slate: "#5A6B7A",
  ink: "#1A2330",
  bg: "#F4F6F8",
  cardBg: "#FFFFFF",
  awsFrame: "#232F3E",
  awsOrange: "#FF9900",
  awsBlue: "#2E73B8",
  tierWeb: "#E8F5E9",
  tierApp: "#E3F2FD",
  tierDb: "#EDE7F6",
  subnetPublic: "#C8E6C9",
  subnetPrivate: "#BBDEFB",
} as const

const TIER_LABEL: Record<SubnetTier, string> = {
  web: "Public subnet (web tier)",
  app: "Private subnet (app tier)",
  data: "Private subnet (data tier)",
  unknown: "Unclassified subnet",
}

const TIER_SIDEBAR_LABEL: Record<Exclude<SubnetTier, "unknown">, string> = {
  web: "WEB TIER",
  app: "APPLICATION TIER",
  data: "DATABASE TIER",
}

// Tier row backgrounds — the lightest tint, used behind the AZ × tier grid.
const TIER_BG: Record<SubnetTier, string> = {
  web: PAL.tierWeb,    // mint #E8F5E9
  app: PAL.tierApp,    // sky  #E3F2FD
  data: PAL.tierDb,    // lavender #EDE7F6
  unknown: "#ECEFF1",
}

// Subnet cell backgrounds — a slightly deeper version of the row tint so the
// subnet card visually nests inside the tier row without breaking the color
// scheme. Matches the mockup's behavior where subnets share the row hue.
const SUBNET_BG: Record<SubnetTier, string> = {
  web: "#DCEFDC",   // a touch deeper than #E8F5E9
  app: "#D2E5F8",   // a touch deeper than #E3F2FD
  data: "#E0D6F0",  // a touch deeper than #EDE7F6
  unknown: "#E0E5E9",
}

// Subnet borders — yet deeper, gives the card a visible edge in the row.
const SUBNET_BORDER: Record<SubnetTier, string> = {
  web: "#A5D6A7",
  app: "#90CAF9",
  data: "#B39DDB",
  unknown: "#B0BEC5",
}

// Subnet labels — deeper still (used for the bold "Public subnet (web tier)"
// text inside each cell, plus the CIDR / subnet name).
const SUBNET_LABEL_FG: Record<SubnetTier, string> = {
  web: "#1E8E3E",   // deep green
  app: "#1565C0",   // deep blue
  data: "#4527A0",  // deep purple
  unknown: "#37474F",
}

function tierBgChip(tier: ScoreTier): string {
  switch (tier) {
    case "WORST": return "background:#E04545;color:white"
    case "HIGH":   return "background:#F36A6A;color:white"
    case "ELEVATED": return "background:#F5A623;color:#3D2A00"
    case "QUIET":  return "background:#10B981;color:white"
  }
}

function severityRing(node: TopologyNode): { ring: string; halo: string } {
  if (node.stale)        return { ring: "#9CA3AF", halo: "0 0 0 3px rgba(156,163,175,0.15)" }
  if (!node.score)       return { ring: "#CBD5E1", halo: "none" }
  switch (node.score.tier) {
    case "WORST":    return { ring: PAL.carmine, halo: "0 0 0 4px rgba(224,69,69,0.18)" }
    case "HIGH":     return { ring: PAL.carmine, halo: "0 0 0 3px rgba(224,69,69,0.12)" }
    case "ELEVATED": return { ring: PAL.amber, halo: "0 0 0 3px rgba(245,166,35,0.12)" }
    case "QUIET":    return { ring: "#10B981", halo: "0 0 0 2px rgba(16,185,129,0.10)" }
  }
}

function nodeIcon(type: string | null): { symbol: string; bg: string; fg: string } {
  switch (type) {
    case "EC2":         return { symbol: "EC2", bg: "#FF9900", fg: "#1A1A1A" }
    case "Lambda":
    case "LambdaFunction":
      return { symbol: "λ", bg: "#FF9900", fg: "#1A1A1A" }
    case "RDS":
    case "RDSInstance":
      return { symbol: "RDS", bg: "#2E73B8", fg: "white" }
    case "DynamoDB":
    case "DynamoDBTable":
      return { symbol: "DDB", bg: "#2E73B8", fg: "white" }
    case "S3":
    case "S3Bucket":
      return { symbol: "S3", bg: "#1E8E3E", fg: "white" }
    case "KMSKey":      return { symbol: "KMS", bg: "#DD344C", fg: "white" }
    case "Secret":
    case "SecretsManagerSecret":
      return { symbol: "🔐", bg: "#DD344C", fg: "white" }
    case "LoadBalancer":
    case "ALB":
    case "ApplicationLoadBalancer":
      return { symbol: "ALB", bg: "#7E57C2", fg: "white" }
    default:
      return { symbol: "?", bg: "#5A6B7A", fg: "white" }
  }
}

function WorkloadChip({
  node, selected, onClick,
}: { node: TopologyNode; selected: boolean; onClick: () => void }) {
  const stale = !!node.stale
  const { ring, halo } = severityRing(node)
  const ic = nodeIcon(node.type)
  // Edge-service observed-usage line — surfaces "in use vs idle" without
  // requiring a drawable source chip. Per the operator-trust contract:
  // a bucket touched by 19 hidden Lambdas / IAMRoles must NEVER look idle
  // just because the source side isn't a topology chip.
  const isEdgeService = node.type != null && EDGE_SERVICE_TYPES.has(node.type)
  const hasUsageData = node.observed_edge_count != null || node.observed_source_count != null
  const usageEdges = node.observed_edge_count ?? 0
  const usageSources = node.observed_source_count ?? 0
  // Compact badge — chips are 200px max so a 30-char line truncates. Use
  // short abbreviations; full long-form is in the tooltip.
  const usageLine = isEdgeService && hasUsageData
    ? (usageEdges === 0
      ? "no observed access"
      : `${usageSources} src · ${usageEdges} acc`)
    : null
  // Rich tooltip — when the BE attached a source_breakdown, show the
  // per-kind tally + top sources. Falls back to a short one-liner when
  // older BE deploys don't include the breakdown.
  const bd = node.source_breakdown
  let usageTitle = ""
  if (usageLine) {
    if (bd) {
      const lines: string[] = []
      lines.push(`Observed access: ${usageEdges} edges · ${usageSources} distinct sources`)
      lines.push("")
      const kindLines = [
        bd.visible_chip ? `${bd.visible_chip} visible workload chip${bd.visible_chip === 1 ? "" : "s"}` : null,
        bd.hidden_workload ? `${bd.hidden_workload} hidden workload${bd.hidden_workload === 1 ? "" : "s"} (snake_case-tagged Lambda/EC2)` : null,
        bd.iam_role ? `${bd.iam_role} IAM role${bd.iam_role === 1 ? "" : "s"}` : null,
        bd.iam_user ? `${bd.iam_user} IAM user${bd.iam_user === 1 ? "" : "s"}` : null,
        bd.sts_session ? `${bd.sts_session} STS session${bd.sts_session === 1 ? "" : "s"}` : null,
        bd.other ? `${bd.other} other` : null,
      ].filter((x): x is string => x !== null)
      lines.push("Source types:")
      kindLines.forEach(l => lines.push(`  • ${l}`))
      if (bd.visible_chip === 0 && usageSources > 0) {
        lines.push("")
        lines.push("No visible workload arrows.")
        lines.push("Observed sources are IAM roles or STS sessions, which")
        lines.push("are shown in evidence/detail views rather than as")
        lines.push("topology chips.")
      }
      if (bd.top_sources && bd.top_sources.length > 0) {
        lines.push("")
        lines.push("Top sources:")
        bd.top_sources.forEach(s => {
          const kindLabel = ({
            visible_chip: "Workload",
            hidden_workload: "Hidden workload",
            iam_role: "IAMRole",
            iam_user: "IAMUser",
            sts_session: "STSSession",
            other: "Other",
          } as const)[s.kind]
          lines.push(`  • ${kindLabel}: ${s.name ?? s.id ?? "?"} (${s.edge_count})`)
        })
      }
      usageTitle = "\n\n" + lines.join("\n")
    } else {
      usageTitle = `\nObserved access in graph: ${usageEdges} edges from ${usageSources} distinct sources.\nIncludes hidden sources (Lambdas, IAM roles, STS sessions) that aren't drawable workload chips.`
    }
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${node.name}${usageTitle}`}
      data-flow-id={node.id}
      className="relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left transition-shadow min-w-0 max-w-[200px] hover:shadow-md"
      style={{
        background: PAL.cardBg,
        border: `1.5px solid ${ring}`,
        boxShadow: selected
          ? `0 0 0 3px ${PAL.teal}, ${halo}`
          : halo === "none" ? undefined : halo,
        opacity: stale ? 0.62 : 1,
      }}
    >
      <span
        className="flex items-center justify-center rounded-md shrink-0"
        style={{
          background: ic.bg,
          color: ic.fg,
          width: "32px",
          height: "26px",
          fontSize: "10px",
          fontWeight: 700,
          letterSpacing: "0.04em",
        }}
      >
        {ic.symbol}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          {node.is_jewel && (
            <span style={{ color: PAL.amber, fontSize: "11px" }} title="Crown jewel">
              ♛
            </span>
          )}
          <span className="text-[12px] font-semibold truncate" style={{ color: PAL.ink }}>
            {node.name}
          </span>
        </div>
        <div
          className="text-[10px] font-mono mt-0.5 truncate"
          style={{
            color: PAL.slate,
            // Slightly dim + italic for "no observed access" so idle reads honest
            fontStyle: usageLine === "no observed access" ? "italic" : "normal",
            opacity: usageLine === "no observed access" ? 0.75 : 1,
          }}
        >
          {usageLine ?? `${node.type ?? "?"}${node.id && node.id !== node.name ? ` · ${node.id.slice(0, 24)}` : ""}`}
        </div>
      </div>
      {node.score && (
        <span
          className="text-[11px] font-bold px-1.5 py-0.5 rounded shrink-0"
          style={{ ...Object.fromEntries(tierBgChip(node.score.tier).split(';').map(p => p.split(':') as [string, string])) }}
        >
          {node.score.value}
        </span>
      )}
      {stale && (
        <span className="text-[9px] font-bold shrink-0" style={{ color: PAL.slate }}>STALE</span>
      )}
    </button>
  )
}

function SubnetCell({
  tier, az, subnetsHere, workloadsHere, sgIndex, selectedNodeId, onSelect,
  compact = false,
}: {
  tier: SubnetTier
  az: string
  subnetsHere: SubnetMeta[]
  workloadsHere: TopologyNode[]
  sgIndex: Map<string, SecurityGroupMeta>
  selectedNodeId: string | null
  onSelect: (id: string) => void
  compact?: boolean
}) {
  const empty = subnetsHere.length === 0
  const labelFg = SUBNET_LABEL_FG[tier]
  return (
    <div
      className={compact ? "rounded-md p-2" : "rounded-md p-3"}
      style={{
        background: empty ? "transparent" : SUBNET_BG[tier],
        border: empty ? `1px dashed ${PAL.slate}80` : `1.5px solid ${SUBNET_BORDER[tier]}`,
        minHeight: compact ? "70px" : "110px",
        opacity: empty ? 0.55 : 1,
      }}
    >
      <div className={compact ? "flex items-baseline justify-between mb-1" : "flex items-baseline justify-between mb-1.5"}>
        <div
          className="text-[11px] uppercase tracking-[0.12em] font-bold"
          style={{ color: labelFg }}
        >
          {TIER_LABEL[tier]}
        </div>
        <div className="text-[10px] font-mono font-semibold" style={{ color: labelFg, opacity: 0.85 }}>
          {subnetsHere.length === 0 ? "—" : subnetsHere.map(s => s.cidr ?? s.name).join(" · ")}
        </div>
      </div>

      {empty ? (
        <div className="text-[11px] italic" style={{ color: PAL.slate }}>
          no {tier} subnet observed in {az}
        </div>
      ) : (
        <>
          <div className={compact ? "space-y-0.5 mb-1" : "space-y-0.5 mb-2"}>
            {subnetsHere.map(s => (
              <div
                key={s.id}
                className="text-[10px] font-mono font-semibold truncate"
                style={{ color: labelFg, opacity: 0.85 }}
              >
                {s.name}
              </div>
            ))}
          </div>
          {workloadsHere.length === 0 ? (
            <div className="text-[11px] italic" style={{ color: PAL.slate }}>
              no workloads here
            </div>
          ) : (
            // Group workloads by their security_group_ids. Workloads in
            // the same SG render inside a single orange-dashed container
            // labeled with the SG name. Workloads with no SG attached
            // get their own "no SG attached" group (honest empty).
            (() => {
              const groups = new Map<string, TopologyNode[]>()
              for (const n of workloadsHere) {
                const sgs = n.security_group_ids ?? []
                if (sgs.length === 0) {
                  const list = groups.get("__no_sg__") ?? []
                  list.push(n)
                  groups.set("__no_sg__", list)
                  continue
                }
                for (const sgId of sgs) {
                  const list = groups.get(sgId) ?? []
                  list.push(n)
                  groups.set(sgId, list)
                }
              }
              const entries = [...groups.entries()]
              return (
                <div className={compact ? "space-y-1" : "space-y-2"}>
                  {entries.map(([sgId, group]) => {
                    if (sgId === "__no_sg__") {
                      return (
                        <div
                          key={sgId}
                          className={compact ? "rounded p-1.5" : "rounded p-2"}
                          style={{
                            background: "transparent",
                            border: `1px dashed ${PAL.slate}80`,
                          }}
                        >
                          <div className={compact ? "text-[9px] uppercase tracking-[0.10em] italic mb-1" : "text-[9px] uppercase tracking-[0.10em] italic mb-1.5"} style={{ color: PAL.slate }}>
                            no SG attached
                          </div>
                          <div className={compact ? "flex flex-wrap gap-1.5" : "flex flex-wrap gap-2"}>
                            {group.map(n => (
                              <WorkloadChip
                                key={n.id}
                                node={n}
                                selected={n.id === selectedNodeId}
                                onClick={() => onSelect(n.id)}
                              />
                            ))}
                          </div>
                        </div>
                      )
                    }
                    const sg = sgIndex.get(sgId)
                    const sgName = sg?.name ?? sgId
                    const isPublic = sg?.has_public_ingress
                    return (
                      <div
                        key={sgId}
                        className={compact ? "rounded p-1.5" : "rounded p-2"}
                        style={{
                          background: "transparent",
                          border: `1.5px dashed ${isPublic ? PAL.carmine : "#FF9900"}`,
                        }}
                      >
                        <div
                          className={compact ? "text-[10px] uppercase tracking-[0.10em] font-bold mb-1" : "text-[10px] uppercase tracking-[0.10em] font-bold mb-1.5"}
                          style={{ color: isPublic ? PAL.carmine : "#C77400" }}
                          title={sg?.description ?? sgName}
                        >
                          🛡 {sgName}{isPublic ? " · public ingress" : ""}
                        </div>
                        <div className={compact ? "flex flex-wrap gap-1.5" : "flex flex-wrap gap-2"}>
                          {group.map(n => (
                            <WorkloadChip
                              key={n.id}
                              node={n}
                              selected={n.id === selectedNodeId}
                              onClick={() => onSelect(n.id)}
                            />
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()
          )}
        </>
      )}
    </div>
  )
}

function IamRoleCard({ role, allWorkloads }: { role: IamRoleRollup; allWorkloads: TopologyNode[] }) {
  const isClean = role.allowed_actions === 0 || role.gap_percentage === 0
  const isCritical = role.gap_percentage >= 80
  const accent = isClean ? "#10B981" : isCritical ? PAL.carmine : PAL.amber
  const remediated = role.last_remediated_at
    ? new Date(role.last_remediated_at).toISOString().slice(0, 10)
    : null
  const consumers = allWorkloads.filter(w => role.workload_ids.includes(w.id))
  const isShared = role.workload_ids.length > 1
  return (
    <div
      className="rounded-md p-3 min-w-[200px] max-w-[260px] shrink-0"
      style={{ background: "white", border: `1.5px solid ${accent}`, borderTopWidth: "3px" }}
    >
      <div className="text-[12px] font-semibold truncate" style={{ color: PAL.ink }} title={role.name}>
        {role.name}
      </div>
      <div className="mt-1.5 mb-1.5">
        {role.allowed_actions === 0 ? (
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded inline-block"
            style={{ background: "#D1FAE5", color: "#065F46" }}
          >
            0/0 actions
          </span>
        ) : (
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded inline-block"
            style={{
              background: isCritical ? "#FECACA" : "#FEF3C7",
              color: isCritical ? "#7F1D1D" : "#92400E",
            }}
          >
            {role.unused_actions}/{role.allowed_actions} unused
          </span>
        )}
      </div>
      <div className="text-[10px] leading-snug" style={{ color: PAL.slate }}>
        {role.allowed_actions === 0 ? (
          <>
            {remediated ? `Remediated ${remediated} · ` : ""}
            least-privilege achieved
          </>
        ) : (
          <>
            {Math.round(role.gap_percentage)}% gap
            {remediated ? ` · remediation ${remediated}` : " · never remediated"}
          </>
        )}
      </div>
      {consumers.length > 0 && (
        <div className="mt-2 pt-2 border-t" style={{ borderColor: "#E5E7EB" }}>
          {consumers.slice(0, 3).map(c => (
            <div key={c.id} className="text-[10px] truncate" style={{ color: PAL.ink }}>
              {c.name}
            </div>
          ))}
          {consumers.length > 3 && (
            <div className="text-[10px] italic" style={{ color: PAL.slate }}>
              + {consumers.length - 3} more
            </div>
          )}
          <div className="text-[9px] uppercase tracking-wider mt-1" style={{ color: PAL.slate }}>
            {role.attachment_modes.includes("instance_profile") ? "via instance profile" : ""}
            {role.attachment_modes.includes("instance_profile") && role.attachment_modes.includes("direct") ? " · " : ""}
            {role.attachment_modes.includes("direct") ? "USES_ROLE" : ""}
            {isShared ? " · shared" : ""}
          </div>
        </div>
      )}
    </div>
  )
}

function IamControlPlane({
  roles, allWorkloads,
}: { roles: IamRoleRollup[]; allWorkloads: TopologyNode[] }) {
  if (roles.length === 0) return null
  const criticalCount = roles.filter(r => r.gap_percentage >= 80 && r.allowed_actions > 0).length
  const cleanCount = roles.filter(r => r.allowed_actions === 0 || r.gap_percentage === 0).length
  return (
    <div
      className="rounded-md p-4 relative"
      style={{ background: PAL.cardBg, border: `2px solid #DD344C`, borderLeftWidth: "8px" }}
    >
      <div
        className="absolute -top-2.5 left-6 px-2 text-[10px] uppercase tracking-[0.14em] font-bold"
        style={{ background: PAL.cardBg, color: "#DD344C" }}
      >
        IAM · Control plane
      </div>
      <div className="flex items-baseline justify-between mb-3 mt-1">
        <div className="text-[12px] font-semibold" style={{ color: PAL.ink }}>
          Roles attached to this VPC
        </div>
        <div className="text-[10px]" style={{ color: PAL.slate }}>
          derived from instance-profile + USES_ROLE edges ·{" "}
          {roles.length} role{roles.length === 1 ? "" : "s"}
          {criticalCount > 0 ? ` · ${criticalCount} critical gap${criticalCount === 1 ? "" : "s"}` : ""}
          {cleanCount > 0 ? ` · ${cleanCount} clean` : ""}
        </div>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {roles.map(r => (
          <IamRoleCard key={r.name} role={r} allWorkloads={allWorkloads} />
        ))}
      </div>
    </div>
  )
}

function TrafficFlowBand({
  edges, nodes,
}: { edges: TrafficEdge[]; nodes: TopologyNode[] }) {
  const nodeById = useMemo(() => {
    const m = new Map<string, TopologyNode>()
    for (const n of nodes) m.set(n.id, n)
    return m
  }, [nodes])
  return (
    <div
      className="rounded-md p-4 relative"
      style={{ background: PAL.cardBg, border: `1px solid #E2E8F0` }}
    >
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-[10px] uppercase tracking-[0.14em] font-bold" style={{ color: PAL.ink }}>
          Observed traffic — animated arrows above
        </div>
        <div className="text-[10px]" style={{ color: PAL.slate }}>
          {edges.length} flow{edges.length === 1 ? "" : "s"} ·{" "}
          {edges.filter(e => (e.edge_class ?? "internal") === "internal").length} internal ·{" "}
          {edges.filter(e => e.edge_class === "edge_service").length} edge-service ·{" "}
          {edges.filter(e => e.edge_class === "vpce").length} vpce ·{" "}
          {edges.filter(e => e.edge_class === "database").length} database ·{" "}
          {edges.filter(e => e.edge_class === "egress").length} egress
        </div>
      </div>
      {edges.length === 0 ? (
        <div className="text-[11px] italic" style={{ color: PAL.slate }}>
          No observed traffic flows from any rendered workload.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {edges.slice(0, 12).map((e, i) => {
            const src = nodeById.get(e.source_id)
            const dst = e.target_id === "__igw__"
              ? { name: "Internet (via IGW)" }
              : nodeById.get(e.target_id) ?? { name: e.target_id }
            const cls = e.edge_class ?? "internal"
            const classChip = cls === "egress"
              ? { bg: "#FEF3C7", fg: "#7B3F00", txt: e.external_destinations ? `egress · ${e.external_destinations} dest` : "egress" }
              : cls === "edge_service"
              ? { bg: "#EDE7F6", fg: "#4527A0", txt: e.protocol ?? "edge" }
              : cls === "vpce"
              ? { bg: "#DBEAFE", fg: "#1E40AF", txt: "VPCE" }
              : cls === "database"
              ? { bg: "#D2E5F8", fg: "#1565C0", txt: e.port ? `RDS · ${e.port}` : "RDS" }
              : { bg: "#E0F2FE", fg: "#075985", txt: e.port ? `${e.port}/${e.protocol ?? "TCP"}` : (e.protocol ?? "TCP") }
            const arrowColor = cls === "egress" ? "#FF9900" : cls === "edge_service" ? "#7E57C2" : cls === "vpce" ? "#3B82F6" : cls === "database" ? "#2E73B8" : PAL.teal
            return (
              <div
                key={`${e.source_id}-${e.target_id}-${e.port}-${i}`}
                className="flex items-center gap-2 text-[11px]"
                style={{ color: PAL.ink }}
              >
                <span className="font-semibold truncate max-w-[200px]">
                  {src?.name ?? e.source_id}
                </span>
                <span style={{ color: arrowColor }}>→</span>
                <span className="font-semibold truncate max-w-[200px]">
                  {dst.name}
                </span>
                <span
                  className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded"
                  style={{ background: classChip.bg, color: classChip.fg }}
                >
                  {classChip.txt}
                </span>
              </div>
            )
          })}
          {edges.length > 12 && (
            <div className="text-[10px] italic mt-1" style={{ color: PAL.slate }}>
              + {edges.length - 12} more flows
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function EncodingLegend() {
  return (
    <div
      className="rounded-md px-4 py-3 text-[11px]"
      style={{
        background: PAL.cardBg,
        border: `1px solid #E2E8F0`,
        color: PAL.ink,
      }}
    >
      <div
        className="font-semibold uppercase tracking-[0.14em] mb-2 text-[10px]"
        style={{ color: PAL.slate }}
      >
        Encoding
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="rounded-full" style={{ width: 12, height: 12, background: PAL.carmine, boxShadow: `0 0 0 3px rgba(224,69,69,0.20)` }} />
          <span>Worst (carmine halo + pulse)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full" style={{ width: 12, height: 12, background: "transparent", border: `2px solid ${PAL.amber}` }} />
          <span>High / elevated (ring only)</span>
        </div>
        <div className="flex items-center gap-2">
          <span style={{ color: PAL.amber, fontSize: "14px" }}>♛</span>
          <span>Crown-jewel halo</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full" style={{ width: 12, height: 12, background: "transparent", border: `2px solid ${PAL.teal}` }} />
          <span>Clean · remediated (teal ring)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full" style={{ width: 12, height: 12, background: "#9CA3AF", opacity: 0.6 }} />
          <span>Stale (dimmed)</span>
        </div>
      </div>
    </div>
  )
}

// ─── Animated SVG flow overlay ──────────────────────────────────────
//
// Draws arrows from each workload chip to its observed destinations
// (other workload chips, the IGW perimeter for egress, edge-service
// chips on the right rail). Lines are absolutely positioned over the
// canvas container with `pointer-events:none` so they never block
// chip clicks. Path coordinates are recomputed on every render and on
// window resize so the lines stay anchored when chips shift.

interface FlowPath {
  d: string
  cls: TrafficEdgeClass
  protocol: string | null
  port: number | null
  externalDestinations: number | null
  badgeX: number
  badgeY: number
  badgeLabel: string
}

function buildPath(
  src: DOMRect,
  dst: DOMRect,
  containerRect: DOMRect,
): string {
  const sx = src.left + src.width / 2 - containerRect.left
  const sy = src.top + src.height / 2 - containerRect.top
  const dx = dst.left + dst.width / 2 - containerRect.left
  const dy = dst.top + dst.height / 2 - containerRect.top
  // Smooth cubic bezier — pull the control points horizontally so the
  // arrow looks like a polite "around the chrome" curve instead of a
  // straight line that overlaps frame borders.
  const midX = (sx + dx) / 2
  const c1x = sx + (midX - sx) * 0.65
  const c2x = dx - (dx - midX) * 0.65
  return `M ${sx} ${sy} C ${c1x} ${sy}, ${c2x} ${dy}, ${dx} ${dy}`
}

// Two-segment path: src → intermediate → dst. Used for S3/DDB edge_service
// edges that route through a Gateway VPCE — the BE attaches `via_vpce_id`
// so the FE can find the intermediate chip and physically render the
// VPCE in the access path (instead of drawing a direct chip→S3 arrow
// that lies about how the bytes flow).
function buildPathViaIntermediate(
  src: DOMRect,
  intermediate: DOMRect,
  dst: DOMRect,
  containerRect: DOMRect,
): string {
  const sx = src.left + src.width / 2 - containerRect.left
  const sy = src.top + src.height / 2 - containerRect.top
  const ix = intermediate.left + intermediate.width / 2 - containerRect.left
  const iy = intermediate.top + intermediate.height / 2 - containerRect.top
  const dx = dst.left + dst.width / 2 - containerRect.left
  const dy = dst.top + dst.height / 2 - containerRect.top
  // First segment: src → intermediate
  const m1 = (sx + ix) / 2
  const c1ax = sx + (m1 - sx) * 0.65
  const c1bx = ix - (ix - m1) * 0.65
  // Second segment: intermediate → dst
  const m2 = (ix + dx) / 2
  const c2ax = ix + (m2 - ix) * 0.65
  const c2bx = dx - (dx - m2) * 0.65
  return (
    `M ${sx} ${sy} C ${c1ax} ${sy}, ${c1bx} ${iy}, ${ix} ${iy} ` +
    `C ${c2ax} ${iy}, ${c2bx} ${dy}, ${dx} ${dy}`
  )
}

function FlowOverlay({
  edges, containerRef,
}: {
  edges: TrafficEdge[]
  containerRef: React.RefObject<HTMLDivElement | null>
}) {
  const [paths, setPaths] = useState<FlowPath[]>([])
  const [size, setSize] = useState({ w: 0, h: 0 })

  // useEffect (not useLayoutEffect) + retry-until-chips-found pattern.
  // On the prod minified build the layout-effect variant fired before all
  // 25 chip refs had committed to the DOM, found 0 matches, set paths=[]
  // and never re-ran (PR #220 + #221 prod regression — manual DOM inject
  // proved the geometry math is correct).
  // useEffect runs AFTER paint so the chips are present; we also poll a
  // few times with a short backoff in case the cells animate in.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let cancelled = false
    const recompute = () => {
      if (cancelled) return
      const containerRect = container.getBoundingClientRect()
      if (containerRect.width === 0) return
      setSize({ w: containerRect.width, h: containerRect.height })
      const next: FlowPath[] = []
      for (const e of edges) {
        const srcEl = container.querySelector<HTMLElement>(
          `[data-flow-id="${CSS.escape(e.source_id)}"]`,
        )
        const dstEl = container.querySelector<HTMLElement>(
          `[data-flow-id="${CSS.escape(e.target_id)}"]`,
        )
        if (!srcEl || !dstEl) continue
        const srcRect = srcEl.getBoundingClientRect()
        const dstRect = dstEl.getBoundingClientRect()
        const sx = srcRect.left + srcRect.width / 2 - containerRect.left
        const sy = srcRect.top + srcRect.height / 2 - containerRect.top
        const dx = dstRect.left + dstRect.width / 2 - containerRect.left
        const dy = dstRect.top + dstRect.height / 2 - containerRect.top
        const cls = e.edge_class ?? "internal"
        // via_vpce routing — for S3/DDB Gateway VPCE paths the BE attaches
        // the VPCE id so the FE renders the arrow as a two-segment path
        // through that chip. Falls back to a direct chip→dst arrow if the
        // VPCE chip can't be found (e.g. older BE deploy with no field).
        let d: string
        let badgeX: number
        let badgeY: number
        let routedViaVpce = false
        if (e.via_vpce_id) {
          const interEl = container.querySelector<HTMLElement>(
            `[data-flow-id="${CSS.escape(e.via_vpce_id)}"]`,
          )
          if (interEl) {
            const interRect = interEl.getBoundingClientRect()
            d = buildPathViaIntermediate(srcRect, interRect, dstRect, containerRect)
            const ix = interRect.left + interRect.width / 2 - containerRect.left
            const iy = interRect.top + interRect.height / 2 - containerRect.top
            badgeX = ix
            badgeY = iy + 16
            routedViaVpce = true
          } else {
            d = buildPath(srcRect, dstRect, containerRect)
            badgeX = (sx + dx) / 2
            badgeY = (sy + dy) / 2 - 6
          }
        } else {
          d = buildPath(srcRect, dstRect, containerRect)
          badgeX = (sx + dx) / 2
          badgeY = (sy + dy) / 2 - 6
        }
        let badgeLabel = ""
        if (cls === "egress") {
          badgeLabel = e.external_destinations
            ? `egress · ${e.external_destinations} dest`
            : "egress"
        } else if (cls === "edge_service") {
          if (routedViaVpce) {
            // Short-form service tag from the VPCE service_name suffix.
            const svc = e.via_vpce_service_name ?? ""
            const tag = svc.endsWith(".s3")
              ? "S3"
              : svc.endsWith(".dynamodb")
                ? "DDB"
                : "VPCE"
            badgeLabel = `${tag} access · via VPCE`
          } else {
            badgeLabel = e.protocol ?? "edge"
          }
        } else if (cls === "vpce") {
          badgeLabel = "VPCE"
        } else if (cls === "database") {
          badgeLabel = e.port ? `RDS · ${e.port}` : "RDS"
        } else {
          badgeLabel = e.port ? `${e.port}/${e.protocol ?? "TCP"}` : (e.protocol ?? "TCP")
        }
        next.push({
          d,
          cls,
          protocol: e.protocol,
          port: e.port,
          externalDestinations: e.external_destinations ?? null,
          badgeX,
          badgeY,
          badgeLabel,
        })
      }
      setPaths(next)
    }
    // Initial run + a short retry ladder. If no chips have refs yet
    // (data still loading, fonts mid-layout, etc.) we'll catch them on
    // the next tick or two. Cheap; max ~600ms of polling.
    recompute()
    const t1 = window.setTimeout(recompute, 100)
    const t2 = window.setTimeout(recompute, 300)
    const t3 = window.setTimeout(recompute, 600)
    const ro = new ResizeObserver(recompute)
    ro.observe(container)
    window.addEventListener("resize", recompute)
    return () => {
      cancelled = true
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.clearTimeout(t3)
      ro.disconnect()
      window.removeEventListener("resize", recompute)
    }
    // edges is the only meaningful dependency — containerRef is stable
    // by definition (React.useRef returns the same object every render),
    // and adding it has historically masked real prod-only mount-timing
    // bugs (see comment above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edges])

  const colorByCls: Record<TrafficEdgeClass, string> = {
    internal: "#0E8B7A",      // teal — intra-canvas chip↔chip
    edge_service: "#7E57C2",  // purple — to right-rail S3/KMS/DDB
    vpce: "#3B82F6",          // blue — to VPC endpoint chips
    egress: "#FF9900",        // AWS orange — to IGW perimeter
    database: "#2E73B8",      // RDS blue — workload→database tier
  }

  // Always render the SVG (even empty) so the React tree mounts on the
  // first paint and the layout effect can populate paths/size on the
  // next tick. Returning null here on first render caused the deployed
  // build to never re-attach the SVG after state arrived (PR #220 prod
  // regression — manual SVG injection works, the React mount does not).
  const hasSize = size.w > 0 && size.h > 0

  return (
    <svg
      aria-hidden="true"
      width={hasSize ? size.w : "100%"}
      height={hasSize ? size.h : "100%"}
      viewBox={hasSize ? `0 0 ${size.w} ${size.h}` : undefined}
      className="absolute inset-0"
      // z-index lifts the SVG above the subnet/AZ chip boxes that paint
      // later in the DOM tree. Without it, `z-auto` puts the SVG on the
      // same stacking level as those siblings, and the chips end up
      // covering every path whose midpoint falls inside a box (only the
      // egress→IGW line escaped because its mid sits OUTSIDE the frame).
      // pointer-events stays none so chip clicks still pass through.
      style={{ pointerEvents: "none", overflow: "visible", zIndex: 20 }}
    >
      <defs>
        {(["internal", "edge_service", "vpce", "database", "egress"] as TrafficEdgeClass[]).map(c => (
          <marker
            key={c}
            id={`flow-arrow-${c}`}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={colorByCls[c]} />
          </marker>
        ))}
      </defs>
      {paths.map((p, i) => (
        <g key={i}>
          {/* Soft halo behind the line so it's visible over the busy chip grid */}
          <path
            d={p.d}
            fill="none"
            stroke={colorByCls[p.cls]}
            strokeWidth="9"
            strokeOpacity="0.18"
            strokeLinecap="round"
          />
          <path
            d={p.d}
            fill="none"
            stroke={colorByCls[p.cls]}
            strokeWidth="3"
            strokeOpacity="0.95"
            strokeDasharray="8 5"
            strokeLinecap="round"
            markerEnd={`url(#flow-arrow-${p.cls})`}
          >
            {/* Animated dashes — gives the "traffic flowing" look */}
            <animate
              attributeName="stroke-dashoffset"
              from="26"
              to="0"
              dur="1.4s"
              repeatCount="indefinite"
            />
          </path>
          {/* Badge with port/proto or egress dest count */}
          <g transform={`translate(${p.badgeX}, ${p.badgeY})`}>
            <rect
              x={-Math.max(p.badgeLabel.length * 3.4, 12)}
              y={-8}
              width={Math.max(p.badgeLabel.length * 6.8, 24)}
              height={16}
              rx={4}
              fill="white"
              stroke={colorByCls[p.cls]}
              strokeWidth="1"
              opacity="0.96"
            />
            <text
              x={0}
              y={4}
              textAnchor="middle"
              fontSize="10"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              fill={colorByCls[p.cls]}
              fontWeight="600"
            >
              {p.badgeLabel}
            </text>
          </g>
        </g>
      ))}
    </svg>
  )
}

export function AwsFrame({ vpcTopology, nodes, trafficEdges, selectedNodeId, onSelect, presentationMode = false }: Props) {
  // SG lookup for the SubnetCell groupings.
  const sgIndex = useMemo(() => {
    const m = new Map<string, SecurityGroupMeta>()
    for (const sg of vpcTopology.security_groups ?? []) {
      m.set(sg.id, sg)
    }
    return m
  }, [vpcTopology.security_groups])
  const iamRoles = vpcTopology.iam_roles ?? []
  const trafficEdgesList = trafficEdges ?? []
  const vpceIds = useMemo(
    () => new Set((vpcTopology.edges.vpces ?? []).map(v => v.id)),
    [vpcTopology.edges.vpces],
  )
  const visibleEdges = useMemo(() => {
    const visible = new Set(nodes.map(n => n.id))
    return trafficEdgesList.filter(e => {
      if (!visible.has(e.source_id)) return false
      if (e.target_id === "__igw__") return true
      if (vpceIds.has(e.target_id)) return true
      return visible.has(e.target_id)
    })
  }, [trafficEdgesList, nodes, vpceIds])
  // Index subnets and workloads by (az, tier).
  const { byAzAndTier, edgeNodes, serverlessNodes, staleNodes, populatedAzs } = useMemo(() => {
    const subnetById = new Map(vpcTopology.subnets.map(s => [s.id, s]))
    const byAzAndTier = new Map<string, Map<SubnetTier, TopologyNode[]>>()
    const edgeNodes: TopologyNode[] = []
    const serverlessNodes: TopologyNode[] = []
    const staleNodes: TopologyNode[] = []

    for (const n of nodes) {
      if (n.stale) { staleNodes.push(n); continue }
      if (n.type && EDGE_SERVICE_TYPES.has(n.type)) { edgeNodes.push(n); continue }
      const sub = n.subnet_id ? subnetById.get(n.subnet_id) ?? null : null
      if (!sub || !sub.az) {
        if (n.type && SERVERLESS_TYPES.has(n.type)) serverlessNodes.push(n)
        continue
      }
      const azMap = byAzAndTier.get(sub.az) ?? new Map<SubnetTier, TopologyNode[]>()
      const cell = azMap.get(sub.tier) ?? []
      cell.push(n)
      azMap.set(sub.tier, cell)
      byAzAndTier.set(sub.az, azMap)
    }

    for (const azMap of byAzAndTier.values()) {
      for (const list of azMap.values()) {
        list.sort((a, b) => (a.score?.rank ?? 999) - (b.score?.rank ?? 999))
      }
    }
    edgeNodes.sort((a, b) => (a.score?.rank ?? 999) - (b.score?.rank ?? 999))
    serverlessNodes.sort((a, b) => (a.score?.rank ?? 999) - (b.score?.rank ?? 999))

    // AZ collapse: only AZs that contain at least one workload AND are in
    // the system's primary VPC. The "primary VPC" filter drops the
    // us-east-1 demo subnets that belong to a different VPC entirely.
    const populatedAzs = new Set<string>([...byAzAndTier.keys()])
    return { byAzAndTier, edgeNodes, serverlessNodes, staleNodes, populatedAzs }
  }, [vpcTopology.subnets, nodes])

  // Group subnets by (az, tier) for cell metadata. Skip subnets that don't
  // belong to the primary VPC (the topology-risk root vpc_id).
  const subnetsByCell = useMemo(() => {
    const m = new Map<string, SubnetMeta[]>()
    for (const s of vpcTopology.subnets) {
      if (!s.az) continue
      // Honest AZ filter: only render AZs that hold ≥1 placed workload OR
      // a non-default-VPC subnet. This drops the alon-prod-* demo subnets
      // in us-east-1 (no workloads) and the eu-west-1c default-VPC subnet
      // (no workloads), keeping the canvas focused on the AZs that matter.
      if (!populatedAzs.has(s.az)) continue
      const k = `${s.az}::${s.tier}`
      const list = m.get(k) ?? []
      list.push(s)
      m.set(k, list)
    }
    return m
  }, [vpcTopology.subnets, populatedAzs])

  const azs = [...populatedAzs].sort()
  const tiers: ("web" | "app" | "data")[] = ["web", "app", "data"]
  const hasIgw = vpcTopology.edges.igws.length > 0
  const hasNats = vpcTopology.edges.nat_gws.length > 0
  const hasVpces = vpcTopology.edges.vpces.length > 0
  const accountSuffix = vpcTopology.account_id ? `· acct ${vpcTopology.account_id}` : ""
  const flowContainerRef = useRef<HTMLDivElement | null>(null)

  return (
    <div
      ref={flowContainerRef}
      className={
        presentationMode
          ? "rounded-xl p-3 space-y-2 relative max-w-full"
          : "rounded-2xl p-4 space-y-4 relative max-w-full"
      }
      style={{ background: PAL.bg, border: `1px solid #DDE3E8` }}
    >
      {/* Internet + IGW perimeter — tighter in presentation mode so the
          AWS Cloud frame can take the dominant vertical share. */}
      <div className={presentationMode ? "flex items-center justify-center gap-6 pb-2" : "flex items-center justify-center gap-8 pb-4"}>
        <div className="flex flex-col items-center" style={{ color: PAL.slate }}>
          <div className={presentationMode ? "text-2xl" : "text-3xl"}>👥</div>
          <div className="text-[11px] uppercase tracking-wider mt-1 font-semibold">Users</div>
        </div>
        <div className="flex-1 max-w-[180px] border-t border-dashed" style={{ borderColor: "#94A3B8" }} />
        <div className="flex flex-col items-center" style={{ color: PAL.slate }}>
          <div className={presentationMode ? "text-2xl" : "text-3xl"}>☁</div>
          <div className="text-[11px] uppercase tracking-wider mt-1 font-semibold">Internet</div>
        </div>
        <div className="flex-1 max-w-[180px] border-t border-dashed" style={{ borderColor: "#94A3B8" }} />
        <div
          className="flex flex-col items-center"
          style={{ color: hasIgw ? PAL.awsBlue : "#94A3B8" }}
          data-flow-id="__igw__"
        >
          <div className={presentationMode ? "text-2xl" : "text-3xl"}>🌐</div>
          <div className="text-[11px] uppercase tracking-wider mt-1 font-semibold">
            {hasIgw ? `IGW · ${vpcTopology.edges.igws[0].name}` : "no IGW observed"}
          </div>
        </div>
      </div>

      {/* AWS Cloud frame */}
      <div
        className={presentationMode ? "rounded-lg p-3 relative" : "rounded-lg p-4 relative"}
        style={{ background: PAL.cardBg, border: `2px solid ${PAL.awsFrame}` }}
      >
        <div
          className="absolute -top-2.5 left-4 px-2 text-[11px] uppercase tracking-[0.14em] font-semibold"
          style={{ background: PAL.bg, color: PAL.awsFrame }}
        >
          ☁ AWS Cloud {accountSuffix}
        </div>

        {/* Region */}
        <div
          className={presentationMode ? "rounded-md p-3 mt-2 relative" : "rounded-md p-4 mt-3 relative"}
          style={{ background: PAL.cardBg, border: `1.5px dashed ${PAL.slate}` }}
        >
          <div
            className="absolute -top-2.5 left-4 px-2 text-[10px] uppercase tracking-[0.14em] font-semibold"
            style={{ background: PAL.cardBg, color: PAL.slate }}
          >
            Region · {vpcTopology.region ?? "unknown"}
          </div>

          {/* VPC + edge rail flexbox */}
          <div className={presentationMode ? "flex gap-3 mt-2" : "flex gap-4 mt-3"}>
            {/* VPC frame */}
            <div
              className={presentationMode ? "flex-1 rounded-md p-3 relative" : "flex-1 rounded-md p-4 relative"}
              style={{ background: PAL.cardBg, border: `2px solid #00C2A8` }}
            >
              <div
                className="absolute -top-2.5 left-4 px-2 text-[11px] uppercase tracking-[0.14em] font-semibold"
                style={{ background: PAL.cardBg, color: "#0E8B7A" }}
              >
                VPC · {vpcTopology.vpc_id ?? "unknown"}
              </div>

              {/* NAT GW perimeter band */}
              {hasNats && (
                <div className="mb-3 pb-2 border-b border-dashed" style={{ borderColor: "#CBD5E1" }}>
                  <div className="text-[10px] uppercase tracking-[0.12em] font-semibold mb-1.5" style={{ color: PAL.slate }}>
                    NAT gateways ({vpcTopology.edges.nat_gws.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {vpcTopology.edges.nat_gws.map(n => (
                      <span
                        key={n.id}
                        className="text-[10px] px-2 py-0.5 rounded-md"
                        style={{ background: "#FFF3E0", border: "1px solid #FF9900", color: "#7B3F00" }}
                      >
                        NAT GW · {n.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* AZ headers + tier rows with sidebar labels */}
              {azs.length === 0 ? (
                <div className="text-[12px] italic py-6 text-center" style={{ color: PAL.slate }}>
                  No alon-prod-tagged subnets in this VPC.
                </div>
              ) : (
                <div className={presentationMode ? "mt-1" : "mt-2"}>
                  {/* AZ headers — offset by the sidebar width. Hidden in
                      presentation mode (each subnet card already shows its
                      AZ name in the CIDR row, so the column header is
                      redundant ~38px of vertical space). */}
                  {!presentationMode && (
                  <div className="flex mb-2">
                    <div style={{ width: "44px" }} />
                    <div
                      className="grid gap-3 flex-1"
                      style={{ gridTemplateColumns: `repeat(${azs.length}, minmax(0, 1fr))` }}
                    >
                      {azs.map(az => (
                        <div
                          key={az}
                          className="text-[11px] uppercase tracking-[0.14em] font-semibold text-center pb-1.5 border-b"
                          style={{ color: PAL.ink, borderColor: PAL.slate }}
                        >
                          AZ · {az}
                        </div>
                      ))}
                    </div>
                  </div>
                  )}

                  {/* Tier rows with vertical sidebar labels */}
                  <div className={presentationMode ? "space-y-1.5" : "space-y-3"}>
                    {tiers.map(tier => (
                      <div key={tier} className="flex gap-0">
                        <div
                          className="rounded-l-md flex items-center justify-center shrink-0"
                          style={{
                            background: PAL.ink,
                            color: "white",
                            width: presentationMode ? "36px" : "44px",
                            writingMode: "vertical-rl",
                            transform: "rotate(180deg)",
                            fontSize: "10px",
                            fontWeight: 700,
                            letterSpacing: "0.18em",
                          }}
                        >
                          {TIER_SIDEBAR_LABEL[tier]}
                        </div>
                        <div
                          className={presentationMode ? "rounded-r-md p-2 flex-1" : "rounded-r-md p-3 flex-1"}
                          style={{ background: TIER_BG[tier] }}
                        >
                          <div
                            className={presentationMode ? "grid gap-2" : "grid gap-3"}
                            style={{ gridTemplateColumns: `repeat(${azs.length}, minmax(0, 1fr))` }}
                          >
                            {azs.map(az => {
                              const subnetsHere = subnetsByCell.get(`${az}::${tier}`) ?? []
                              const workloadsHere = byAzAndTier.get(az)?.get(tier) ?? []
                              return (
                                <SubnetCell
                                  key={`${az}-${tier}`}
                                  tier={tier}
                                  az={az}
                                  subnetsHere={subnetsHere}
                                  workloadsHere={workloadsHere}
                                  sgIndex={sgIndex}
                                  selectedNodeId={selectedNodeId}
                                  onSelect={onSelect}
                                  compact={presentationMode}
                                />
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* VPCE boundary strip — VPC endpoints sit ON the VPC perimeter
                between the interior and the regional services rail
                (per AWS canonical architecture: gateway/interface endpoints
                are boundary devices, not interior workloads). Negative
                horizontal margins make each chip visually straddle the
                VPC edge instead of floating inside a band. Same blue
                color as before; data-flow-id preserved so flow arrows
                resolve the same chip in the new position. */}
            {hasVpces && (
              <div
                className="flex flex-col gap-2 -mx-3 z-10 shrink-0 self-stretch justify-start pt-2"
                style={{ width: "150px" }}
              >
                {vpcTopology.edges.vpces.map(v => {
                  const meta = resolveVpceMeta(v.service_name, v.endpoint_type)
                  const tooltip = [
                    meta.label,
                    `${meta.type} endpoint · ${v.id}`,
                    v.service_name ?? "",
                    meta.purpose,
                  ].filter(Boolean).join("\n")
                  return (
                    <div
                      key={v.id}
                      data-flow-id={v.id}
                      title={tooltip}
                      className="rounded-md shadow-sm overflow-hidden flex items-stretch"
                      style={{
                        background: "#DBEAFE",
                        border: "1.5px solid #3B82F6",
                        color: "#1E40AF",
                      }}
                    >
                      {/* AWS PrivateLink VPCE icon — solid purple plate
                          with a white shield+arrow glyph (mirrors the
                          official AWS architecture-icon for VPC
                          Endpoint). One icon for every VPCE keeps the
                          boundary strip readable; service identity
                          lives in the chip text. */}
                      <div
                        className="flex items-center justify-center shrink-0 px-1.5"
                        style={{ background: "white" }}
                      >
                        <VpceIcon size={32} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between px-2 pt-1 pb-0.5 text-[8px] font-bold uppercase tracking-[0.12em] leading-none">
                          <span>VPCE</span>
                          <span
                            className="px-1 rounded-sm text-[7px]"
                            style={{
                              background: meta.type === "Gateway" ? "#1E40AF" : "#3B82F6",
                              color: "white",
                            }}
                          >
                            {meta.type === "Gateway" ? "GW" : "IF"}
                          </span>
                        </div>
                        <div className="px-2 text-[10px] font-semibold leading-tight truncate">
                          {meta.label}
                        </div>
                        <div className="px-2 pb-1 text-[8px] leading-snug" style={{ color: "#1E3A8A", opacity: 0.85 }}>
                          {meta.purpose}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Right edge rail — S3, KMS, DDB, Secrets */}
            <div
              className="w-[168px] rounded-md p-2.5 relative shrink-0"
              style={{ background: PAL.cardBg, border: `1.5px dashed ${PAL.slate}` }}
            >
              <div
                className="absolute -top-2.5 left-3 px-2 text-[10px] uppercase tracking-[0.14em] font-semibold"
                style={{ background: PAL.cardBg, color: PAL.slate }}
              >
                Edge services
              </div>
              {edgeNodes.length === 0 ? (
                <div className="text-[11px] italic mt-2" style={{ color: PAL.slate }}>
                  no S3 / KMS / DynamoDB observed in this system
                </div>
              ) : (
                <div className="flex flex-col gap-2 mt-2">
                  {edgeNodes.map(n => (
                    <WorkloadChip
                      key={n.id}
                      node={n}
                      selected={n.id === selectedNodeId}
                      onClick={() => onSelect(n.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sections below the AWS frame — diagnostic. Hidden in
          presentation/fullscreen mode so the map itself is the focus.
          Inline page keeps everything.  */}
      {!presentationMode && (
      <>
      {/* Serverless · outside-VPC band */}
      {serverlessNodes.length > 0 && (
        <div
          className="rounded-md p-4"
          style={{ background: PAL.cardBg, border: `1px solid #E2E8F0` }}
        >
          <div className="flex items-baseline justify-between mb-1.5">
            <div className="text-[10px] uppercase tracking-[0.14em] font-semibold" style={{ color: PAL.ink }}>
              Serverless · outside VPC ({serverlessNodes.length})
            </div>
            <div className="text-[11px]" style={{ color: PAL.slate }}>
              λ Lambda functions with no VPC binding
            </div>
          </div>
          <div className="text-[11px] italic mb-2" style={{ color: PAL.slate }}>
            Run in the AWS-managed Lambda VPC — outside the customer network plane.
          </div>
          <div className="flex flex-wrap gap-2">
            {serverlessNodes.map(n => (
              <WorkloadChip
                key={n.id}
                node={n}
                selected={n.id === selectedNodeId}
                onClick={() => onSelect(n.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Stale workloads */}
      {staleNodes.length > 0 && (
        <div
          className="rounded-md p-4"
          style={{ background: PAL.cardBg, border: `1px solid #E2E8F0` }}
        >
          <div className="text-[10px] uppercase tracking-[0.14em] font-semibold mb-1.5" style={{ color: PAL.ink }}>
            Stale workloads ({staleNodes.length})
          </div>
          <div className="text-[11px] italic mb-2" style={{ color: PAL.slate }}>
            aws_exists = false — kept for audit, excluded from rank.
          </div>
          <div className="flex flex-wrap gap-2">
            {staleNodes.map(n => (
              <WorkloadChip
                key={n.id}
                node={n}
                selected={n.id === selectedNodeId}
                onClick={() => onSelect(n.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* IAM · Control plane strip */}
      <IamControlPlane roles={iamRoles} allWorkloads={nodes} />

      {/* Workload-to-workload ACTUAL_TRAFFIC band */}
      <TrafficFlowBand edges={visibleEdges} nodes={nodes} />

      {/* Encoding legend at the bottom */}
      <EncodingLegend />
      </>
      )}

      {/* Animated traffic flow arrows — rendered LAST so DOM stacking
          order paints them on top of every chip box. z-index alone was
          not enough on prod (the subnet/AZ boxes are static siblings,
          and elementsFromPoint still returned them first). */}
      <FlowOverlay edges={visibleEdges} containerRef={flowContainerRef} />
    </div>
  )
}
