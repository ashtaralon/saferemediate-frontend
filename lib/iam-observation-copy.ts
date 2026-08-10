/**
 * Inventory usage is an observation, not a remediation decision.
 *
 * Keep this wording separate from Preview's safety-qualified counts so raw
 * non-use can never be presented as an instruction to remove a permission.
 */
export function iamObservationCopy(unusedCount: number, total: number, usedCount: number) {
  return {
    summary: `${unusedCount} of ${total} permissions had no observed usage — ${usedCount} were observed in use`,
    usedLabel: `${usedCount} observed in use`,
    notObservedLabel: `${unusedCount} not observed`,
  }
}
