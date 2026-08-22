import { NextRequest } from 'next/server'
import { forwardChangeAssurance } from '@/lib/server/change-assurance-proxy'

export async function GET(request: NextRequest) {
  return forwardChangeAssurance(
    request,
    `/api/change-assurance/targets${new URL(request.url).search}`,
    'GET',
  )
}
