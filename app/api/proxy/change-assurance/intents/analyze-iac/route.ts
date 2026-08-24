import { NextRequest } from 'next/server'
import { forwardChangeAssurance } from '@/lib/server/change-assurance-proxy'

export const maxDuration = 180

export async function POST(request: NextRequest) {
  return forwardChangeAssurance(request, '/api/change-assurance/intents/analyze-iac', 'POST')
}
