import { NextRequest, NextResponse } from "next/server";
import { getBackendBaseUrl } from "@/lib/server/backend-url";
import {
  ERROR_ORIGIN_HEADER,
  allowlistedBackendDetail,
  fromCaughtError,
  reviewProxyStatus,
} from "@/lib/server/proxy-error";

const BACKEND_URL = getBackendBaseUrl();

// Every failure used to be answered with permissions = [] and policies = []
// (a 200 on a backend error, a timeout, or an exception): "this role has no
// permissions" presented as a successful read. A failure is now the house
// error shape (lib/server/proxy-error, as the LP issues and metrics proxies
// answer it): a non-2xx status, allowlisted typed detail only, no permission
// list. Failures are never cacheable.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roleName: string }> }
) {
  const { roleName } = await params;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    // Try to get permissions from gap-analysis endpoint
    const response = await fetch(
      `${BACKEND_URL}/api/iam-roles/${encodeURIComponent(roleName)}/gap-analysis?days=90`,
      {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        }
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      const raw = await response.text().catch(() => "");
      const detail = allowlistedBackendDetail(raw);
      console.error(`[proxy] IAM permissions backend ${response.status}: code=${detail?.code ?? "none"}`);
      return NextResponse.json(
        {
          error: `IAM role permissions backend returned ${response.status}`,
          ...(detail ? { detail } : {}),
          backendStatus: response.status,
          origin: "backend",
        },
        {
          status: reviewProxyStatus(response.status),
          headers: { "Cache-Control": "no-store", [ERROR_ORIGIN_HEADER]: "backend" },
        },
      );
    }

    const gapData = await response.json();

    // Extract permissions from gap analysis
    const allPermissions = new Set<string>();

    // Collect from policy analysis
    if (gapData.policy_analysis) {
      gapData.policy_analysis.forEach((p: any) => {
        const perms = p.all_permissions || p.permissions || [];
        perms.forEach((perm: string) => allPermissions.add(perm));
      });
    }

    // Also add top-level permissions
    if (gapData.allowed_actions_list) {
      gapData.allowed_actions_list.forEach((perm: string) => allPermissions.add(perm));
    }

    return NextResponse.json({
      role_arn: gapData.role_arn || `arn:aws:iam::${process.env.AWS_ACCOUNT_ID || 'unknown'}:role/${roleName}`,
      permissions: Array.from(allPermissions),
      policies: gapData.policy_analysis || []
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
      }
    });

  } catch (error: unknown) {
    console.error('[proxy] IAM permissions error:', error instanceof Error ? error.message : error);
    // AbortError -> 504, anything else -> 503; no permission list either way.
    const failed = fromCaughtError(error);
    failed.headers.set(ERROR_ORIGIN_HEADER, "proxy");
    return failed;
  }
}
