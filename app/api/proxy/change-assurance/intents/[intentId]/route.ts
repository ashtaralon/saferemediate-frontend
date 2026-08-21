import { NextRequest } from 'next/server'
import { forwardChangeAssurance } from '@/lib/server/change-assurance-proxy'

export async function GET(request: NextRequest, { params }: { params: Promise<{ intentId: string }> }) {
  const { intentId } = await params
  return forwardChangeAssurance(request, `/api/change-assurance/intents/${encodeURIComponent(intentId)}${new URL(request.url).search}`, 'GET')
}
