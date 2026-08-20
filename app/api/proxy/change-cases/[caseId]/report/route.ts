import { NextRequest } from 'next/server'
import { forwardChangeCase } from '@/lib/server/change-case-proxy'

export async function GET(request: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params
  return forwardChangeCase(request, `/api/change-cases/${encodeURIComponent(caseId)}/report`, 'GET')
}
