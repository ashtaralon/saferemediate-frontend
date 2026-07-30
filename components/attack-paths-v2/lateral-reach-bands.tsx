"use client"

/**
 * Reachable-but-never-used bands for a crown jewel — the Lateral cut list.
 *
 * Answers the question the rest of the Lateral tab cannot: not "what else can
 * this identity reach" (fan-out from a pinned path), but "who could reach THIS
 * jewel and has never actually used it" (fan-in). Those are the grants you can
 * remove without the legitimate system noticing.
 *
 * Every other attack-path surface reads :AttackPath, which is materialized FROM
 * OBSERVED ACCESS — so a route nothing ever exercised never appears there. This
 * panel is fed by the ALLOW side (:PermissionStatement) minus observed use.
 *
 * THE UNKNOWN BAND IS RENDERED WITH THE SAME WEIGHT AS THE CUT LIST, ON PURPOSE.
 * Showing only CUTTABLE would present a short, confident list while silently
 * hiding every role we cannot vouch for — on alon-prod that is 13 of 17. A role
 * we have never observed is indistinguishable from a role that does nothing;
 * calling it "safe to cut" is how this feature would break production. The
 * header therefore always states the unjudged count, even when it is large and
 * unflattering.
 */

import { AlertTriangle, HelpCircle, Loader2, Scissors, ShieldCheck } from "lucide-react"
import type {
  LateralBand,
  LateralReachPayload,
  LateralReachRole,
} from "./use-lateral-reach"

const BAND_META: Record<
  LateralBand,
  { label: string; blurb: string; tone: string; Icon: typeof Scissors }
> = {
  CUTTABLE: {
    label: "Never used — safe to cut",
    blurb:
      "Reachable, and this identity is provably observed elsewhere on this service — so the absence of use is evidence, not a blind spot.",
    tone: "border-amber-300/70 bg-amber-50/60 dark:border-amber-500/40 dark:bg-amber-500/10",
    Icon: Scissors,
  },
  UNKNOWN: {
    label: "Reachable — cannot judge",
    blurb:
      "Reachable, but never observed on this service at all. Absence of evidence is not evidence of non-use, so these are NOT proposed for a cut.",
    tone: "border-zinc-300/70 bg-zinc-50/70 dark:border-zinc-600/50 dark:bg-zinc-500/10",
    Icon: HelpCircle,
  },
  USED: {
    label: "In use — keep",
    blurb: "Observed accessing this jewel. Removing this access would break something.",
    tone: "border-emerald-300/70 bg-emerald-50/50 dark:border-emerald-500/30 dark:bg-emerald-500/10",
    Icon: ShieldCheck,
  },
}

// Cut list first (it is the action), then what we cannot judge, then what to
// keep. UNKNOWN sits ABOVE the reassuring band deliberately.
const BAND_ORDER: LateralBand[] = ["CUTTABLE", "UNKNOWN", "USED"]

function roleLabel(role: LateralReachRole): string {
  return role.role_name || role.role_arn.split("/").pop() || role.role_arn
}

function RoleRow({ role, band }: { role: LateralReachRole; band: LateralBand }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1 text-[11px]">
      <span className="font-medium text-foreground">{roleLabel(role)}</span>

      {role.reach_kind === "WILDCARD" ? (
        <span
          className="rounded border border-border px-1 py-px text-[9px] uppercase tracking-wide text-muted-foreground"
          title='Granted via Resource:"*" — this role reaches every resource of this service, not just this one.'
        >
          wildcard grant
        </span>
      ) : role.reach_kind === "SCOPED" ? (
        <span
          className="rounded border border-border px-1 py-px text-[9px] uppercase tracking-wide text-muted-foreground"
          title="Granted by an explicit ARN match on this resource."
        >
          scoped grant
        </span>
      ) : null}

      {band === "CUTTABLE" ? (
        <span className="text-muted-foreground">
          observed on {role.observed_on_service} other resource
          {role.observed_on_service === 1 ? "" : "s"} · never here
        </span>
      ) : band === "USED" ? (
        <span className="text-muted-foreground">
          {role.observed_on_this_jewel} observation
          {role.observed_on_this_jewel === 1 ? "" : "s"} on this jewel
        </span>
      ) : (
        <span className="text-muted-foreground">{role.reason ?? "not observed"}</span>
      )}
    </li>
  )
}

export function LateralReachBands({
  data,
  loading,
  error,
  jewelLabel,
}: {
  data: LateralReachPayload | null
  loading: boolean
  error: string | null
  jewelLabel: string
}) {
  if (loading && !data) {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Computing who can reach {jewelLabel}…
      </p>
    )
  }

  if (error && !data) {
    // Never fall back to an empty cut list — "nothing reaches this jewel" is a
    // far more dangerous thing to imply than a visible failure.
    return (
      <p
        className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-800 dark:text-amber-200"
        data-empty-state="ERROR"
      >
        <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
        Reach analysis unavailable ({error}) — this is not a clean bill of
        health; nothing was evaluated.
      </p>
    )
  }

  if (!data) return null

  if (!data.supported) {
    return (
      <p className="mt-2 text-[11px] text-muted-foreground" data-empty-state="UNSUPPORTED">
        Reach analysis does not cover {data.jewel_label} yet — not evaluated,
        not clear.
      </p>
    )
  }

  const { counts, bands } = data

  if (counts.reachable_total === 0) {
    return (
      <p className="mt-2 text-[11px] text-muted-foreground" data-empty-state="READY_ZERO">
        No identity holds a policy grant that reaches {jewelLabel}.
      </p>
    )
  }

  return (
    <div className="mt-2.5" data-testid="lateral-reach-bands">
      <div className="flex flex-wrap items-baseline gap-x-2 text-[11px]">
        <span className="font-semibold text-foreground">
          {counts.reachable_total} identit
          {counts.reachable_total === 1 ? "y" : "ies"} can reach {jewelLabel}
        </span>
        <span className="text-amber-700 dark:text-amber-300">
          {counts.CUTTABLE} never used it
        </span>
        {/* Always shown, never collapsed — see the file header. */}
        <span className="text-muted-foreground" data-testid="lateral-reach-unjudgeable">
          · {data.unjudgeable} cannot be judged
        </span>
      </div>

      <div className="mt-2 space-y-2">
        {BAND_ORDER.map((band) => {
          const roles = bands[band] ?? []
          if (roles.length === 0) return null
          const meta = BAND_META[band]
          const { Icon } = meta
          return (
            <div
              key={band}
              className={`rounded-md border px-2.5 py-2 ${meta.tone}`}
              data-band={band}
            >
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-foreground">
                <Icon className="h-3 w-3" />
                {meta.label}
                <span className="font-normal text-muted-foreground">({roles.length})</span>
              </div>
              <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                {meta.blurb}
              </p>
              <ul className="mt-1 divide-y divide-border/50">
                {roles.map((role) => (
                  <RoleRow key={`${band}:${role.role_arn}`} role={role} band={band} />
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}
