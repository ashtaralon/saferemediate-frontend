export function safeBackendErrorDetail(detail: string, status: number): string {
  const trimmed = detail.trim()
  if (/^\s*<!doctype\s+html/i.test(trimmed) || /^\s*<html[\s>]/i.test(trimmed)) {
    return `Backend service unavailable (HTTP ${status}). Retry after service recovery.`
  }
  return trimmed.slice(0, 1200) || `Backend request failed (HTTP ${status})`
}
