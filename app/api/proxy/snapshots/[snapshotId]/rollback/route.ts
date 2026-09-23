import { NextResponse } from 'next/server'

// No in-repo SG or S3 caller uses this untyped dispatcher. Those resources
// have their own rollback routes; IAM requires exact scoped operation proof.
export async function POST() {
  return NextResponse.json({ success: false, detail: { code: 'SNAPSHOT_RESTORE_TYPE_AND_OPERATION_REQUIRED' } }, { status: 422 })
}
