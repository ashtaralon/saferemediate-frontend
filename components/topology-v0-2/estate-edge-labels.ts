/**
 * Estate Map edge-label grammar — keep observed/config/system cases distinct.
 */

/** Flow-Log public-IP exposure on a DB engine port (not "N systems"). */
export function databasePublicIpExposureLabel(
  externalSources: number,
  port: number | null | undefined,
): string | null {
  if (!externalSources || externalSources <= 0) return null
  const n = Math.floor(externalSources)
  const ipWord = n === 1 ? "public IP" : "public IPs"
  if (port != null) return `${n} ${ipWord} on :${port}`
  return `${n} ${ipWord} on RDS`
}
