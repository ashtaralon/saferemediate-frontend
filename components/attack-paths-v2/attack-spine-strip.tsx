"use client"

// =============================================================================
// Attack Spine Strip — Zoom 1 attacker-origin chain.
//
// Render contract (locked):
//  1. Three nodes always: origin → effective_principal → impact_target
//  2. Conditional hop bands from identity_hops[] only when non-empty
//  3. Left chip assertiveness = origin_confidence (separate from P/N/D gates)
//  4. identity_pivots → +N pivots badge; excess_service_reach stays out of spine
//  5. Graceful fallback to source_label while spine is in the deprecation window
// =============================================================================

import { Crown, KeyRound, Server, ShieldAlert, User } from "lucide-react"
import type {
  IdentityAttackPath,
} from "@/components/identity-attack-paths/types"
import type {
  AttackPathReport,
  DamageCategory,
  IdentityHop,
  SpineOriginConfidence,
  Zoom1Spine,
} from "./attack-path-report-types"
import { SEMANTIC_TOKENS, type SemanticClass } from "./cloud-graph-semantic"
import { CG } from "./cloud-graph-tokens"

interface SpineCard {
  semantic: Extract<SemanticClass, "ENTRY" | "IDENTITY" | "JEWEL">
  kind: string
  title: string
  sub?: string
  badge?: string
  icon: React.ComponentType<{ className?: string }>
  /** Origin-confidence visual — only on the left (origin) card. */
  originConfidence?: SpineOriginConfidence
}

function findIamRoleName(path: IdentityAttackPath | null | undefined): string | undefined {
  if (!path) return undefined
  const rn = path.damage_capability?.role_name
  if (rn && !/^aroa/i.test(rn)) return rn
  const role = (path.nodes ?? []).find((n) => /iamrole/i.test(String(n.type)))
  if (!role) return undefined
  const canonical = role.canonical_id ?? role.id
  const m = /[:/]role\/([^/]+)$/.exec(canonical)
  return m ? m[1] : role.name
}

function damageClasses(report: AttackPathReport): DamageCategory[] {
  const seen = new Set<DamageCategory>()
  for (const cell of report.damage_matrix) {
    if (cell.status === "ALLOWED") seen.add(cell.category)
  }
  const order: DamageCategory[] = ["READ", "WRITE", "DELETE", "ADMIN", "EXFIL", "DECRYPT"]
  return order.filter((c) => seen.has(c))
}

function unusedPermissionCount(report: AttackPathReport): number {
  return report.remediation_diff?.remove_actions?.length ?? 0
}

function consumerCount(report: AttackPathReport): number | undefined {
  return report.remediation_diff?.consumers ?? undefined
}

function hopBandLabel(h: IdentityHop): string {
  const pivotVias = new Set(["assume_role", "cross_account_trust", "federation"])
  const cls = pivotVias.has(h.via) ? "LATERAL PIVOT" : "IDENTITY ACQUISITION"
  const via = h.via.replace(/_/g, " ")
  return `${cls} · ${via}: ${h.from_node.name} → ${h.to_node.name}`
}

function originKindLabel(kind: string | undefined, category: string | null | undefined): string {
  if (kind && /EC2|Instance/i.test(kind)) return "ENTRY · COMPUTE"
  if (kind && /Lambda/i.test(kind)) return "ENTRY · LAMBDA"
  if (kind && /AccessKey|IAMUser/i.test(kind)) return "ENTRY · CREDENTIAL"
  if (kind && /External|Federated|OIDC|SAML|GitHub/i.test(kind)) return "ENTRY · EXTERNAL"
  if (category && category !== "origin_unresolved" && category !== "UNKNOWN") {
    return `ENTRY · ${category.replace(/_/g, " ")}`
  }
  return "ENTRY"
}

function originIcon(kind: string | undefined) {
  if (kind && /AccessKey|IAMUser|Federated|External/i.test(kind)) return User
  if (kind && /EC2|Lambda|ECS|Container|Workload/i.test(kind)) return Server
  return ShieldAlert
}

/** Pure — unit-tested. Prefer current_state.spine; fall back to source_label. */
export function buildSpineCards(
  report: AttackPathReport,
  path: IdentityAttackPath | null | undefined,
): { cards: SpineCard[]; hopBands: string[]; pivotCount: number; usedSpine: boolean } {
  const spine = report.current_state?.spine ?? null
  if (spine?.effective_principal && spine?.impact_target) {
    return buildFromSpine(spine, report)
  }
  return { ...buildLegacyFallback(report, path), usedSpine: false }
}

function buildFromSpine(
  spine: Zoom1Spine,
  report: AttackPathReport,
): { cards: SpineCard[]; hopBands: string[]; pivotCount: number; usedSpine: boolean } {
  const conf = spine.origin_confidence
  const originNode = spine.origin_node
  const unresolved = conf === "origin_unresolved"
  const originTitle = unresolved
    ? "Origin unresolved"
    : originNode?.name || report.current_state.source_label
  const origin: SpineCard = {
    semantic: "ENTRY",
    kind: originKindLabel(originNode?.kind, spine.origin_category),
    title: originTitle,
    sub: unresolved
      ? "attacker-control origin not resolved"
      : originNode
        ? `${originNode.kind}${spine.origin_category ? ` · ${spine.origin_category}` : ""}`
        : undefined,
    badge: unresolved ? "ORIGIN UNRESOLVED" : "ORIGIN",
    icon: originIcon(originNode?.kind),
    originConfidence: conf,
  }

  const unused = unusedPermissionCount(report)
  const consumers = consumerCount(report)
  const identitySub =
    consumers && consumers > 1
      ? `${unused} unused · ${consumers} shared workloads`
      : `${unused} unused permission${unused === 1 ? "" : "s"}`
  const identity: SpineCard = {
    semantic: "IDENTITY",
    kind: "IDENTITY · PRINCIPAL",
    title: spine.effective_principal.name,
    sub: identitySub,
    icon: KeyRound,
  }

  const dmgFromSpine = (spine.damage_verbs || []).map((d) => d.toUpperCase()).join(" · ")
  const dmg = dmgFromSpine || damageClasses(report).join(" · ")
  const jewel: SpineCard = {
    semantic: "JEWEL",
    kind: "CROWN JEWEL",
    title: spine.impact_target.name || report.current_state.target_label,
    sub: dmg || spine.impact_target.kind || "target",
    badge: "CROWN JEWEL",
    icon: Crown,
  }

  const hopBands = (spine.identity_hops || []).map(hopBandLabel)
  const pivotCount = spine.identity_pivots?.length ?? 0

  return {
    cards: [origin, identity, jewel],
    hopBands,
    pivotCount,
    usedSpine: true,
  }
}

function buildLegacyFallback(
  report: AttackPathReport,
  path: IdentityAttackPath | null | undefined,
): { cards: SpineCard[]; hopBands: string[]; pivotCount: number } {
  const computeNode = (path?.nodes ?? []).find((n) =>
    /ec2|instance|lambda|ecs|container/i.test(String(n.type)),
  )
  const origin: SpineCard = {
    semantic: "ENTRY",
    kind: "ENTRY · FOOTHOLD",
    title: report.current_state.source_label,
    sub: computeNode
      ? computeNode.id.startsWith("i-")
        ? `EC2 · ${computeNode.id.slice(0, 13)}…`
        : String(computeNode.type)
      : "legacy source_label",
    badge: "ORIGIN",
    icon: Server,
    originConfidence: "config_complete",
  }

  const role = findIamRoleName(path)
  const unused = unusedPermissionCount(report)
  const consumers = consumerCount(report)
  const identitySub =
    consumers && consumers > 1
      ? `${unused} unused · ${consumers} shared workloads`
      : `${unused} unused permission${unused === 1 ? "" : "s"}`
  const identity: SpineCard = {
    semantic: "IDENTITY",
    kind: "IDENTITY · PRINCIPAL",
    title: role ?? "IAM role",
    sub: identitySub,
    icon: KeyRound,
  }

  const dmg = damageClasses(report).join(" · ")
  const jewel: SpineCard = {
    semantic: "JEWEL",
    kind: "CROWN JEWEL",
    title: report.current_state.target_label,
    sub: dmg || "target",
    badge: "CROWN JEWEL",
    icon: Crown,
  }

  return { cards: [origin, identity, jewel], hopBands: [], pivotCount: 0 }
}

function semanticBgTint(s: SpineCard["semantic"]): string {
  if (s === "ENTRY") return "rgba(217,48,63,0.06)"
  if (s === "IDENTITY") return "rgba(192,70,139,0.06)"
  if (s === "JEWEL") return "rgba(201,147,18,0.08)"
  return "white"
}

/** Origin confidence styles — never borrow gate green for unresolved. */
function originConfidenceStyle(conf: SpineOriginConfidence | undefined): {
  border: string
  bg: string
  badgeBg: string
  badgeInk: string
  solid: boolean
} | null {
  if (!conf) return null
  if (conf === "observed_complete") {
    return {
      border: "#D9303F",
      bg: "rgba(217,48,63,0.10)",
      badgeBg: "#D9303F",
      badgeInk: "#fff",
      solid: true,
    }
  }
  if (conf === "config_complete") {
    return {
      border: "#c0468b",
      bg: "rgba(192,70,139,0.04)",
      badgeBg: "transparent",
      badgeInk: "#c0468b",
      solid: false,
    }
  }
  // origin_unresolved — amber degraded, never green
  return {
    border: "#d97706",
    bg: "rgba(217,119,6,0.08)",
    badgeBg: "#d97706",
    badgeInk: "#fff",
    solid: true,
  }
}

function SpineCardView({ card }: { card: SpineCard }) {
  const token = SEMANTIC_TOKENS[card.semantic]
  const Icon = card.icon
  const originStyle = originConfidenceStyle(card.originConfidence)
  const border = originStyle?.border ?? token.border
  const bg = originStyle?.bg ?? token.bg ?? semanticBgTint(card.semantic)
  const borderWidth = originStyle
    ? originStyle.solid
      ? 2.5
      : 1.5
    : token.width
  const borderStyle = originStyle && !originStyle.solid ? "dashed" : "solid"

  return (
    <div
      className="relative flex flex-col rounded-lg px-3 py-2.5 transition-shadow"
      style={{
        width: "100%",
        background: bg,
        border: `${borderWidth}px ${borderStyle} ${border}`,
        boxShadow: originStyle ? undefined : token.glow,
        minHeight: 80,
      }}
      data-semantic={card.semantic}
      data-origin-confidence={card.originConfidence ?? undefined}
      data-testid={
        card.originConfidence ? "spine-origin-card" : undefined
      }
    >
      {card.badge ? (
        <span
          className="absolute right-2 top-2 rounded px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider"
          style={{
            background: originStyle?.badgeBg ?? token.border,
            color: originStyle?.badgeInk ?? "white",
            border:
              originStyle && !originStyle.solid
                ? `1px solid ${originStyle.border}`
                : undefined,
            letterSpacing: "0.06em",
          }}
        >
          {card.badge}
        </span>
      ) : null}
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="h-3 w-3" style={{ color: border }} />
        <span
          className="text-[9px] font-extrabold uppercase tracking-[0.08em]"
          style={{ color: border }}
        >
          {card.kind}
        </span>
      </div>
      <div
        className="text-[13px] font-semibold leading-tight truncate"
        style={{ color: CG.ink }}
        title={card.title}
      >
        {card.title}
      </div>
      {card.sub ? (
        <div className="text-[11px] mt-0.5 truncate" style={{ color: CG.muted }} title={card.sub}>
          {card.sub}
        </div>
      ) : null}
    </div>
  )
}

function SpineArrow({ delay = 0 }: { delay?: number }) {
  return (
    <div className="relative flex items-center justify-center" style={{ width: 40, minHeight: 80 }}>
      <svg width="40" height="80" viewBox="0 0 40 80" className="overflow-visible">
        <line
          x1={2}
          y1={40}
          x2={36}
          y2={40}
          stroke="#2b3a4b"
          strokeWidth={2.5}
          markerEnd="url(#spine-arrow-head)"
        />
        <defs>
          <marker
            id="spine-arrow-head"
            viewBox="0 0 10 10"
            refX={8}
            refY={5}
            markerWidth={8}
            markerHeight={8}
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#2b3a4b" />
          </marker>
        </defs>
        <circle r={3} fill="white" stroke="#2b3a4b" strokeWidth={1.5}>
          <animateMotion
            dur="3s"
            begin={`${delay}s`}
            repeatCount="indefinite"
            path="M 2 40 L 36 40"
            rotate="auto"
          />
        </circle>
      </svg>
    </div>
  )
}

function SafetyChip({ gate }: { gate: "AUTO_ELIGIBLE" | "REVIEW_REQUIRED" | "BLOCKED" | null }) {
  if (!gate) return null
  const styles =
    gate === "AUTO_ELIGIBLE"
      ? { label: "AUTO", bg: "rgba(46,158,91,0.12)", border: "#2e9e5b", ink: "#1b6b41" }
      : gate === "BLOCKED"
      ? { label: "BLOCKED", bg: "rgba(217,48,63,0.10)", border: "#D9303F", ink: "#7a2419" }
      : { label: "REVIEW", bg: "rgba(226,169,59,0.12)", border: "#e2a93b", ink: "#7a5511" }
  return (
    <span
      className="rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.08em]"
      style={{ background: styles.bg, border: `1px solid ${styles.border}`, color: styles.ink }}
    >
      {styles.label}
    </span>
  )
}

export function AttackSpineStrip({
  report,
  path,
}: {
  report: AttackPathReport
  path: IdentityAttackPath | null | undefined
}) {
  const { cards, hopBands, pivotCount, usedSpine } = buildSpineCards(report, path)
  const gate = report.safety_decision?.gate ?? null
  const reason = report.safety_decision?.reasons?.[0]
  const blast = report.blast_radius?.headline
  const chainTitle = usedSpine
    ? `${cards[0]?.title} → ${cards[1]?.title} → ${cards[2]?.title}`
    : `${report.current_state.source_label} → ${report.current_state.target_label}`

  // Three nodes always: origin |→| principal |→| jewel
  const gridCols = "1fr 40px 1fr 40px 1fr"

  return (
    <div
      className="rounded-[14px] border bg-white px-5 py-4"
      style={{
        borderColor: CG.border,
        boxShadow: "0 1px 2px rgba(20,35,55,.04), 0 4px 12px rgba(20,35,55,.06)",
      }}
      data-testid="attack-spine-strip"
      data-spine-source={usedSpine ? "zoom1_spine" : "source_label_fallback"}
    >
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span
          className="text-[10px] font-extrabold uppercase tracking-[0.12em]"
          style={{ color: CG.muted }}
        >
          Attack chain
        </span>
        <span className="text-[10px]" style={{ color: CG.faint }}>
          ·
        </span>
        <span
          className="text-[10px] font-mono truncate max-w-[480px]"
          style={{ color: CG.muted }}
          title={chainTitle}
        >
          {chainTitle}
        </span>
        {pivotCount > 0 ? (
          <span
            className="rounded-md px-2 py-0.5 text-[10px] font-bold"
            style={{
              background: "rgba(192,70,139,0.10)",
              border: "1px solid rgba(192,70,139,0.35)",
              color: "#8a2f5f",
            }}
            data-testid="spine-identity-pivots-badge"
            title="Additional identities this compromised principal can assume"
          >
            +{pivotCount} pivot{pivotCount === 1 ? "" : "s"}
          </span>
        ) : null}
        {report.current_state.severity ? (
          <span
            className="ml-auto text-[10px] font-extrabold uppercase tracking-wider"
            style={{
              color:
                report.current_state.severity === "CRITICAL"
                  ? CG.attack
                  : report.current_state.severity === "HIGH"
                  ? "#ed7d22"
                  : report.current_state.severity === "MEDIUM"
                  ? "#e2a93b"
                  : "#2e9e5b",
            }}
          >
            {report.current_state.severity}
          </span>
        ) : null}
      </div>

      <div className="grid items-stretch gap-0" style={{ gridTemplateColumns: gridCols }}>
        <SpineCardView card={cards[0]} />
        <SpineArrow delay={0} />
        <SpineCardView card={cards[1]} />
        <SpineArrow delay={0.6} />
        <SpineCardView card={cards[2]} />
      </div>

      {hopBands.length > 0 ? (
        <div className="mt-3 space-y-1" data-testid="spine-hop-bands">
          {hopBands.map((band) => (
            <div
              key={band}
              className="rounded-md px-3 py-1.5 text-[11px] font-medium"
              style={{
                background: "rgba(16,24,40,0.03)",
                color: CG.muted,
                border: "1px dashed rgba(43,58,75,0.2)",
              }}
            >
              {band}
            </div>
          ))}
        </div>
      ) : null}

      {(gate || blast || reason) && (
        <div
          className="mt-3 flex flex-wrap items-center gap-2 rounded-md px-3 py-2"
          style={{ background: "rgba(16,24,40,0.03)" }}
        >
          <SafetyChip gate={gate} />
          {blast ? (
            <span className="text-[11px]" style={{ color: CG.ink }}>
              <span style={{ color: CG.muted }}>Blast · </span>
              {blast}
            </span>
          ) : null}
          {reason ? (
            <span className="text-[11px] ml-auto truncate" style={{ color: CG.muted, maxWidth: 360 }} title={reason}>
              {reason}
            </span>
          ) : null}
        </div>
      )}
    </div>
  )
}
