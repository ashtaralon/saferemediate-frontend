"use client"

// =============================================================================
// Attack Spine Strip — the CISO-readable executive surface.
//
// 80px-tall horizontal kill chain: ENTRY → COMPUTE → IDENTITY → JEWEL with
// an animated traversal dot. Reads in 5 seconds. No AWS topology cognitive
// load — VPC / subnet / route table noise lives in the Cloud Graph drawer
// below.
//
// Every value comes from the backend AttackPathReport (PR #133 cutover); no
// frontend semantic computation. Uses the Visual Hierarchy Contract's
// color authority (PR #136): red ONLY on the compromise origin, never on
// edges, never as decoration.
// =============================================================================

import { Crown, KeyRound, Server, User } from "lucide-react"
import type {
  IdentityAttackPath,
  PathNodeDetail,
} from "@/components/identity-attack-paths/types"
import type { AttackPathReport, DamageCategory } from "./attack-path-report-types"
import { SEMANTIC_TOKENS, type SemanticClass } from "./cloud-graph-semantic"
import { CG } from "./cloud-graph-tokens"

// ─── Card shape ─────────────────────────────────────────────────────────────

interface SpineCard {
  semantic: Extract<SemanticClass, "ENTRY" | "IDENTITY" | "JEWEL">
  /** Small uppercase type label e.g. "ENTRY", "COMPUTE", "IDENTITY", "JEWEL". */
  kind: string
  title: string
  /** 1-line sub-fact (instance id, perm count, damage classes, etc.). */
  sub?: string
  /** Optional badge text rendered in the top-right. */
  badge?: string
  icon: React.ComponentType<{ className?: string }>
}

// ─── Spine assembly from the report + path ─────────────────────────────────

function findIamRoleName(path: IdentityAttackPath | null | undefined): string | undefined {
  if (!path) return undefined
  // Prefer damage_capability.role_name (already friendly).
  const rn = path.damage_capability?.role_name
  if (rn && !/^aroa/i.test(rn)) return rn
  // Else first IAMRole node on the path.
  const role = (path.nodes ?? []).find((n) => /iamrole/i.test(String(n.type)))
  if (!role) return undefined
  // Resolve AROA → role name via canonical_id (ARN) if available.
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

function buildSpine(
  report: AttackPathReport,
  path: IdentityAttackPath | null | undefined,
): SpineCard[] {
  // 1) ENTRY — User/Internet. Always present in any path that touches the
  //    internet (a network gate fires entry: "OPEN_*"); we render it as the
  //    persistent attacker origin even when the IR doesn't carry a discrete
  //    "User" node.
  const entry: SpineCard = {
    semantic: "ENTRY",
    kind: "ENTRY",
    title: "User / Internet",
    sub: report.gates.entry === "OPEN_OBSERVED" ? "0.0.0.0/0 · observed" : "0.0.0.0/0",
    icon: User,
  }

  // 2) COMPUTE / FOOTHOLD — the workload the attacker takes over. The IR's
  //    source_label is the friendly name; instance id comes from path nodes
  //    when available.
  const computeNode = (path?.nodes ?? []).find((n) =>
    /ec2|instance|lambda|ecs|container/i.test(String(n.type)),
  )
  const compute: SpineCard = {
    semantic: "ENTRY", // foothold compute is the same dominance class as the user origin
    kind: "COMPUTE · FOOTHOLD",
    title: report.current_state.source_label,
    sub: computeNode
      ? computeNode.id.startsWith("i-")
        ? `EC2 · ${computeNode.id.slice(0, 13)}…`
        : String(computeNode.type)
      : "compute workload",
    badge: "FOOTHOLD",
    icon: Server,
  }

  // 3) IDENTITY — the IAM role/profile the foothold assumes.
  const role = findIamRoleName(path)
  const unused = unusedPermissionCount(report)
  const consumers = consumerCount(report)
  const identitySub =
    consumers && consumers > 1
      ? `${unused} unused · ${consumers} shared workloads`
      : `${unused} unused permission${unused === 1 ? "" : "s"}`
  const identity: SpineCard = {
    semantic: "IDENTITY",
    kind: "IDENTITY",
    title: role ?? "IAM role",
    sub: identitySub,
    icon: KeyRound,
  }

  // 4) JEWEL — the target. Damage classes summarize what an attacker can do.
  const dmg = damageClasses(report).join(" · ")
  const jewel: SpineCard = {
    semantic: "JEWEL",
    kind: "CROWN JEWEL",
    title: report.current_state.target_label,
    sub: dmg || "target",
    badge: "CROWN JEWEL",
    icon: Crown,
  }

  return [entry, compute, identity, jewel]
}

// ─── Visual primitives ──────────────────────────────────────────────────────

function semanticBgTint(s: SpineCard["semantic"]): string {
  if (s === "ENTRY") return "rgba(217,48,63,0.06)"
  if (s === "IDENTITY") return "rgba(192,70,139,0.06)"
  if (s === "JEWEL") return "rgba(201,147,18,0.08)"
  return "white"
}

function SpineCardView({ card }: { card: SpineCard }) {
  const token = SEMANTIC_TOKENS[card.semantic]
  const Icon = card.icon
  return (
    <div
      className="relative flex flex-col rounded-lg px-3 py-2.5 transition-shadow"
      style={{
        width: "100%",
        background: token.bg ?? semanticBgTint(card.semantic),
        border: `${token.width}px solid ${token.border}`,
        boxShadow: token.glow,
        minHeight: 80,
      }}
      data-semantic={card.semantic}
    >
      {card.badge ? (
        <span
          className="absolute right-2 top-2 rounded px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider"
          style={{
            background: token.border,
            color: "white",
            letterSpacing: "0.06em",
          }}
        >
          {card.badge}
        </span>
      ) : null}
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="h-3 w-3" />
        <span
          className="text-[9px] font-extrabold uppercase tracking-[0.08em]"
          style={{ color: token.border }}
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

// ─── Public component ──────────────────────────────────────────────────────

export function AttackSpineStrip({
  report,
  path,
}: {
  report: AttackPathReport
  path: IdentityAttackPath | null | undefined
}) {
  const cards = buildSpine(report, path)
  const gate = report.safety_decision?.gate ?? null
  const reason = report.safety_decision?.reasons?.[0]
  const blast = report.blast_radius?.headline

  return (
    <div
      className="rounded-[14px] border bg-white px-5 py-4"
      style={{
        borderColor: CG.border,
        boxShadow: "0 1px 2px rgba(20,35,55,.04), 0 4px 12px rgba(20,35,55,.06)",
      }}
      data-testid="attack-spine-strip"
    >
      <div className="flex items-center gap-2 mb-3">
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
          className="text-[10px] font-mono truncate max-w-[420px]"
          style={{ color: CG.muted }}
          title={`${report.current_state.source_label} → ${report.current_state.target_label}`}
        >
          {report.current_state.source_label} → {report.current_state.target_label}
        </span>
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

      <div className="grid items-stretch gap-0" style={{ gridTemplateColumns: "1fr 40px 1fr 40px 1fr 40px 1fr" }}>
        <SpineCardView card={cards[0]} />
        <SpineArrow delay={0} />
        <SpineCardView card={cards[1]} />
        <SpineArrow delay={0.6} />
        <SpineCardView card={cards[2]} />
        <SpineArrow delay={1.2} />
        <SpineCardView card={cards[3]} />
      </div>

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
