"use client"

// Attack Path Card — LIGHT prod design (cyntro_attack-path-card_design.html).
//
// PURE RENDERER of the backend-owned AttackPathReport. Same data contract and
// same `useAttackPathReport` hook the dark AttackerNarrative uses — this file
// changes ONLY presentation (a scoped light palette + the mockup's 4-section
// layout). Every value on screen comes from the live compiler report or the
// real path object; absent signal drops the section (honest degradation), and
// collection gaps surface in "Not shown — signal missing".
//
// NO MOCK DATA. The light theme is scoped to this card via explicit hex (the
// mockup palette) so it renders light regardless of the app's global theme.

import {
  Server,
  Database,
  KeyRound,
  Lock,
  User,
  Box,
  Crosshair,
  EyeOff,
} from "lucide-react"
import type {
  IdentityAttackPath,
  CrownJewelSummary,
  PathNodeDetail,
} from "@/components/identity-attack-paths/types"
import type {
  AttackPathReport,
  GateState,
  MicroPlane,
} from "./attack-path-report-types"
import { useClosurePreview } from "./use-closure-preview"
import { useAttackPathReport } from "./use-attack-path-report"
import { classifyPathShape } from "./path-shape"
import type { SystemArchitecture } from "@/components/dependency-map/traffic-flow-map"

// ── Mockup palette (cyntro_attack-path-card_design.html :root) ──────────────
const C = {
  page: "#eef1f5",
  card: "#ffffff",
  ink: "#1f2733",
  muted: "#6b7480",
  faint: "#8a93a3",
  rule: "#e2e6ec",
  chip: "#eef0f4",
  chipInk: "#3a4150",
  red: "#c0392b",
  redBg: "#fbeae8",
  redInk: "#7a2419",
  redBar: "#d6452f",
  green: "#2c8a57",
  greenBg: "#e9f5ee",
  greenInk: "#1c6b41",
  greenBar: "#2e9e5b",
  amber: "#b5710f",
  amberBar: "#e0901e",
  gold: "#a37d14",
  goldBar: "#d4a82a",
  blue: "#2f6fd0",
  pinkBar: "#c2335e",
  purpleBar: "#5b4fc4",
  goldBadge1: "#d9a531",
  goldBadge2: "#c4901c",
} as const

// AWS node → icon + service color + human label. Drives the header path line
// chips. Pattern-matched off the node type the graph emits.
function awsNodeMeta(type: string): { label: string; color: string; Icon: typeof Server } {
  const t = (type || "").toLowerCase()
  if (/lambda/.test(t)) return { label: "Lambda", color: "#ec7211", Icon: Box }
  if (/ec2|instance/.test(t)) return { label: "EC2", color: "#ec7211", Icon: Server }
  if (/s3|bucket/.test(t)) return { label: "S3 bucket", color: "#4e9a3e", Icon: Database }
  if (/dynamo/.test(t)) return { label: "DynamoDB", color: "#4e9a3e", Icon: Database }
  if (/rds/.test(t)) return { label: "RDS", color: "#3b73c4", Icon: Database }
  if (/kms|key/.test(t)) return { label: "KMS key", color: "#5b4fc4", Icon: KeyRound }
  if (/secret/.test(t)) return { label: "Secret", color: "#c2335e", Icon: Lock }
  if (/role|principal|user|policy|iam/.test(t)) return { label: "IAM role", color: "#c2335e", Icon: User }
  return { label: "Resource", color: C.muted, Icon: Box }
}

// Severity → gold-badge gradient tone. The mockup badge is a single gold
// gradient; we tint by severity so CRITICAL/HIGH read hotter than MEDIUM/LOW
// without inventing a number.
function badgeGradient(sev?: string): string {
  switch ((sev || "").toUpperCase()) {
    case "CRITICAL":
      return `linear-gradient(160deg, #c0392b, #962a1f)`
    case "HIGH":
      return `linear-gradient(160deg, #d97a1e, #b85f12)`
    case "LOW":
      return `linear-gradient(160deg, #2e9e5b, #1c6b41)`
    case "MEDIUM":
    default:
      return `linear-gradient(160deg, ${C.goldBadge1}, ${C.goldBadge2})`
  }
}

// GateState → plain-language answer + tone for the "How real?" grid. Mirrors
// the compiler vocabulary exactly (OPEN_OBSERVED / OPEN_CONFIG / UNKNOWN /
// CLOSED|BLOCKED) — the renderer never re-derives, only displays.
function gateMeta(g?: GateState): { answer: string; bar: string; ink: string; desc: string } {
  switch (g) {
    case "OPEN_OBSERVED":
      return {
        answer: "Yes — seen happening",
        bar: C.redBar,
        ink: C.red,
        desc: "The engine watched this step actually used in the logs. Proven, not theoretical.",
      }
    case "OPEN_CONFIG":
      return {
        answer: "Yes — allowed by config",
        bar: C.amberBar,
        ink: C.amber,
        desc: "Open by configuration. No behavior observed yet, but nothing blocks it.",
      }
    case "CLOSED":
    case "BLOCKED":
      return {
        answer: "No — blocked by a control",
        bar: C.greenBar,
        ink: C.green,
        desc: "A control provably breaks this step. The chain does not complete here.",
      }
    case "UNKNOWN":
    default:
      return {
        answer: "Unknown — unverified",
        bar: C.goldBar,
        ink: C.gold,
        desc: "The control here isn't confirmed yet — we treat that as a gap, not a pass.",
      }
  }
}

const MICRO_LABEL: Record<MicroPlane, { title: string; bar: string; fallback: string }> = {
  micro_permissions: { title: "Micro-permission", bar: C.pinkBar, fallback: "Strip the IAM actions never used in the observed window." },
  micro_segmentation: { title: "Micro-segmentation", bar: C.purpleBar, fallback: "Keep the network blast radius contained." },
  micro_access: { title: "Micro-access", bar: C.greenBar, fallback: "Scope data access to what's actually touched." },
}

// Plain-word damage verbs from the ALLOWED cells of the matrix.
const DAMAGE_ORDER = ["ADMIN", "DELETE", "WRITE", "READ"] as const
const DAMAGE_WORD: Record<string, string> = {
  ADMIN: "change settings on",
  DELETE: "delete",
  WRITE: "change",
  READ: "read",
}

function nodeName(n?: PathNodeDetail): string {
  return n?.name ?? ""
}

// ─────────────────────────────────────────────────────────────────────────
// Pure view — everything from `report` + `path` (the /100 score + node icons).
// ─────────────────────────────────────────────────────────────────────────
// Gate-collapse rule (extracted pure for unit-testing). On an identity-only
// path (assume-chain / standing-access, shape B/C) there is no network hop to
// cross, so route_gate arrives UNKNOWN structurally — not because a check is
// missing. We collapse the network card ONLY when the gate carries no real
// signal; a concrete OPEN/CLOSED keeps the card even on B/C.
export function isNetworkGateNA(
  shape: "A" | "B" | "C" | undefined,
  networkGate: GateState | null | undefined,
): boolean {
  return (shape === "B" || shape === "C") && (!networkGate || networkGate === "UNKNOWN")
}

export function AttackPathCardLightView({
  report,
  path,
  systemName,
  architecture,
}: {
  report: AttackPathReport
  path: IdentityAttackPath
  systemName?: string | null
  architecture?: SystemArchitecture | null
}) {
  const cs = report.current_state
  const diff = report.remediation_diff
  const nodes = path.nodes ?? []
  const sourceNode = nodes[0]
  // The crown jewel is the node matching the report's target (by name/id), NOT
  // blindly nodes[last] — the backend chain can carry a trailing node past the
  // jewel (e.g. the bucket's KMS key), which would mistype an S3 bucket as a
  // KMS key. Prefer the authoritative jewel service from damage_capability.
  const targetNode =
    nodes.find((n) => n.name === cs.target_label || n.canonical_id === cs.target_label || n.id === cs.target_label) ??
    nodes.filter((n) => n.tier === "crown_jewel").slice(-1)[0] ??
    nodes[nodes.length - 1]
  const sourceMeta = awsNodeMeta(sourceNode?.type ?? "")
  const targetMeta = awsNodeMeta(path.damage_capability?.jewel_service || targetNode?.type || "")

  const severity = cs.severity ?? path.severity?.severity
  const pathScore = path.severity?.overall_score

  // Damage verbs (ALLOWED cells only), ordered worst-first.
  const allowed = new Set(
    report.damage_matrix
      .filter((c) => c.status === "ALLOWED")
      .map((c) => String(c.category)),
  )
  const verbs = DAMAGE_ORDER.filter((c) => allowed.has(c))
  const dangerPhrase = verbs.map((v) => DAMAGE_WORD[v]).join(", ")

  // What the fix removes vs keeps (from micro-enforcement reduces — same
  // mapping the dark renderer uses).
  const reduces = new Set((report.micro_enforcement ?? []).flatMap((m) => m.reduces ?? []))
  const removesDelete = reduces.has("DATA_DELETE_DAMAGE")
  const removesAdmin = reduces.has("DATA_ADMIN_DAMAGE")

  const scopes = diff?.scope_to ?? []
  const gates = report.gates ?? {}

  // Path shape — the backend report is authoritative (current_state.shape). Fall
  // back to the structural classifier only when the report predates the
  // shape-emitting compiler (honest degradation across the deploy boundary);
  // shape is a pure function of path structure, so this never invents data.
  const effectiveShape =
    cs.shape ?? classifyPathShape(path, diff?.remove_actions ?? undefined).kind

  // "The risk" lede — ALWAYS the computed plain-words sentence, NEVER the
  // dense technical business_sentence (cs.summary). For Shape B/C the compiler
  // composed cs.headline (plain words, verified); for Shape A we compose a
  // plain reach sentence from the same real fields. cs.summary is intentionally
  // not shown here — plain words only.
  const plainLede =
    cs.headline ??
    `If an attacker takes over ${cs.source_label}, they gain its identity and reach ${cs.target_label}.`

  return (
    <div
      style={{ background: C.page, color: C.ink }}
      className="rounded-2xl p-6 sm:p-8 font-sans"
      data-testid="attack-path-card-light"
    >
      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="min-w-0">
          <div
            className="text-[12px] font-semibold uppercase tracking-[0.13em] mb-4"
            style={{ color: C.faint }}
          >
            Attack path · {cs.target_label}
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <NodeChip meta={sourceMeta} name={cs.source_label || nodeName(sourceNode)} />
            <span style={{ color: "#9aa3b1" }} className="text-xl">→</span>
            <NodeChip meta={targetMeta} name={cs.target_label || nodeName(targetNode)} />
          </div>
        </div>
        <div
          className="rounded-2xl px-6 py-3.5 text-center shrink-0"
          style={{ background: badgeGradient(severity), color: "#fff", minWidth: 124 }}
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.1em] opacity-90">
            Potential risk
          </div>
          {pathScore != null && (
            <div className="text-[46px] font-extrabold leading-none my-0.5">{pathScore}</div>
          )}
          <div className="text-[13px] font-semibold uppercase tracking-[0.08em] opacity-95">
            {(severity ?? "—").toString().toLowerCase()}
          </div>
        </div>
      </div>
        {/* ── THE RISK ────────────────────────────────────────────────────── */}
        <Section title="The risk" hint="what an attacker could do — in plain words">
        <div
          className="rounded-2xl p-7"
          style={{ background: C.card, boxShadow: "0 1px 2px rgba(20,30,50,.05),0 6px 22px rgba(20,30,50,.05)" }}
        >
          <p className="text-[19px] leading-relaxed m-0" style={{ color: C.ink }}>
            {plainLede}
          </p>
          {dangerPhrase && (
            <p className="text-[17px] leading-relaxed mt-3 mb-0" style={{ color: C.ink }}>
              Right now they could{" "}
              <span style={{ color: C.red, fontWeight: 700 }}>
                {dangerPhrase} {targetMeta.label === "S3 bucket" ? "every object in" : "in"} {cs.target_label}
              </span>
              .
            </p>
          )}

          {/* before / after damage boxes */}
          {(report.verification_target || diff) && (
            <div className="flex items-stretch gap-4 mt-6 mb-1 flex-wrap sm:flex-nowrap">
              <div className="flex-1 rounded-xl px-5 py-4 min-w-[220px]" style={{ background: C.redBg }}>
                <div className="text-[12px] font-bold uppercase tracking-[0.07em] mb-2" style={{ color: C.red }}>
                  Potential damage — today
                </div>
                <p className="text-[18px] font-bold leading-snug m-0" style={{ color: C.redInk }}>
                  {verbs.length > 0
                    ? `Can ${verbs.map((v) => DAMAGE_WORD[v]).join(" / ")} across all of ${cs.target_label}.`
                    : `Standing access to ${cs.target_label}.`}
                </p>
              </div>
              <div className="hidden sm:flex items-center text-2xl" style={{ color: C.green }}>→</div>
              <div className="flex-1 rounded-xl px-5 py-4 min-w-[220px]" style={{ background: C.greenBg }}>
                <div className="text-[12px] font-bold uppercase tracking-[0.07em] mb-2" style={{ color: C.green }}>
                  After the safe fix
                </div>
                <p className="text-[18px] font-bold leading-snug m-0" style={{ color: C.greenInk }}>
                  {report.verification_target?.expected_result ??
                    `Keep the access it actually uses${scopes.length ? `, scoped to ${scopes.join(", ")}` : ""}.${removesDelete ? " No deletion." : ""}`}
                </p>
              </div>
            </div>
          )}

          {diff && (
            <p className="text-[15px] leading-relaxed mt-5 mb-0" style={{ color: C.muted }}>
              We shrink the damage by{" "}
              <b style={{ color: C.ink }}>
                removing {diff.remove_actions.length} permission{diff.remove_actions.length === 1 ? "" : "s"} unused in the observed window
              </b>
              {scopes.length > 0 && (
                <>
                  {" "}and <b style={{ color: C.ink }}>limiting it to {scopes.join(", ")}</b>
                </>
              )}
              {" "}— without breaking what it really does.
            </p>
          )}
        </div>
      </Section>

      {/* ── HOW REAL IS THIS PATH? (the gates) ──────────────────────────── */}
      {/* Gate-collapse: on an identity-only path (assume-chain / standing-access,
          shape B/C) there is no network hop to cross, so route_gate arrives
          UNKNOWN structurally — NOT because a check is missing. Rendering a gold
          "Unknown — unverified" network card there misreads as a gap, so we drop
          it and say plainly that IAM is the only gate. We only collapse when the
          network gate carries no real signal; a real OPEN/CLOSED keeps the card. */}
      {(() => {
        const networkIsNA = isNetworkGateNA(effectiveShape, gates.network)
        if (!(gates.identity || gates.network || gates.data_plane)) return null
        return (
          <Section
            title="How real is this path?"
            hint={networkIsNA ? "IAM is the only gate on this path" : "three checks the engine runs"}
          >
            <div className={`grid grid-cols-1 ${networkIsNA ? "sm:grid-cols-2" : "sm:grid-cols-3"} gap-4`}>
              <GateCard q="Can they be this identity?" g={gates.identity} />
              {!networkIsNA && (
                <GateCard q="Can they reach it on the network?" g={gates.network} />
              )}
              <GateCard q={`Does ${cs.target_label} itself block it?`} g={gates.data_plane} />
            </div>
            {networkIsNA && (
              <p className="text-[12px] leading-relaxed mt-3 m-0" style={{ color: C.muted }}>
                No network hop to cross on this path — the attacker uses standing IAM access,
                so IAM is the only gate. Network reachability isn&apos;t a check here.
              </p>
            )}
          </Section>
        )
      })()}

      {/* ── THE FIX YOU APPROVE ─────────────────────────────────────────── */}
      {(report.micro_enforcement?.length || diff) && (
        <Section
          title="The fix you approve"
          hint="remove unused · keep what's used · add a scope limit"
        >
          {report.micro_enforcement && report.micro_enforcement.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              {report.micro_enforcement.map((m) => {
                const meta = MICRO_LABEL[m.plane] ?? MICRO_LABEL.micro_permissions
                return (
                  <div
                    key={m.plane}
                    className="rounded-xl px-5 py-4"
                    style={{ background: C.card, border: `1px solid ${C.rule}`, borderTop: `3px solid ${meta.bar}` }}
                  >
                    <p className="text-[15px] font-bold m-0 mb-1.5" style={{ color: C.ink }}>{meta.title}</p>
                    <p className="text-[14px] leading-snug m-0" style={{ color: C.muted }}>
                      {m.summary || meta.fallback}
                    </p>
                  </div>
                )
              })}
            </div>
          )}

          {diff && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-7 rounded-xl px-6 py-5" style={{ background: "#f2f4f7" }}>
              {/* before */}
              <div>
                <div className="text-[12px] font-bold uppercase tracking-[0.07em] mb-3" style={{ color: C.red }}>
                  Before · today
                </div>
                <p className="text-[15px] m-0 mb-1" style={{ color: C.ink }}>
                  Worst case:{" "}
                  <b style={{ color: C.red }}>
                    {removesDelete ? "delete the whole target" : verbs.map((v) => DAMAGE_WORD[v]).join(" / ") || "standing access"}
                  </b>
                </p>
                {verbs.length > 0 && (
                  <p className="text-[14px] m-0" style={{ color: C.muted }}>
                    {verbs.map((v) => DAMAGE_WORD[v]).join(" · ")} — all objects
                  </p>
                )}
              </div>
              {/* changes */}
              <div>
                <div className="text-[12px] font-bold uppercase tracking-[0.07em] mb-3" style={{ color: C.muted }}>
                  What changes
                </div>
                {diff.remove_actions.length > 0 && (
                  <DiffLine sym="–" color={C.red}>
                    stop {diff.remove_actions.length} unused destructive/admin action{diff.remove_actions.length === 1 ? "" : "s"}
                  </DiffLine>
                )}
                {diff.keep_actions.length > 0 && (
                  <DiffLine sym="✓" color={C.green}>
                    keep the {diff.keep_actions.length} action{diff.keep_actions.length === 1 ? "" : "s"} it really uses
                  </DiffLine>
                )}
                {scopes.length > 0 && (
                  <DiffLine sym="✓" color={C.green}>
                    limit it to {scopes.join(", ")}
                  </DiffLine>
                )}
                {diff.rollback_snapshot_id && (
                  <DiffLine sym="+" color={C.blue}>
                    snapshot saved for one-click undo
                  </DiffLine>
                )}
              </div>
              {/* after */}
              <div>
                <div className="text-[12px] font-bold uppercase tracking-[0.07em] mb-3" style={{ color: C.green }}>
                  After · projected
                </div>
                <DiffLine sym="✓" color={C.green} inkText>
                  still works — reads &amp; writes what it needs
                </DiffLine>
                {(removesDelete || removesAdmin) && (
                  <DiffLine sym="☑" color={C.green} inkText>
                    can no longer {removesDelete ? "delete anything" : "change posture"}
                  </DiffLine>
                )}
                <div className="flex gap-2 flex-wrap mt-3">
                  <ApprovePill>observed-behavior basis</ApprovePill>
                  {diff.rollback_snapshot_id && <ApprovePill>one-click rollback</ApprovePill>}
                  {report.safety_decision && (
                    <ApprovePill>{report.safety_decision.gate.replace(/_/g, " ").toLowerCase()}</ApprovePill>
                  )}
                </div>
              </div>
            </div>
          )}
        </Section>
      )}

      {/* ── Not shown — signal missing (honest gaps) ────────────────────── */}
      {report.missing_evidence.length > 0 && (
        <Section title="Not shown — signal missing" hint="collection gaps are actionable, not silent">
          <div className="rounded-xl px-5 py-4" style={{ background: C.card, border: `1px solid ${C.rule}` }}>
            <ul className="m-0 p-0 list-none space-y-1.5">
              {report.missing_evidence.map((m) => (
                <li key={m.signal} className="text-[14px] leading-snug flex items-start gap-2" style={{ color: C.muted }}>
                  <EyeOff className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: C.faint }} />
                  <span>
                    <span style={{ color: C.ink, fontWeight: 600 }}>{m.signal}</span> — {m.why_it_matters}
                    {m.blocks_approval && (
                      <span style={{ color: C.red, fontWeight: 700 }}> · blocks approval</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Section>
      )}

      {/* provenance footer */}
      <div className="mt-6 text-[11px] font-mono" style={{ color: C.faint }}>
        compiler {report.compiler_version}
        {report.evidence_pack_hash && ` · evidence ${report.evidence_pack_hash.slice(0, 12)}`}
      </div>
    </div>
  )
}

// ── Small presentational helpers ────────────────────────────────────────────
function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="mt-10">
      <div className="flex items-baseline gap-3 mb-2.5">
        <b className="text-[16px] font-extrabold" style={{ color: C.ink }}>{title}</b>
        <span className="text-[14px]" style={{ color: C.faint }}>{hint}</span>
      </div>
      <div className="h-px mb-5" style={{ background: C.rule }} />
      {children}
    </div>
  )
}

function NodeChip({ meta, name }: { meta: { label: string; color: string; Icon: typeof Server }; name: string }) {
  const { label, color, Icon } = meta
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div
        className="w-[34px] h-[34px] rounded-lg flex items-center justify-center shrink-0"
        style={{ background: color }}
      >
        <Icon className="w-[19px] h-[19px]" style={{ color: "#fff" }} />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-[0.06em] leading-tight" style={{ color: C.faint }}>
          {label}
        </div>
        <div className="text-[18px] font-bold leading-tight truncate" style={{ color: C.ink }} title={name}>
          {name}
        </div>
      </div>
    </div>
  )
}

function GateCard({ q, g }: { q: string; g?: GateState }) {
  const m = gateMeta(g)
  return (
    <div
      className="rounded-xl px-5 py-4"
      style={{ background: C.card, border: `1px solid ${C.rule}`, borderLeft: `4px solid ${m.bar}` }}
    >
      <p className="text-[15px] font-bold m-0 mb-1.5" style={{ color: C.ink }}>{q}</p>
      <p className="text-[15px] font-bold m-0 mb-2" style={{ color: m.ink }}>{m.answer}</p>
      <p className="text-[14px] leading-snug m-0" style={{ color: C.muted }}>{m.desc}</p>
    </div>
  )
}

function DiffLine({
  sym,
  color,
  inkText,
  children,
}: {
  sym: string
  color: string
  inkText?: boolean
  children: React.ReactNode
}) {
  return (
    <p className="text-[14.5px] leading-snug m-0 mb-2 flex gap-2" style={{ color: inkText ? C.ink : color }}>
      <span style={{ color }}>{sym}</span>
      <span>{children}</span>
    </p>
  )
}

function ApprovePill({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-[12.5px] font-semibold px-2.5 py-1 rounded-md"
      style={{ background: "#e6efe9", color: C.greenInk }}
    >
      {children}
    </span>
  )
}

// ── Self-resolving wrapper — same signature/contract as <AttackerNarrative/>.
//
// Data source: the BACKEND compiler — GET /api/attack-paths/<id>/report, via
// useAttackPathReport (backend-first, single retry on cold-start). Live
// profiling (2026-06-14) confirmed the endpoint returns 200 in ~0.3s with the
// full report (the earlier ">160s" was a transient cold-start, not a real
// hang). The CLIENT BRIDGE compiler (compile-attack-path-report.ts) is kept as
// a dev-only fallback behind ?reportBridge=1 — we never silently render the
// bridge in prod, since an honest "temporarily unavailable + retry" beats a
// possibly-contradicting in-browser derivation on a CISO surface.
//
// Honest states (no open-ended spinner): loading → skeleton; backend failure →
// unavailable card with a Retry affordance; success → the report card.
export function AttackPathCardLight({
  path,
  jewel,
  systemName,
  architecture,
}: {
  path: IdentityAttackPath
  jewel?: CrownJewelSummary | null
  systemName?: string | null
  architecture?: SystemArchitecture | null
}) {
  const { closure } = useClosurePreview(path)
  const { report, source, loading, error, retry } = useAttackPathReport(path, jewel, closure)

  if (!report && loading) {
    return <CardSkeleton />
  }
  if (!report) {
    return (
      <div className="rounded-2xl p-6" style={{ background: C.page, color: C.ink }}>
        <div className="flex items-center gap-2">
          <Crosshair className="h-4 w-4 shrink-0" style={{ color: C.muted }} />
          <span className="text-[12px] font-semibold uppercase tracking-wider">
            Attack-path report unavailable
          </span>
        </div>
        <p className="text-[13px] mt-2" style={{ color: C.muted }}>
          {error
            ? "The report engine didn’t respond in time. Showing nothing rather than stale or contradicting data."
            : "No report for this path yet."}
        </p>
        {error && (
          <button
            type="button"
            onClick={retry}
            className="mt-3 text-[12px] font-semibold px-3 py-1.5 rounded-lg"
            style={{ background: C.ink, color: "#fff" }}
          >
            Retry
          </button>
        )}
      </div>
    )
  }
  return (
    <>
      {source === "bridge" && (
        <div
          className="rounded-lg px-3 py-2 mb-3 text-[11px] font-semibold"
          style={{ background: C.amberBar + "22", color: C.amber }}
        >
          Dev bridge report (?reportBridge=1) — backend report unavailable; values
          compiled in-browser.
        </div>
      )}
      <AttackPathCardLightView report={report} path={path} systemName={systemName} architecture={architecture} />
    </>
  )
}

// Loading skeleton — bounded, honest "working" state (never an open-ended
// spinner). Mirrors the card's section rhythm so the layout doesn't jump.
function CardSkeleton() {
  return (
    <div className="rounded-2xl p-6 animate-pulse" style={{ background: C.card }} aria-busy="true">
      <div className="flex items-center justify-between gap-4">
        <div className="h-4 w-40 rounded" style={{ background: C.rule }} />
        <div className="h-12 w-20 rounded-xl" style={{ background: C.rule }} />
      </div>
      <div className="h-6 w-3/4 rounded mt-5" style={{ background: C.rule }} />
      <div className="h-4 w-2/3 rounded mt-3" style={{ background: C.rule }} />
      <div className="flex gap-4 mt-6">
        <div className="flex-1 h-24 rounded-xl" style={{ background: C.rule }} />
        <div className="flex-1 h-24 rounded-xl" style={{ background: C.rule }} />
      </div>
      <div className="h-32 rounded-2xl mt-6" style={{ background: C.rule }} />
      <div className="grid grid-cols-3 gap-4 mt-6">
        <div className="h-20 rounded-xl" style={{ background: C.rule }} />
        <div className="h-20 rounded-xl" style={{ background: C.rule }} />
        <div className="h-20 rounded-xl" style={{ background: C.rule }} />
      </div>
    </div>
  )
}
