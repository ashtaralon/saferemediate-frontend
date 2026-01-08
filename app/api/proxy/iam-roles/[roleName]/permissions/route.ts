import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-f.onrender.com";

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
      // Return empty structure instead of error
      return NextResponse.json({
        role_arn: `arn:aws:iam::${process.env.AWS_ACCOUNT_ID || 'unknown'}:role/${roleName}`,
        permissions: [],
        policies: []
      });
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
    
  } catch (error: any) {
    console.error('[proxy] IAM permissions error:', error.message);
    // Return empty structure instead of error
    return NextResponse.json({
      role_arn: `arn:aws:iam::${process.env.AWS_ACCOUNT_ID || 'unknown'}:role/${roleName}`,
      permissions: [],
      policies: []
    }, { status: 200 });
  }
}

