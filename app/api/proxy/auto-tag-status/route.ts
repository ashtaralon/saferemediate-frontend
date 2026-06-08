import { NextResponse } from "next/server"

// Mirror of /api/proxy/auto-tag/status — different URL shape, same
// "auto-tag not wired on backend" reality (verified 2026-05-04: backend
// returns 404 for both /api/auto-tag/status and /api/auto-tag-status).
//
// Returns honest `wired: false` + zero counters per
// feedback_no_mock_numbers_in_ui.md. The previous version of this file
// returned hardcoded `actual_traffic: 15` and other fabricated numbers,
// which the consuming UI trusted as real auto-tag activity.

const NOT_WIRED_RESPONSE = {
  success: false,
  wired: false,
  status: "not_wired" as const,
  total_cycles: 0,
  actual_traffic: 0,
  last_sync: null,
  tagged: 0,
  untagged: 0,
  total: 0,
  lastScan: null,
  message: "Auto-tag scheduler is not configured on this backend.",
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const systemName = searchParams.get("systemName") || ""
  return NextResponse.json({ ...NOT_WIRED_RESPONSE, systemName })
}
