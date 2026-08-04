export const IAM_LP_COPY = {
  overPrivileged: "This role is over-privileged.",
  matchesObserved: "This role matches observed use.",
  authorityUnknown: "Permission authority is not ready.",
  support: (total: number | null, used: number | null) =>
    `It can do ${total ?? "an unverified number of"} things. We observed it needs ${used ?? "an unverified number"}.`,
  chipObserved: (days: number | null, events: number | null) =>
    `Observed · ${days ?? "—"}d · ${events ?? "—"} events`,
  chipBlocked: "Blocked",
  chipSplit: (auto: number, approval: number) =>
    `${auto} auto-apply · ${approval} need approval`,
  chipRollbackReady: "Rollback ready",
  chipSnapshotOnApply: "Snapshot on apply",
  applySafe: (n: number) => `Apply safe set (${n})`,
  requestApproval: (n: number) => `Request approval (${n})`,
  simulate: "Simulate change",
} as const
