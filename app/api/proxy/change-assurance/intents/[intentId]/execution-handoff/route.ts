import { NextRequest } from 'next/server'
import { forwardChangeAssurance } from '@/lib/server/change-assurance-proxy'

export const maxDuration = 180

export async function POST(request: NextRequest, { params }: { params: Promise<{ intentId: string }> }) {
  const { intentId } = await params
  return forwardChangeAssurance(
    request,
    `/api/change-assurance/intents/${encodeURIComponent(intentId)}/execution-handoff`,
    'POST',
  )
}
