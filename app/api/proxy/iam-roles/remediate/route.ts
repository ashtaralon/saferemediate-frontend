import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-f.onrender.com";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    console.log(`[IAM-REMEDIATE] Remediating role: ${body.role_name}`);
    console.log(`[IAM-REMEDIATE] Removing ${body.permissions_to_remove?.length || 0} permissions`);
    console.log(`[IAM-REMEDIATE] Create snapshot: ${body.create_snapshot}`);
    console.log(`[IAM-REMEDIATE] Detach managed policies: ${body.detach_managed_policies}`);

    // Ensure managed policies can be detached by default
    // This is required for roles that use AWS managed policies like AlonIAMTest
    const requestBody = {
      ...body,
      detach_managed_policies: body.detach_managed_policies ?? true,  // Default to true
      create_snapshot: body.create_snapshot ?? true,                   // Default to true
    };

    const response = await fetch(`${BACKEND_URL}/api/iam-roles/remediate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error(`[IAM-REMEDIATE] Error:`, data);
      return NextResponse.json(
        { error: data.detail || data.error || 'Remediation failed' },
        { status: response.status }
      );
    }
    
    console.log(`[IAM-REMEDIATE] Success:`, data);
    return NextResponse.json(data);
    
  } catch (error: any) {
    console.error(`[IAM-REMEDIATE] Exception:`, error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}




