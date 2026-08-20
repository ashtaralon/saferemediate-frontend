import { NextRequest } from 'next/server'
import { forwardChangeCase } from '@/lib/server/change-case-proxy'

export async function GET(request: NextRequest) {
  const query = new URL(request.url).search
  return forwardChangeCase(request, `/api/change-cases${query}`, 'GET')
}
