import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-f.onrender.com";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const region = searchParams.get('region') || 'eu-west-1';
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    // Try to fetch from resource-view API or return empty structure
    const response = await fetch(
      `${BACKEND_URL}/api/resource-view/?resource_type=Secret&region=${encodeURIComponent(region)}`,
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
        secrets: []
      });
    }
    
    const data = await response.json();
    
    // Transform resource-view format to expected format
    const secrets = data.resources?.filter((r: any) => r.type === 'Secret' || r.type === 'SecretsManager') || [];
    
    return NextResponse.json({
      secrets: secrets
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
      }
    });
    
  } catch (error: any) {
    console.error('[proxy] Secrets error:', error.message);
    // Return empty structure instead of error
    return NextResponse.json({
      secrets: []
    }, { status: 200 });
  }
}

