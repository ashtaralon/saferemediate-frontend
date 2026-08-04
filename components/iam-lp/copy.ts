export const IAM_LP_COPY = {
  overPrivileged: "This role is over-privileged.",
  matchesObserved: "This role matches observed use.",
  support: (total: number, used: number) =>
    `It can do ${total} things. We observed it needs ${used}.`,
  chipObserved: (days: number, events: number) =>
    `Observed · ${days}d · ${events} events`,
  chipBlocked: "Blocked",
  chipSplit: (auto: number, approval: number) =>
    `${auto} auto-apply · ${approval} need approval`,
  chipRollbackReady: "Rollback ready",
  chipSnapshotOnApply: "Snapshot on apply",
  applySafe: (n: number) => `Apply safe set (${n})`,
  requestApproval: (n: number) => `Request approval (${n})`,
  simulate: "Simulate change",
} as const
