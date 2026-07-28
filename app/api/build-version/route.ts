import { NextResponse } from "next/server"
import { normalizeDeploymentVersion } from "@/lib/deployment-version"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET() {
  const deploymentVersion =
    normalizeDeploymentVersion(process.env.VERCEL_GIT_COMMIT_SHA) ??
    normalizeDeploymentVersion(process.env.NEXT_PUBLIC_DEPLOYMENT_VERSION) ??
    "development"

  return NextResponse.json(
    { deploymentVersion },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "CDN-Cache-Control": "no-store",
        "Vercel-CDN-Cache-Control": "no-store",
      },
    },
  )
}
