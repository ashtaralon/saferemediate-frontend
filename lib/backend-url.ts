/**
 * Single source of truth for the backend base URL.
 *
 * FAIL-CLOSED: there is deliberately no hardcoded fallback. A deployment
 * without an explicit backend URL must error loudly rather than silently
 * talk to another environment's backend (the cross-tenant leak this file
 * exists to prevent — found 2026-08-16 when a fresh customer stack rendered
 * production data).
 */
export function requireBackendUrl(): string {
  const url =
    process.env.BACKEND_URL_OVERRIDE ||
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL;
  if (!url) {
    throw new Error(
      "Backend URL not configured. Set BACKEND_URL (or NEXT_PUBLIC_BACKEND_URL) on this deployment. Refusing to fall back to a hardcoded environment."
    );
  }
  return url.replace(/\/+$/, "");
}
