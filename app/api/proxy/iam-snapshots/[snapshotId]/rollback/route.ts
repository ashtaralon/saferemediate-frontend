import { NextResponse } from 'next/server'

// IAM restore authority is the exact operation-bound POST at
// /api/proxy/iam-roles/rollback. A checkpoint id in a URL is insufficient.
export async function POST() {
  return NextResponse.json({ success: false, detail: { code: 'IAM_EXACT_OPERATION_REQUIRED' } }, { status: 422 })
}
