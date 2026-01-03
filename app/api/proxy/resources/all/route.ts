import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-f.onrender.com";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const regions = searchParams.get('regions') || 'eu-west-1';
  const includeGlobal = searchParams.get('includeGlobal') !== 'false';
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout for full scan
    
    const response = await fetch(
      `${BACKEND_URL}/api/resources/all?regions=${encodeURIComponent(regions)}&include_global=${includeGlobal}`,
      { 
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        }
      }
    );
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }
    
    const data = await response.json();
    
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
      }
    });
    
  } catch (error: any) {
    console.error('[proxy] Extended resources error:', error.message);
    return NextResponse.json(
      { error: error.message, resources: {}, summary: {} },
      { status: 500 }
    );
  }
}



