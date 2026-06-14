// Shared friendly-name resolution for the attack-path light surfaces.
//
// WHY THIS EXISTS: the facade serializes some principal nodes by their opaque
// AWS IAM unique id (AROA…/AIDA…/AKIA…/ASIA…) rather than a human role name. The
// lede resolves identity via the compiler's role_name, but the map and the
// lateral-movement view render raw node names — so without this, an `AROA…`
// string leaks into the UI the operator can't read. One resolver, used by both
// the map spine (friendlyNodeName) and the lateral derivation, keeps them in
// sync (no per-surface drift like the map-fixed-but-lateral-leaked regression).

/** True for an opaque AWS IAM unique id (no human meaning on its own). */
export function isOpaqueIamId(s?: string | null): boolean {
  return /^(AROA|AIDA|AKIA|ASIA)[A-Z0-9]{6,}$/.test((s ?? "").trim())
}

/** The backend mints "(orphan role: <role>)" as an INTERNAL marker for
 *  orphan-role paths (phase3 materialization). It must never render — the role
 *  itself is the meaningful label — so we unwrap it everywhere a node name or
 *  source label flows through this resolver (defends the header chip + spine
 *  against the placeholder leak the backend report can still carry pre-deploy). */
const ORPHAN_ROLE_RE = /^\(orphan role:\s*(.+?)\)\s*$/i

/** Resolve a human-readable label for a resource/principal name.
 *  - "(orphan role: foo)" placeholder → "foo" (internal marker, never rendered)
 *  - ARN → last path segment ("arn:aws:iam::…:role/foo" → "foo")
 *  - "x:::y" snapshot ids → the "y" half
 *  - opaque IAM unique id → a readable type ("assumed role", "IAM user", …)
 *  - anything else → returned as-is. */
export function friendlyResourceName(rawName?: string | null, type?: string | null): string {
  let raw = (rawName ?? "").trim()
  if (!raw) return type || "resource"
  const orphan = raw.match(ORPHAN_ROLE_RE)
  if (orphan) raw = orphan[1].trim()
  if (raw.includes(":::")) return raw.split(":::")[1] || raw
  if (raw.startsWith("arn:")) {
    const tail = raw.split("/").pop()
    if (tail) return tail
  }
  if (isOpaqueIamId(raw)) {
    if (type === "IAMUser") return "IAM user"
    if (type === "AccessKey") return "access key"
    if (type === "STSSession") return "assumed-role session"
    return "assumed role"
  }
  return raw
}
