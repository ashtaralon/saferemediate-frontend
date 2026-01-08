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
      `${BACKEND_URL}/api/resource-view/?resource_type=KMSKey&region=${encodeURIComponent(region)}`,
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
        kms_keys: [],
        keys: []
      });
    }
    
    const data = await response.json();
    
    // Transform resource-view format to expected format
    const kmsKeys = data.resources?.filter((r: any) => r.type === 'KMSKey') || [];
    
    return NextResponse.json({
      kms_keys: kmsKeys,
      keys: kmsKeys
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
      }
    });
    
  } catch (error: any) {
    console.error('[proxy] KMS keys error:', error.message);
    // Return empty structure instead of error
    return NextResponse.json({
      kms_keys: [],
      keys: []
    }, { status: 200 });
  }
}

