import { NextResponse } from "next/server";

/**
 * DISABLED 2026-08-16 — this route previously held hardcoded production
 * database credentials as fallback values and let any deployment of this
 * frontend query the production graph directly, bypassing the backend.
 * No UI code calls it (verified). The graph is only reachable through the
 * backend service. Credentials that appeared here are being rotated.
 */
export async function POST() {
  return NextResponse.json(
    { error: "This route is permanently disabled. Graph access goes through the backend service." },
    { status: 410 }
  );
}

export async function GET() {
  return NextResponse.json(
    { error: "This route is permanently disabled. Graph access goes through the backend service." },
    { status: 410 }
  );
}
