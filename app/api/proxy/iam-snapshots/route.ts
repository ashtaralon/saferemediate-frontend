import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-f.onrender.com";

export async function GET(req: NextRequest) {
  try {
    console.log(`[IAM-SNAPSHOTS] Fetching IAM snapshots`);
    
    const response = await fetch(`${BACKEND_URL}/api/iam-snapshots`, {
      cache: 'no-store'
    });
    
    if (!response.ok) {
      // If endpoint doesn't exist yet, return empty array
      if (response.status === 404) {
        console.log(`[IAM-SNAPSHOTS] Endpoint not found, returning empty array`);
        return NextResponse.json([]);
      }
      
      const errorData = await response.json().catch(() => ({}));
      console.error(`[IAM-SNAPSHOTS] Error:`, errorData);
      return NextResponse.json(
        { error: errorData.detail || 'Failed to fetch snapshots' },
        { status: response.status }
      );
    }
    
    const data = await response.json();
    console.log(`[IAM-SNAPSHOTS] Got ${Array.isArray(data) ? data.length : data.snapshots?.length || 0} snapshots`);
    return NextResponse.json(data);
    
  } catch (error: any) {
    console.error(`[IAM-SNAPSHOTS] Exception:`, error);
    // Return empty array on error so UI doesn't break
    return NextResponse.json([]);
  }
}

