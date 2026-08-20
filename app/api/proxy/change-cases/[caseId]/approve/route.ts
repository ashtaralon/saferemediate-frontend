import { NextRequest } from 'next/server'
import { forwardChangeCase } from '@/lib/server/change-case-proxy'

export const maxDuration = 120

export async function POST(request: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params
  return forwardChangeCase(request, `/api/change-cases/${encodeURIComponent(caseId)}/approve`, 'POST')
}
